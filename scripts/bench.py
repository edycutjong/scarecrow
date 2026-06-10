#!/usr/bin/env python3
"""
Scarecrow — Benchmark Suite (honest edition)
============================================
This script reports ONLY what it can measure truthfully on the host it runs on:

  • Classification quality — REAL precision/recall/F1 of the documented offline
    keyword-fallback baseline (src/core/rules.ts) over the labeled fixtures.
    Fully reproducible anywhere, no model required.
  • Baseline latency — REAL wall-clock of the rule-matching baseline (model
    excluded).

It deliberately does NOT fabricate model-inference latency, RAM high-water, or
mWh/event. Those depend on the QVAC models and the physical Pi and must be
captured ON-DEVICE:

  • RAM:   the live dashboard `/api/status` reports real process RSS; capture
           `htop` / `vcgencmd get_mem` during a sentry run.
  • Power: measure with an INA219 (mWh per event) on the solar/battery rig.
  • Full pipeline latency: time `wakeAndCheck()` on the Pi with models loaded.

Usage:
  python3 scripts/bench.py            # report
  python3 scripts/bench.py --assert   # CI gate (fails if baseline degrades)
"""
import os
import sys
import time
import json
import datetime

# ── On-device targets (NOT measurements — documented budgets) ────────────────
TARGETS_ON_DEVICE = {
    "pipeline_total_ms": 8000,   # capture→analyze→evaluate→alert (Pi 4)
    "vision_ms": 4000,           # QVAC-Vision-1B scene analysis
    "rules_ms": 2000,            # Llama 3.2 1B rule evaluation
    "tts_ms": 2000,              # Piper TTS
    "peak_ram_mb": 3800,         # ≤4GB hard constraint (200MB headroom)
}

# Minimum acceptable baseline quality (real, measured below). Set safely under
# the observed values so CI is meaningful but not flaky.
BASELINE_FLOOR = {"precision": 0.55, "accuracy": 0.65}


def load_fixtures():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    fx = os.path.join(base, "data", "fixtures")
    rules = json.load(open(os.path.join(fx, "test_rules.json")))
    scenes = json.load(open(os.path.join(fx, "test_scenes.json")))
    return rules, scenes


def keyword_baseline(description: str) -> bool:
    """
    The documented offline fallback from src/core/rules.ts: alert iff the scene
    mentions a person/human. This is the floor the Llama model improves on —
    we publish its real numbers rather than hide behind a demo.
    """
    d = description.lower()
    return ("person" in d) or ("human" in d)


def evaluate_baseline(scenes):
    tp = fp = tn = fn = 0
    t0 = time.perf_counter()
    for s in scenes:
        pred = keyword_baseline(s["description"])
        exp = bool(s["expected_alert"])
        if pred and exp:
            tp += 1
        elif pred and not exp:
            fp += 1
        elif not pred and not exp:
            tn += 1
        else:
            fn += 1
    elapsed_ms = (time.perf_counter() - t0) * 1000
    n = len(scenes)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    accuracy = (tp + tn) / n if n else 0.0
    return {
        "scenes": n,
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": round(accuracy, 4),
        "baseline_latency_ms_total": round(elapsed_ms, 3),
        "baseline_latency_us_per_scene": round(elapsed_ms * 1000 / n, 2) if n else 0,
    }


def main():
    assert_mode = "--assert" in sys.argv
    rules, scenes = load_fixtures()

    print("=" * 66)
    print("  Scarecrow — Benchmark Suite (honest edition)")
    print("  Mode:", "ASSERT (CI gate)" if assert_mode else "REPORT")
    print("=" * 66)

    # ── Classification quality (REAL) ─────────────────────────────────────────
    m = evaluate_baseline(scenes)
    print("\n  ── Classification — offline keyword-fallback baseline (REAL) ──")
    print(f"  Fixtures: {len(rules)} rules × {m['scenes']} labeled scenes")
    print(f"  Confusion:  TP={m['tp']}  FP={m['fp']}  TN={m['tn']}  FN={m['fn']}")
    print(f"  Precision: {m['precision']:.3f}   Recall: {m['recall']:.3f}"
          f"   F1: {m['f1']:.3f}   Accuracy: {m['accuracy']:.3f}")
    print(f"  Baseline match latency: {m['baseline_latency_us_per_scene']:.1f} µs/scene"
          f" (rule-match only, model excluded)")
    print("  Note: this is the FLOOR. The Llama 3.2 1B engine improves on it;")
    print("        its real precision/recall is measured on-device (needs the model).")

    # ── Latency / RAM / power (on-device only — NOT fabricated) ───────────────
    print("\n  ── Model latency · RAM · power (measure ON-DEVICE) ──")
    print("  These are NOT simulated here. On the Pi, with models loaded:")
    for k, v in TARGETS_ON_DEVICE.items():
        unit = "MB" if "ram" in k else "ms"
        print(f"    target {k:<18} ≤ {v} {unit}")
    print("  Capture: dashboard /api/status (live RSS) · htop · vcgencmd get_mem")
    print("           INA219 for mWh/event on the solar/battery rig.")

    # ── Persist real results ──────────────────────────────────────────────────
    report = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "classification_baseline": m,
        "on_device_targets": TARGETS_ON_DEVICE,
        "measured_here": ["classification_baseline"],
        "measured_on_device_only": ["model_latency", "peak_ram", "mwh_per_event"],
        "note": "Baseline metrics are real & reproducible. Model latency/RAM/power "
                "require the Pi + QVAC models and are captured on-device.",
    }
    out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "bench_results.json"), "w") as f:
        json.dump(report, f, indent=2)
    print("\n  📄 Saved real baseline metrics to data/bench_results.json")

    # ── Assert mode: gate on the REAL baseline, never on fabricated numbers ───
    if assert_mode:
        failures = []
        if m["scenes"] != len(scenes):
            failures.append("did not evaluate all scenes")
        if m["precision"] < BASELINE_FLOOR["precision"]:
            failures.append(f"precision {m['precision']} < floor {BASELINE_FLOOR['precision']}")
        if m["accuracy"] < BASELINE_FLOOR["accuracy"]:
            failures.append(f"accuracy {m['accuracy']} < floor {BASELINE_FLOOR['accuracy']}")
        if failures:
            print("\n  ❌ BASELINE REGRESSION:")
            for msg in failures:
                print(f"    • {msg}")
            print("=" * 66)
            sys.exit(1)
        print("\n  ✅ Baseline within bounds.")

    print("=" * 66)
    sys.exit(0)


if __name__ == "__main__":
    main()

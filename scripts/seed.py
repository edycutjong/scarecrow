#!/usr/bin/env python3
"""Scarecrow — Seed Script. Usage: python3 scripts/seed.py

Seeds 30 rules and 233 test scenes covering comprehensive edge cases:
- Adversarial evasion, false-positive traps, camera failures
- Weather extremes, reflections, insects/lens occlusion
- Benign daily activity, compound ambiguity, pareidolia
"""
import os
import json


def main():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    fixtures = os.path.join(base, 'data', 'fixtures')
    os.makedirs(fixtures, exist_ok=True)

    # ── Load from canonical fixture files ─────────────────────────────────────
    rules_path = os.path.join(fixtures, 'test_rules.json')
    scenes_path = os.path.join(fixtures, 'test_scenes.json')

    if os.path.isfile(rules_path) and os.path.isfile(scenes_path):
        with open(rules_path) as f:
            rules = json.load(f)
        with open(scenes_path) as f:
            scenes = json.load(f)
    else:
        # Fallback: generate minimal seed data if fixtures don't exist
        rules = [
            {"id": "1", "condition": "A person is near the shed or approaching", "action": "alert"},
            {"id": "2", "condition": "A dog or animal is present", "action": "ignore"},
        ]
        scenes = [
            {"description": "A person approaching the shed", "expected_rule": "1", "expected_alert": True},
            {"description": "A dog on the porch", "expected_rule": "2", "expected_alert": False},
            {"description": "Empty yard", "expected_rule": None, "expected_alert": False},
        ]
        with open(rules_path, 'w') as f:
            json.dump(rules, f, indent=2)
        with open(scenes_path, 'w') as f:
            json.dump(scenes, f, indent=2)

    print(f"[seed] Written {len(rules)} test rules")
    print(f"[seed] Written {len(scenes)} test scenes")

    # ── Validate ──────────────────────────────────────────────────────────────
    rule_ids = {r["id"] for r in rules}
    alerts = sum(1 for s in scenes if s["expected_alert"])
    nulls = sum(1 for s in scenes if s["expected_rule"] is None)
    bad = [s for s in scenes if s["expected_rule"] is not None and s["expected_rule"] not in rule_ids]
    if bad:
        print(f"[seed] ⚠️  {len(bad)} scenes reference unknown rule IDs: {[s['expected_rule'] for s in bad]}")
    else:
        print(f"[seed] ✅ All scene rules validated ({alerts} alerts, {len(scenes) - alerts} ignores, {nulls} null-match)")

    # ── Manifest ──────────────────────────────────────────────────────────────
    manifest = {
        'seeded_at': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'rules': len(rules),
        'scenes': len(scenes),
        'alerts': alerts,
        'ignores': len(scenes) - alerts,
        'null_matches': nulls,
    }
    with open(os.path.join(base, 'data', 'seed_manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print("[seed] ✅ Seed complete.")


if __name__ == '__main__':
    main()

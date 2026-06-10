# 🎬 Demo Capture Guide — Screenshots & Video

How to produce the submission's **evidence bundle**: polished UI screenshots
(laptop) + the credibility-critical hardware video (real Pi). Aligns with the
[`DEMO.md`](../DEMO.md) runbook and the hackathon's mandatory evidence
requirement (*hardware logs + performance diagnostics + video of local-only
execution*).

> **Device strategy.** Capture the **UI on a laptop** (crisp, fast); capture the
> **proof on the Pi** (RAM ≤4GB, real inference, spoken alert, internet
> unplugged). A laptop-only demo reads as vaporware for the Tinkerer track.

---

## 1. Dashboard screenshots — laptop (done / repeatable)

Already generated in [`docs/screenshots/`](screenshots/) via headless Chrome
against the offline **simulation** (cycles person/dog/vehicle so we catch the
alert state with the detection box):

```bash
bash scripts/capture-screenshots.sh
```

| File | Shows |
|---|---|
| `dashboard-alert.png` | **Hero** — THREAT DETECTED, `PERSON · 0.94` bbox, live stats, Piper TTS line |
| `dashboard-scanning.png` | Beam sweep mid-pipeline (vision/rules stage) |
| `dashboard-clear.png` | Perimeter clear / sleeping |

**LIVE-mode shots (real RSS + `SIM` telemetry badges)** must come from the Pi —
run `npm start` there and screenshot `http://192.168.4.1:8080`.

---

## 2. Hardware evidence — Raspberry Pi (required)

Capture these on the actual Pi 4/5. They are the parts judges scrutinize.

```bash
# One-time provisioning
bash scripts/setup-pi.sh            # camera, audio, Node, deps
bash scripts/setup-pi.sh --ap       # + Scarecrow-AP hotspot

# Boot the sentry + dashboard
npm start                           # → http://192.168.4.1:8080
```

**Screenshots / captures to grab on the Pi:**

- [ ] `htop` (or `free -h`) showing total RAM **≤4 GB** and the node process **under the cap**
- [ ] `vcgencmd get_mem arm && vcgencmd measure_temp` (memory split + thermals)
- [ ] Dashboard LIVE mode showing a **real** event (real RSS in the RAM gauge)
- [ ] `python3 scripts/verify_offline.py` with **Ethernet unplugged / Wi-Fi-to-internet off** → all green, "air-gapped"
- [ ] `python3 scripts/bench.py` output (real baseline precision/recall) + your on-device latency notes
- [ ] If you have an INA219: a power reading → fill in **mWh/event** and projected battery life

> Pipe real sensor power into the dashboard so the `SIM` badges flip to live:
> `SCARECROW_BATTERY_PCT=82 SCARECROW_SOLAR_W=14 npm start`

---

## 2b. Test clips as camera stimulus (AI-generated or stock) — allowed

If you can't stage a live dog/person, you may **play a clip to the camera** (or
feed it through the capture path) as the scene input — `DEMO.md` explicitly
allows this. The clip is the *stimulus*; **the inference, dashboard, spoken
alert and RAM readout must be real and recorded live.**

> ⚠️ **Integrity line.** Generating clips for the camera to look at = fine.
> Generating a fake dashboard / fake RAM / fake "execution" video = a faked
> verification bundle → disqualification. Keep the system output 100% real and
> label clips as "test clip played to camera."

**Ready-to-use video-gen prompts** (1080p, **16:9, locked/static camera** to
mimic a fixed sentry cam, 6–10 s, no camera movement, slight CCTV grain):

| Clip | Expected | Prompt |
|---|---|---|
| `person_near_shed` | 🔴 ALERT | "Fixed security-camera wide shot of a backyard at dusk. A person in a dark hoodie walks slowly toward a wooden garden shed door. Static camera, slight grain, no zoom." |
| `dog_past_shed` | ✅ IGNORE | "Fixed security-camera wide shot of a sunny backyard. A golden retriever trots left-to-right across the lawn past a wooden shed. Static camera, no people." |
| `vehicle_driveway` | 🔴 ALERT | "Fixed security-camera shot of a gravel driveway, daytime. A pickup truck pulls in and stops. Static camera, wide angle." |
| `empty_yard` | ✅ CLEAR | "Fixed security-camera shot of an empty backyard with a shed, gentle wind moving tree branches, no people or animals. Static camera." |
| `known_truck` (RAG) | ✅ IGNORE after teaching | "Fixed security-camera shot of a silver pickup truck parked in a driveway, daytime, clearly visible. Static camera." |

Save them to `data/fixtures/clips/` so `seed.py` / the demo runbook can replay
them deterministically. For the RAG beat: teach *"My silver truck — silver
pickup"* on the dashboard, then replay `known_truck` and show the alert
**suppressed** live.

---

## 3. The ≤3-minute video — storyboard

Keep it physical, constrained, offline. Suggested cut (~2:45):

| Time | Shot | Script beat |
|---|---|---|
| 0:00–0:15 | The rig on a table (Pi + camera + speaker + battery/solar) | "A $50 off-grid AI sentry. No cloud, no Wi-Fi, no subscription." |
| 0:15–0:35 | Laptop/phone joined to **Scarecrow-AP**, dashboard open | "Everything runs on this Pi — dashboard served from its own hotspot." |
| 0:35–0:55 | Dashboard: **add a rule** live → *"Alert if a person is near the shed. Ignore the dog."* | "Rules are plain English, reasoned by Llama 3.2 1B on-device." |
| 0:55–1:25 | **Walk a dog** past the camera (or play `dog` clip) | Event logs **CLEAR — ignored (animal)**. No sound. "This is reasoning, not motion detection." |
| 1:25–2:00 | **Walk toward the shed** (or play `person` clip) | Scarecrow **speaks**: *"Person detected near the shed."* Red alert + bbox on screen. |
| 2:00–2:20 | (Optional) **Teach a known entity** → re-show your car → no alert | "RAG remembers your truck; a stranger's still trips it." |
| 2:20–2:40 | **Unplug Ethernet** / show `verify_offline.py` green + `htop` ≤4GB | "Internet unplugged. Still works. Under 4 GB. On battery." |
| 2:40–2:45 | Logo / repo URL | "Scarecrow. Edge AI that sees, understands, and speaks — offline." |

**Recording tips**
- Show the **memory readout and the unplugged cable in the same frame** as a live alert — that single shot is the whole pitch.
- Capture the **spoken alert** with real audio (don't dub it).
- One continuous take for the dog→person sequence is more convincing than cuts.
- 1080p is plenty; vertical b-roll of the rig is nice for the X/Build-in-Public thread.

---

## 4. Pre-flight checklist

- [ ] `npm run ci` green (lint + types + 118 tests)
- [ ] `python3 scripts/check_submission_readiness.py` → SUBMISSION READY
- [ ] Fixture clips staged (or live dog/person) for a repeatable run
- [ ] Speaker volume up; camera framed on the "shed"
- [ ] Battery charged / solar in sun for the power shot
- [ ] Screenshots in `docs/screenshots/`; video uploaded; links in README + DoraHacks
- [ ] X thread drafted tagging **@QVAC**

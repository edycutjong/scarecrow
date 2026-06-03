# 🔌 Scarecrow — Agent Instructions

## Project
$50 off-grid AI sentry on a Raspberry Pi ≤4GB. Camera frames → multimodal scene understanding → natural-language rule matching → spoken TTS alerts. Solar/battery powered, fully offline, zero cloud.

## Hackathon
**QVAC Hackathon I – Unleash Edge AI** (DoraHacks) — Tinkerer Track (Pi ≤4GB) + Build in Public. $21,000 USDT pool.

## Structure
- `src/core/qvac.ts` — Shared QVAC SDK wrapper (loadModel, completion, RAG, TTS, P2P)
- `src/core/vision.ts` — Camera capture + multimodal scene analysis (QVAC-Vision-1B)
- `src/core/rules.ts` — Natural-language rule engine (LLM-based matching with keyword fallback)
- `src/core/power.ts` — Power-aware sentry loop (wake → capture → infer → alert → sleep)
- `src/web/` — Local web dashboard served from Pi's hotspot
- `scripts/` — bench.py, verify_offline.py, check_submission_readiness.py
- `data/fixtures/` — Test clips/images for rule precision/recall

## Tech Stack
| Layer | Technology |
|---|---|
| **Runtime** | Node.js on Raspberry Pi 4/5 |
| **AI Engine** | @qvac/sdk (completion, multimodal, TTS) |
| **Vision** | QVAC-Vision-1B (multimodal scene description) |
| **Rules** | Llama 3.2 1B (NL rule evaluation) |
| **TTS** | Piper via @qvac/sdk |
| **Dashboard** | Vanilla HTML/JS served over Pi hotspot |

## Key Rules
- **All inference** must go through `@qvac/sdk` — zero cloud APIs
- **≤4GB RAM constraint**: load one model at a time, unload immediately after inference
- **Model lifecycle**: vision model → unload → rules model → unload → TTS → unload
- **Power-aware**: configurable interval, PIR wake trigger, sleep between checks
- **Rules**: plain English conditions (e.g. "alert if person near shed, ignore dogs")
- **Rule evaluation**: LLM JSON output with keyword fallback on parse failure
- **Colors**: Red (#ef4444) for alerts, Green (#22c55e) for clear, Amber (#f59e0b) for low power
- **Test target**: 100+ tests stated in README

## Critical Patterns
- `captureFrame()` returns Buffer (simulated in dev, real Pi Camera in production)
- `analyzeScene(imageBuffer)` uses `MULTIMODAL_MODEL_ID` with `images` param in `runCompletion`
- `evaluateRules(sceneDescription)` returns `{ matchedRule, shouldAlert }`
- `wakeAndCheck()` orchestrates the full capture→analyze→evaluate→alert pipeline
- `startSentryLoop(intervalMs)` runs continuous monitoring
- Event log is in-memory array of `SentryEvent` objects (SQLite is future work)
- TTS spoken alerts via `runTextToSpeech({ text })` on matched rules

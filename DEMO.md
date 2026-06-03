# Scarecrow — Demo Script

## Setup
1. `npm install && python3 scripts/seed.py`
2. Open `src/web/index.html` in browser for dashboard
3. Preferably run on actual Raspberry Pi with camera

## Demo Flow (2 min)
1. Show hardware setup (Pi + camera + speaker)
2. Show the dashboard — rules editor, event log, RAM gauge
3. Trigger a scene with a person near the shed
4. Watch: Camera capture → Vision analysis → Rule match → TTS alert 🔊
5. Show event logged in the dashboard
6. Show another scene with a dog → correctly IGNORED
7. Close: "All AI inference on a $50 Pi. No cloud. No internet. Just QVAC."

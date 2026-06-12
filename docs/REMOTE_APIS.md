# Remote APIs

**Scarecrow makes zero remote/cloud API calls. The entire sentry pipeline — vision, rule reasoning, known-entity recall, speech, and phone alerts — runs on-device (or on a paired local peer) via `@qvac/sdk`.**

Camera frames are analysed locally, rules are reasoned locally, and spoken alerts are synthesised locally. There is no cloud vision API, no hosted LLM, no managed vector DB, no external speech service, and no push-notification relay — a private property's camera feed never leaves the device. Phone alerts travel **device → paired phone over the LAN** using QVAC's P2P transport, not the internet.

## APIs / external interfaces used

| Interface | Type | When | Data sent over the internet |
|---|---|---|---|
| `@qvac/sdk` — `loadModel` / `unloadModel` | **Local, on-device** | Single-model load→infer→unload (≤4GB lifecycle) | **None** |
| `@qvac/sdk` — `completion` + `images` (QVAC-Vision-1B) | **Local, on-device** | Multimodal scene description from a camera frame | **None** |
| `@qvac/sdk` — `completion` (Llama 3.2 1B) | **Local, on-device** | Natural-language rule evaluation | **None** |
| `@qvac/sdk` — `ragIngest` / `ragSearch` (GTE-Large-FP16) | **Local, on-device** | Known-friendly entity recall (suppress false alarms) | **None** |
| `@qvac/sdk` — `textToSpeech` (Piper) | **Local, on-device** | Spoken alert on a matched rule | **None** |
| `@qvac/sdk` — `startQVACProvider` / `stopQVACProvider` (P2P) | **Local-network peer-to-peer** | Push alert to a paired phone | **None** — stays on the LAN, never the internet |
| `libcamera-still` (Pi Camera) | **Local subprocess** | Frame capture on the Pi | **None** |
| PIR / GPIO via `onoff` (BCM 17) | **Local hardware** | Motion-triggered wake | **None** |
| `data/events.jsonl` (append-only log) | **Local file** | Offline evidence trail of events | **None** |
| QVAC model registry / HuggingFace | Network **download only** | First run only | None — fetches open model weights once, then offline |

No analytics, telemetry, or third-party services. After the one-time model download, Scarecrow runs fully air-gapped — the intended deployment is an off-grid Pi on its own hotspot with no internet uplink at all.

## How this is enforced (verifiable)

`scripts/verify_offline.py` is part of the evidence bundle and CI:

1. **Cloud-import scan** — fails if `src/` imports any banned cloud SDK (`openai`, `anthropic`, `googleapis`, `azure`, `aws-sdk`, `pinecone`, `cohere`, `firebase`, `supabase`) — i.e. no Google Cloud Vision, no GPT-4 Vision, no Pinecone, no Amazon Polly, no Firebase Cloud Messaging.
2. **Cloud-URL scan** — fails on any hardcoded cloud endpoint (`api.openai.com`, `api.anthropic.com`, `pinecone.io`, `firebaseio.com`, `googleapis.com`, …).
3. **SDK-only check** — confirms vision / rules / RAG / TTS / P2P all go through `@qvac/sdk`.
4. **Network isolation** — run with the network disconnected; asserts no outbound connectivity.

```bash
# disconnect the network first, then:
python3 scripts/verify_offline.py
```

The dashboard `/api/status` reports `network: "local-only"`, and the system never opens a socket to any cloud host. Take QVAC out and you'd need Google Vision + OpenAI + Pinecone + Amazon Polly + Firebase — five cloud services, a router, and a power outlet — which destroys the entire $50 off-grid premise.

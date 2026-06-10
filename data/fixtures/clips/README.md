# Demo camera-stimulus clips

Short clips that act as the **scene the Pi camera looks at** during the demo.
They are *input only* — the inference, dashboard, spoken alert, and RAM readout
must be the **real** Scarecrow system, recorded live (see
[`../../../docs/DEMO_CAPTURE.md`](../../../docs/DEMO_CAPTURE.md)).

[`clips.json`](clips.json) is the manifest: filename → expected alert/rule +
source & license. Fill in the `source`/`license` fields as you add each file.

## Sourcing rules (keep the demo legitimate + offline)

- ✅ **Own recording** — you/a helper walking toward a shed, your own yard. Best for the hero shot.
- ✅ **Licensed stock** — Pexels / Pixabay / Mixkit / Coverr (free for commercial use), or CC-BY with attribution. Search "security camera", "CCTV backyard", "person driveway", "dog walking".
- ✅ **AI-generated** — prompts in [`DEMO_CAPTURE.md`](../../../docs/DEMO_CAPTURE.md).
- ❌ **Live internet cameras** — breaks the offline claim (fails `verify_offline.py`), and unsecured cams are unauthorized access.
- ❌ **Random YouTube rips** — copyrighted.

> Download every clip **ahead of time** and play it **offline** to the camera.
> The demo run itself must stay air-gapped (0 outbound). Caption clips as
> "test clip played to camera" — never present stock footage as your own live capture.

## Suggested specs

1080p, **16:9, static/locked camera** (mimics a fixed sentry cam), 6–10 s,
slight CCTV grain, no zoom/pan.

## Note on git

The `.mp4`/`.mov` files are **git-ignored** (kept out of the repo to avoid
bloat). Keep your sourced clips locally for the demo; this README + `clips.json`
are tracked so the manifest travels with the project.

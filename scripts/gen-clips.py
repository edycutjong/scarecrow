#!/usr/bin/env python3
"""
Generate the 5 demo SCENE stills with the OpenAI Images API (gpt-image-1).

These are camera-stimulus images (the scene the Pi "sees") — NOT the system UI.
Use them directly as a still test frame, or feed them to an image-to-video tool
(Runway / Kling / Luma) for the moving clips. The Scarecrow execution, dashboard,
RAM readout and spoken alert in your demo must remain REAL and recorded live.

Usage:
  export OPENAI_API_KEY=sk-...        # never paste the key into chat
  python3 scripts/gen-clips.py        # writes data/fixtures/clips/stills/*.png

Options (env):
  OPENAI_IMAGE_MODEL  default gpt-image-1  (set to dall-e-3 if your key lacks
                      gpt-image-1 access — note dall-e-3 ignores some params)
  ONLY=person_near_shed   generate just one scene
"""
import os
import sys
import json
import base64
import urllib.request
import urllib.error

STYLE = (
    "Fixed CCTV security camera, locked static wide shot, slightly elevated angle. "
    "Photorealistic, subtle sensor grain and mild lens distortion, realistic lighting. "
    "No text overlays, nobody looking at the camera."
)

SCENES = {
    "person_near_shed": "A suburban backyard at dusk. A person in a dark hooded jacket "
        "walks slowly from the right fence line toward a wooden garden shed door, "
        "glancing around. Dim blue-hour light, long shadows.",
    "dog_past_shed": "A sunny backyard at midday. A golden retriever stands on the grass "
        "in front of a wooden shed, mid-stride crossing left to right. No people.",
    "vehicle_driveway": "A gravel driveway beside a house, overcast daytime. A dark, "
        "unmarked panel van stopped at the start of the driveway, headlights on. No people.",
    "empty_yard": "An empty suburban backyard with a wooden shed and a few trees, "
        "soft afternoon light, gentle breeze. No people, animals, or vehicles.",
    "known_truck": "A driveway in clear daylight. A silver pickup truck (Toyota Tacoma "
        "style) parked clearly in view, sitting still. No people.",
}

MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
SIZE = "1536x1024"  # landscape (≈3:2); closest to a CCTV wide frame


def generate(name: str, scene: str, out_dir: str, api_key: str) -> bool:
    prompt = f"{scene} {STYLE}"
    body = {"model": MODEL, "prompt": prompt, "size": SIZE, "n": 1}
    if MODEL == "gpt-image-1":
        body["quality"] = "high"
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"  ✗ {name}: HTTP {e.code} — {e.read().decode()[:300]}")
        return False
    except Exception as e:
        print(f"  ✗ {name}: {e}")
        return False

    item = data["data"][0]
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    else:  # dall-e-3 may return a URL
        with urllib.request.urlopen(item["url"], timeout=120) as r:
            raw = r.read()
    path = os.path.join(out_dir, f"{name}.png")
    with open(path, "wb") as f:
        f.write(raw)
    print(f"  ✓ {name} -> {path} ({len(raw)//1024} KB)")
    return True


def main():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.exit("OPENAI_API_KEY not set. Run:  export OPENAI_API_KEY=sk-...")

    base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_dir = os.path.join(base, "data", "fixtures", "clips", "stills")
    os.makedirs(out_dir, exist_ok=True)

    only = os.environ.get("ONLY")
    scenes = {only: SCENES[only]} if only and only in SCENES else SCENES

    print(f"Generating {len(scenes)} scene still(s) with {MODEL} @ {SIZE}...")
    ok = sum(generate(n, s, out_dir, api_key) for n, s in scenes.items())
    print(f"\nDone: {ok}/{len(scenes)} saved to data/fixtures/clips/stills/")
    print("Next: animate each still with an image-to-video tool (Runway/Kling/Luma),")
    print("      keeping the camera LOCKED/static. Then play the clips to the Pi camera.")
    sys.exit(0 if ok == len(scenes) else 1)


if __name__ == "__main__":
    main()

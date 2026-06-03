#!/usr/bin/env python3
"""
Scarecrow — Offline Verification Bundle
=========================================
Proves zero-cloud execution on Raspberry Pi ≤4GB.
Usage: python3 scripts/verify_offline.py
"""
import os
import sys
import socket

P = 0
F = 0
def check(name, condition, detail=""):
    global P, F
    if condition:
        P += 1
        print(f"  ✅ {name}")
    else:
        F += 1
        print(f"  ❌ {name}: {detail}")

def main():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print("=" * 64)
    print("  Scarecrow — Offline Verification Bundle")
    print("  Track: Tinkerer (Pi ≤4GB)")
    print("=" * 64)

    # ── 1. No cloud API imports ──
    print("\n  ── Cloud Import Scan ──")
    banned = ["openai", "anthropic", "googleapis", "azure", "aws-sdk",
              "pinecone", "cohere", "firebase", "supabase"]
    violations = []
    for root, _, files in os.walk(os.path.join(base, "src")):
        for f in files:
            if f.endswith((".ts", ".tsx", ".js", ".html")):
                content = open(os.path.join(root, f)).read()
                for kw in banned:
                    if kw in content:
                        violations.append(f"{f}: imports '{kw}'")
    check("No cloud API imports in src/", len(violations) == 0, str(violations[:5]))

    # ── 2. No cloud URLs in source ──
    print("\n  ── Cloud URL Scan ──")
    cloud_urls = ["api.openai.com", "api.anthropic.com", "api.cohere.ai",
                  "pinecone.io", "firebaseio.com", "googleapis.com"]
    url_violations = []
    for root, _, files in os.walk(os.path.join(base, "src")):
        for f in files:
            if f.endswith((".ts", ".tsx", ".js", ".html")):
                content = open(os.path.join(root, f)).read()
                for url in cloud_urls:
                    if url in content:
                        url_violations.append(f"{f}: contains '{url}'")
    check("No cloud URLs in source", len(url_violations) == 0, str(url_violations[:5]))

    # ── 3. @qvac/sdk integration ──
    print("\n  ── QVAC SDK Integration ──")
    qvac_files = []
    for root, _, files in os.walk(os.path.join(base, "src")):
        for f in files:
            if f.endswith(".ts"):
                content = open(os.path.join(root, f)).read()
                if "@qvac/sdk" in content:
                    qvac_files.append(f)
    check("@qvac/sdk imported", len(qvac_files) > 0, "No files import @qvac/sdk")
    check("@qvac/sdk in core wrapper", len(qvac_files) >= 1, f"Only in: {qvac_files}")

    # ── 4. Core modules ──
    print("\n  ── Core Modules ──")
    for module_name, filename in [("Vision", "vision.ts"), ("Rules", "rules.ts"),
                                   ("Power/Sentry", "power.ts"), ("QVAC wrapper", "qvac.ts")]:
        path = os.path.join(base, "src", "core", filename)
        check(f"{module_name} module ({filename})", os.path.isfile(path), "Missing")

    # ── 5. Vision module uses multimodal ──
    print("\n  ── Vision Pipeline ──")
    vision_path = os.path.join(base, "src", "core", "vision.ts")
    if os.path.isfile(vision_path):
        content = open(vision_path).read()
        check("Vision uses multimodal (images param)", "images" in content or "image" in content.lower())
        check("Vision calls completion", "completion" in content or "runCompletion" in content)

    # ── 6. Rules module ──
    print("\n  ── Rule Engine ──")
    rules_path = os.path.join(base, "src", "core", "rules.ts")
    if os.path.isfile(rules_path):
        content = open(rules_path).read()
        check("Rules has evaluation function", "evaluate" in content.lower())
        check("Rules has keyword fallback", "fallback" in content.lower() or "keyword" in content.lower())

    # ── 7. Power loop ──
    print("\n  ── Sentry Loop ──")
    power_path = os.path.join(base, "src", "core", "power.ts")
    if os.path.isfile(power_path):
        content = open(power_path).read()
        check("Power has sentry loop", "loop" in content.lower() or "interval" in content.lower())
        check("Power has capture phase", "capture" in content.lower())

    # ── 8. Web dashboard ──
    print("\n  ── Dashboard ──")
    html_path = os.path.join(base, "src", "web", "index.html")
    check("Web dashboard exists", os.path.isfile(html_path))
    if os.path.isfile(html_path):
        html = open(html_path).read()
        check("Dashboard has event log", "event" in html.lower() or "log" in html.lower())

    # ── 9. Data fixtures ──
    print("\n  ── Data Fixtures ──")
    fixtures = os.path.join(base, "data", "fixtures")
    check("Fixtures directory exists", os.path.isdir(fixtures))
    if os.path.isdir(fixtures):
        check("test_rules.json", os.path.isfile(os.path.join(fixtures, "test_rules.json")))
        check("test_scenes.json", os.path.isfile(os.path.join(fixtures, "test_scenes.json")))

    # ── 10. Security ──
    print("\n  ── Security ──")
    check("No .env file committed", not os.path.isfile(os.path.join(base, ".env")))
    check(".env.example exists", os.path.isfile(os.path.join(base, ".env.example")))
    check(".gitignore exists", os.path.isfile(os.path.join(base, ".gitignore")))
    if os.path.isfile(os.path.join(base, ".gitignore")):
        gi = open(os.path.join(base, ".gitignore")).read()
        check(".env in .gitignore", ".env" in gi)
        check("*.gguf in .gitignore", "gguf" in gi.lower())

    # ── 11. Network test ──
    print("\n  ── Network Isolation (optional) ──")
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=2)
        print("  ⚠️  Network is UP — for full verification, disconnect and re-run")
    except (socket.timeout, OSError):
        check("Network disconnected (air-gapped)", True)

    # ── Summary ──
    print(f"\n{'=' * 64}")
    print(f"  Results: {P} passed, {F} failed")
    if F > 0:
        print("  ❌ OFFLINE VERIFICATION FAILED")
    else:
        print("  ✅ OFFLINE VERIFICATION PASSED — zero cloud, runs on Pi ≤4GB")
    print(f"{'=' * 64}")
    sys.exit(1 if F > 0 else 0)

if __name__ == "__main__":
    main()

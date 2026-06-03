#!/usr/bin/env python3
"""
Scarecrow — Submission Readiness Checker
=========================================
Validates all hackathon submission requirements before push.
Run: python3 scripts/check_submission_readiness.py
"""
import os, sys, json, re

P = 0; F = 0; W = 0
def check(name, condition, detail=""):
    global P, F
    if condition:
        P += 1; print(f"  ✅ {name}")
    else:
        F += 1; print(f"  ❌ {name}: {detail}")

def warn(name, condition, detail=""):
    global W
    if not condition:
        W += 1; print(f"  ⚠️  {name}: {detail}")

def main():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print("=" * 64)
    print("  Scarecrow — Submission Readiness Check")
    print("  Track: Tinkerer (Pi ≤4GB)")
    print("=" * 64)

    # ── 1. Required Files ──
    print("\n  ── Required Files ──")
    for f in ["README.md", "LICENSE", "AGENTS.md", "CLAUDE.md", "DEMO.md",
              ".env.example", ".gitignore", "package.json", "package-lock.json",
              "Makefile", "tsconfig.json"]:
        check(f, os.path.isfile(os.path.join(base, f)), "File missing")

    # ── 2. CI/CD ──
    print("\n  ── CI/CD Workflows ──")
    for f in [".github/workflows/ci.yml", ".github/workflows/codeql.yml", ".github/dependabot.yml"]:
        check(f, os.path.isfile(os.path.join(base, f)), "File missing")

    # ── 3. Scripts ──
    print("\n  ── Scripts ──")
    for s in ["bench.py", "verify_offline.py", "seed.py", "check_submission_readiness.py"]:
        path = os.path.join(base, "scripts", s)
        check(f"scripts/{s}", os.path.isfile(path), "Script missing")
        if os.path.isfile(path):
            lines = len(open(path).readlines())
            warn(f"scripts/{s} substantive (>{20} lines)", lines > 20, f"Only {lines} lines")

    # ── 4. Source Code ──
    print("\n  ── Source Code ──")
    for f in ["src/core/qvac.ts", "src/core/vision.ts", "src/core/rules.ts", "src/core/power.ts"]:
        check(f, os.path.isfile(os.path.join(base, f)), "File missing")
    check("src/web/index.html", os.path.isfile(os.path.join(base, "src/web/index.html")), "Dashboard missing")

    # Check @qvac/sdk usage
    qvac_count = 0
    for root, _, files in os.walk(os.path.join(base, "src")):
        for fn in files:
            if fn.endswith((".ts", ".tsx")):
                content = open(os.path.join(root, fn)).read()
                qvac_count += content.count("@qvac/sdk")
    check("@qvac/sdk imported (≥1 files)", qvac_count >= 1, f"Only {qvac_count} imports")

    # ── 5. Data ──
    print("\n  ── Data & Fixtures ──")
    fixtures = os.path.join(base, "data", "fixtures")
    check("Fixtures directory exists", os.path.isdir(fixtures), "Missing data/fixtures/")
    if os.path.isdir(fixtures):
        fixture_files = os.listdir(fixtures)
        check("test_rules.json exists", "test_rules.json" in fixture_files, "Missing")
        check("test_scenes.json exists", "test_scenes.json" in fixture_files, "Missing")

    # ── 6. README Quality ──
    print("\n  ── README Quality ──")
    readme = open(os.path.join(base, "README.md")).read()
    for section in ["Why ONLY QVAC", "Getting Started", "Architecture",
                    "Benchmark", "Offline", "License", "Limitation", "Testing"]:
        check(f"README has '{section}'", section.lower() in readme.lower(),
              f"Section missing")

    # Check for placeholder text
    placeholders = ["TODO", "FIXME", "placeholder", "lorem ipsum", "TBD"]
    found = [p for p in placeholders if p.lower() in readme.lower()]
    check("No placeholder text in README", len(found) == 0, f"Found: {found}")

    # Hardware constraint mentioned
    check("README mentions ≤4GB", "4GB" in readme or "4 GB" in readme, "Must mention hardware constraint")
    check("README mentions Raspberry Pi", "raspberry" in readme.lower() or "pi" in readme.lower(), "Must mention target hardware")

    # ── 7. Package.json Scripts ──
    print("\n  ── Package.json Scripts ──")
    pkg = json.load(open(os.path.join(base, "package.json")))
    scripts = pkg.get("scripts", {})
    for s in ["start", "typecheck", "ci"]:
        check(f"script: {s}", s in scripts, "Missing from package.json")

    # ── 8. License ──
    print("\n  ── License ──")
    license_text = open(os.path.join(base, "LICENSE")).read() if os.path.isfile(os.path.join(base, "LICENSE")) else ""
    check("MIT license", "MIT" in license_text, "Not MIT")
    check("Copyright 2026", "2026" in license_text, "Wrong year")

    # ── Summary ──
    print(f"\n{'=' * 64}")
    print(f"  Results: {P} passed, {F} failed, {W} warnings")
    if F > 0:
        print(f"  ❌ NOT READY FOR SUBMISSION")
    else:
        print(f"  ✅ SUBMISSION READY")
    print(f"{'=' * 64}")
    sys.exit(1 if F > 0 else 0)

if __name__ == "__main__":
    main()

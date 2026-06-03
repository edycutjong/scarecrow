#!/usr/bin/env python3
"""Scarecrow — Seed Script. Usage: python3 scripts/seed.py"""
import os, sys, json

def main():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    fixtures = os.path.join(base, 'data', 'fixtures')
    os.makedirs(fixtures, exist_ok=True)
    # Create sample test rules
    rules = [
        {"id": "1", "condition": "A person is near the shed or approaching", "action": "alert"},
        {"id": "2", "condition": "A dog or animal is present", "action": "ignore"},
        {"id": "3", "condition": "A vehicle is parked in the driveway", "action": "alert"},
        {"id": "4", "condition": "A bird or small animal on the lawn", "action": "ignore"},
    ]
    with open(os.path.join(fixtures, 'test_rules.json'), 'w') as f:
        json.dump(rules, f, indent=2)
    print(f"[seed] Written {len(rules)} test rules")
    # Create test scene descriptions for rule evaluation testing
    scenes = [
        {"description": "A person wearing a dark hoodie approaching the shed door", "expected_rule": "1", "expected_alert": True},
        {"description": "A golden retriever sleeping on the porch", "expected_rule": "2", "expected_alert": False},
        {"description": "A white van parked in the driveway with engine running", "expected_rule": "3", "expected_alert": True},
        {"description": "Two sparrows on the lawn near the garden", "expected_rule": "4", "expected_alert": False},
        {"description": "Empty yard, no motion detected", "expected_rule": None, "expected_alert": False},
    ]
    with open(os.path.join(fixtures, 'test_scenes.json'), 'w') as f:
        json.dump(scenes, f, indent=2)
    print(f"[seed] Written {len(scenes)} test scenes")
    manifest = {
        'seeded_at': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'rules': len(rules), 'scenes': len(scenes),
    }
    with open(os.path.join(base, 'data', 'seed_manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print("[seed] ✅ Seed complete.")

if __name__ == '__main__':
    main()

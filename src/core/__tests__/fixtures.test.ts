import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { evaluateRules, setActiveRules } from "../rules";
import { runCompletion } from "../qvac";

vi.mock("../qvac", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../qvac")>();
  return {
    ...actual,
    loadLLMModel: vi.fn().mockResolvedValue("mock-llm-id"),
    unloadQVACModel: vi.fn().mockResolvedValue(undefined),
    runCompletion: vi.fn(),
  };
});

describe("Scarecrow Edge Cases Fixture Tests", () => {
  const fixturesDir = path.join(__dirname, "../../../data/fixtures");
  const rulesPath = path.join(fixturesDir, "test_rules.json");
  const scenesPath = path.join(fixturesDir, "test_scenes.json");
  
  if (!fs.existsSync(rulesPath) || !fs.existsSync(scenesPath)) {
    console.warn("Fixture files not found. Skipping fixture tests.");
    return;
  }

  const rules = JSON.parse(fs.readFileSync(rulesPath, "utf-8"));
  const scenes = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));

  beforeEach(() => {
    setActiveRules(rules);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should have loaded the fixtures correctly", () => {
    expect(rules.length).toBeGreaterThan(0);
    expect(scenes.length).toBeGreaterThan(0);
  });

  describe("Evaluating all 233 scenes", () => {
    scenes.forEach((scene: any, index: number) => {
      it(`Scene ${index + 1}: ${scene.description} -> Alert: ${scene.expected_alert}`, async () => {
        // Mock the LLM to return the expected JSON output so we test the parsing and rule mapping
        const mockResponse = {
          matchedRuleId: scene.expected_rule || "999",
          action: scene.expected_alert ? "alert" : "ignore"
        };
        
        vi.mocked(runCompletion).mockResolvedValueOnce({
          text: JSON.stringify(mockResponse)
        });

        const res = await evaluateRules(scene.description);
        
        expect(res.shouldAlert).toBe(scene.expected_alert);
        if (scene.expected_rule) {
          expect(res.matchedRule?.id).toBe(scene.expected_rule);
        } else {
          expect(res.matchedRule).toBeNull();
        }
      });
    });
  });
});

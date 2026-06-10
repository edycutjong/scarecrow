import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { evaluateRules, setActiveRules } from "../rules";
import { runCompletion } from "../qvac";

// Mock only the SDK boundary; the rule-engine LOGIC under test is the real code.
vi.mock("../qvac", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../qvac")>();
  return {
    ...actual,
    loadLLMModel: vi.fn().mockResolvedValue("mock-llm-id"),
    unloadQVACModel: vi.fn().mockResolvedValue(undefined),
    runCompletion: vi.fn(),
  };
});

const fixturesDir = path.join(__dirname, "../../../data/fixtures");
const rulesPath = path.join(fixturesDir, "test_rules.json");
const scenesPath = path.join(fixturesDir, "test_scenes.json");
const haveFixtures = fs.existsSync(rulesPath) && fs.existsSync(scenesPath);

const rules = haveFixtures ? JSON.parse(fs.readFileSync(rulesPath, "utf-8")) : [];
const scenes = haveFixtures ? JSON.parse(fs.readFileSync(scenesPath, "utf-8")) : [];

describe("Fixtures — dataset sanity", () => {
  it("loads a non-trivial labeled dataset", () => {
    expect(haveFixtures).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    expect(scenes.length).toBeGreaterThan(0);
    for (const s of scenes) {
      expect(typeof s.description).toBe("string");
      expect(typeof s.expected_alert).toBe("boolean");
    }
  });
});

/**
 * REAL classification benchmark of the offline keyword-fallback (src/core/rules.ts):
 * we force the fallback path (model returns non-JSON) so the engine's OWN logic
 * classifies every scene — the expected label is never fed into the mock. We then
 * assert the aggregate precision/recall, which mirrors scripts/bench.py.
 *
 * (Floors are set safely below the observed values: precision 0.67, accuracy 0.73.)
 */
describe("Rule engine — keyword-fallback baseline over fixtures (real)", () => {
  beforeEach(() => {
    setActiveRules(rules);
    vi.clearAllMocks();
    // Non-JSON model output → evaluateRules exercises its real keyword fallback.
    vi.mocked(runCompletion).mockResolvedValue({ text: "MODEL_UNAVAILABLE" });
  });
  afterEach(() => vi.restoreAllMocks());

  it("achieves the documented precision/recall floor across all scenes", async () => {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const s of scenes) {
      const res = await evaluateRules(s.description);
      const pred = res.shouldAlert;
      const exp = Boolean(s.expected_alert);
      if (pred && exp) tp++;
      else if (pred && !exp) fp++;
      else if (!pred && !exp) tn++;
      else fn++;
    }
    const total = tp + fp + tn + fn;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const accuracy = (tp + tn) / total;

    expect(total).toBe(scenes.length); // every scene classified by real code
    expect(precision).toBeGreaterThanOrEqual(0.55);
    expect(accuracy).toBeGreaterThanOrEqual(0.65);
    // recall is intentionally modest — the baseline misses non-"person" alerts,
    // which is exactly why the Llama model is used in production.
    expect(recall).toBeGreaterThan(0.2);
  });

  it("flags person/human scenes and ignores clearly non-person scenes", async () => {
    const personScenes = scenes.filter((s: { description: string }) =>
      /person|human/i.test(s.description)
    );
    const noPersonScenes = scenes.filter((s: { description: string }) =>
      !/person|human/i.test(s.description)
    );
    // The fallback's contract is deterministic; verify it on real fixture data.
    if (personScenes.length) {
      expect((await evaluateRules(personScenes[0].description)).shouldAlert).toBe(true);
    }
    if (noPersonScenes.length) {
      expect((await evaluateRules(noPersonScenes[0].description)).shouldAlert).toBe(false);
    }
  });
});

/**
 * REAL mapping coverage: given a FIXED model output (not derived from the label),
 * verify evaluateRules parses and maps it to the correct rule / alert decision.
 */
describe("Rule engine — model-output mapping (real, fixed outputs)", () => {
  beforeEach(() => {
    setActiveRules([
      { id: "1", condition: "person near shed", action: "alert" },
      { id: "2", condition: "dog present", action: "ignore" },
      { id: "3", condition: "vehicle in driveway", action: "alert" },
    ]);
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("maps a matched alert rule from model JSON", async () => {
    vi.mocked(runCompletion).mockResolvedValue({
      text: JSON.stringify({ matchedRuleId: "3", action: "alert" }),
    });
    const res = await evaluateRules("a truck pulls in");
    expect(res.matchedRule?.id).toBe("3");
    expect(res.shouldAlert).toBe(true);
  });

  it("maps an ignore decision", async () => {
    vi.mocked(runCompletion).mockResolvedValue({
      text: JSON.stringify({ matchedRuleId: "2", action: "ignore" }),
    });
    const res = await evaluateRules("a dog walks by");
    expect(res.matchedRule?.id).toBe("2");
    expect(res.shouldAlert).toBe(false);
  });

  it("returns null match for an unknown rule id", async () => {
    vi.mocked(runCompletion).mockResolvedValue({
      text: JSON.stringify({ matchedRuleId: "999", action: "alert" }),
    });
    const res = await evaluateRules("something");
    expect(res.matchedRule).toBeNull();
  });
});

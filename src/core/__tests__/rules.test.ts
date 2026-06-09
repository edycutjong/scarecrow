import { describe, it, expect, beforeEach } from "vitest";
import { addRule, removeRule, activeRules } from "../rules.js";

describe("rules.ts", () => {
  beforeEach(() => {
    // clear rules
    const rules = [...activeRules];
    for (const r of rules) {
      removeRule(r.id);
    }
  });

  it("adds and removes rules", () => {
    const r1 = addRule("dog near fence", "alert");
    expect(r1.condition).toBe("dog near fence");
    expect(r1.action).toBe("alert");
    expect(activeRules).toHaveLength(1);

    expect(removeRule(r1.id)).toBe(true);
    expect(removeRule("missing")).toBe(false);
    expect(activeRules).toHaveLength(0);
  });

  it("throws on empty condition or invalid action", () => {
    expect(() => addRule("  ", "alert")).toThrow("cannot be empty");
    expect(() => addRule(null as any, "alert")).toThrow("cannot be empty");
    expect(() => addRule("dog", "foo" as any)).toThrow("Invalid action");
  });

  it("handles non-numeric ids when determining next id", () => {
    // Inject a non-numeric id to cover `Number(r.id) || 0` fallback
    activeRules.push({ id: "abc", condition: "test", action: "alert" });
    const r = addRule("test2", "alert");
    // max id was 0 (since "abc" is NaN -> 0), next is 1. Wait, there were no other rules because beforeEach clears them.
    expect(r.id).toBe("1");
  });
});

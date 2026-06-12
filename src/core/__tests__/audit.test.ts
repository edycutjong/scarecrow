import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordModelLoad,
  recordModelUnload,
  recordCompletion,
  getAuditLog,
  getAuditSummary,
  clearAuditLog,
  setAuditSink,
  estimateTokens,
} from "../audit.js";

describe("audit.ts", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    clearAuditLog();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    clearAuditLog();
    logSpy.mockRestore();
  });

  describe("estimateTokens", () => {
    it("returns 0 for empty/falsey input", () => {
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });
    it("estimates ~4 chars per token, min 1", () => {
      expect(estimateTokens("a")).toBe(1);
      expect(estimateTokens("12345678")).toBe(2); // 8 chars / 4
    });
  });

  describe("recording", () => {
    it("records model loads, unloads and completions in order", () => {
      recordModelLoad("m1", "llm", 120);
      recordCompletion({ modelId: "m1", totalMs: 500, tokenCount: 50 });
      recordModelUnload("m1");

      const log = getAuditLog();
      expect(log.map((e) => e.type)).toEqual(["model_load", "completion", "model_unload"]);
      expect(log[0]).toMatchObject({ modelId: "m1", modelType: "llm", loadMs: 120 });
    });

    it("computes tokensPerSec and defaults TTFT to totalMs for non-streamed calls", () => {
      recordCompletion({ modelId: "m1", totalMs: 1000, tokenCount: 40 });
      const [e] = getAuditLog();
      expect(e.tokensPerSec).toBeCloseTo(40); // 40 tok / 1.0s
      expect(e.ttftMs).toBe(1000);
      expect(e.streamed).toBe(false);
      expect(e.source).toBe("local");
    });

    it("guards against divide-by-zero when totalMs is 0", () => {
      recordCompletion({ modelId: "m1", totalMs: 0, tokenCount: 10 });
      expect(getAuditLog()[0].tokensPerSec).toBe(0);
    });
  });

  describe("getAuditSummary", () => {
    it("aggregates counts, active models, and averages", () => {
      recordModelLoad("vision", "llm", 100);
      recordCompletion({ modelId: "vision", totalMs: 1000, tokenCount: 20 }); // 20 tok/s
      recordModelUnload("vision");
      recordModelLoad("rules", "llm", 80);
      recordCompletion({ modelId: "rules", totalMs: 500, tokenCount: 20 }); // 40 tok/s
      // 'rules' left loaded → should appear in activeModels

      const s = getAuditSummary();
      expect(s.totalEvents).toBe(5);
      expect(s.loads).toBe(2);
      expect(s.unloads).toBe(1);
      expect(s.completions).toBe(2);
      expect(s.activeModels).toEqual(["rules"]);
      expect(s.avgTokensPerSec).toBeCloseTo(30); // (20 + 40) / 2
      expect(s.avgTtftMs).toBeCloseTo(750); // (1000 + 500) / 2
    });

    it("returns null averages when there are no completions", () => {
      recordModelLoad("m1", "tts", 10);
      const s = getAuditSummary();
      expect(s.avgTtftMs).toBeNull();
      expect(s.avgTokensPerSec).toBeNull();
    });
  });

  describe("sink", () => {
    it("invokes the sink for each event", () => {
      const seen = vi.fn();
      setAuditSink(seen);
      recordModelLoad("m1", "llm", 5);
      expect(seen).toHaveBeenCalledTimes(1);
    });
    it("never lets a throwing sink break recording", () => {
      setAuditSink(() => {
        throw new Error("boom");
      });
      expect(() => recordModelLoad("m1", "llm", 5)).not.toThrow();
      expect(getAuditLog()).toHaveLength(1);
    });
  });

  describe("ring buffer", () => {
    it("caps the log at 500 events (drops oldest)", () => {
      for (let i = 0; i < 510; i++) recordModelLoad(`m${i}`, "llm", 1);
      const log = getAuditLog();
      expect(log).toHaveLength(500);
      expect(log[0].modelId).toBe("m10"); // first 10 dropped
    });
  });

  describe("uncovered branches", () => {
    it("handles missing ttft/tokensPerSec and unmatched unloads", () => {
      // Unmatched unload to cover `active.get(e.modelId) ?? 0`
      recordModelUnload("never_loaded");
      // Missing ttftMs and tokensPerSec to cover `?? 0` in getAuditSummary
      const log = getAuditLog() as any;
      log.push({ type: "completion", modelId: "m1", timestamp: Date.now() }); // forged completion
      const s = getAuditSummary();
      expect(s.activeModels).toEqual([]);
    });
  });
});

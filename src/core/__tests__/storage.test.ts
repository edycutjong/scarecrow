import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs/promises";
import { appendEvent, loadEvents, PersistableEvent } from "../storage.js";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    default: { ...actual, mkdir: vi.fn(), appendFile: vi.fn(), readFile: vi.fn() },
  };
});

describe("storage.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("appendEvent", () => {
    it("creates dir and appends JSON string", async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);
      const ev: PersistableEvent = { timestamp: "1", sceneDescription: "a", matchedRuleId: null, alerted: false };
      const success = await appendEvent(ev, "test.jsonl");
      expect(success).toBe(true);
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.appendFile).toHaveBeenCalledWith("test.jsonl", JSON.stringify(ev) + "\n", "utf8");
    });
    it("returns false on error", async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error("fail"));
      const ev: PersistableEvent = { timestamp: "1", sceneDescription: "a", matchedRuleId: null, alerted: false };
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const success = await appendEvent(ev, "test.jsonl");
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to persist event"), expect.any(Error));
      consoleWarnSpy.mockRestore();
      expect(success).toBe(false);
    });
  });

  describe("loadEvents", () => {
    it("parses valid JSONL", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(`{"alerted":true}\ninvalid json\n{"alerted":false}`);
      const events = await loadEvents("test.jsonl");
      expect(events).toEqual([{ alerted: true }, { alerted: false }]);
    });
    it("returns empty array on error", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("enoent"));
      const events = await loadEvents("test.jsonl");
      expect(events).toEqual([]);
    });
    it("returns empty array if fs.readFile is not a function", async () => {
      const originalReadFile = fs.readFile;
      (fs as any).readFile = undefined;
      const events = await loadEvents("test.jsonl");
      expect(events).toEqual([]);
      (fs as any).readFile = originalReadFile;
    });
  });
});

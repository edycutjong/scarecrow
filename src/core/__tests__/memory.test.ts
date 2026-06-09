import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerKnownEntity, getKnownEntities, removeKnownEntity, clearKnownEntities, checkKnownEntity } from "../memory.js";
import { loadEmbeddingModel, runRagSearch, unloadQVACModel } from "../qvac.js";

vi.mock("../qvac.js", () => ({
  loadEmbeddingModel: vi.fn().mockResolvedValue("mock-emb"),
  runSaveEmbeddings: vi.fn().mockResolvedValue(undefined),
  runRagSearch: vi.fn(),
  unloadQVACModel: vi.fn().mockResolvedValue(undefined),
  EMBEDDING_MODEL_ID: "mock",
}));

describe("memory.ts", () => {
  beforeEach(() => {
    clearKnownEntities();
    vi.clearAllMocks();
  });

  it("registers and removes entities", () => {
    const e1 = registerKnownEntity({ label: "dog", description: "my dog" });
    const e2 = registerKnownEntity({ label: "cat", description: "my cat", id: "cat1" });
    expect(getKnownEntities()).toHaveLength(2);
    expect(e2.id).toBe("cat1");
    
    expect(removeKnownEntity(e1.id)).toBe(true);
    expect(removeKnownEntity("missing")).toBe(false);
    expect(getKnownEntities()).toHaveLength(1);
  });

  describe("checkKnownEntity", () => {
    it("returns false if no entities registered", async () => {
      expect(await checkKnownEntity("a dog")).toEqual({ matched: false });
    });

    it("returns match if score >= threshold", async () => {
      registerKnownEntity({ label: "dog", description: "my dog" });
      vi.mocked(runRagSearch).mockResolvedValue([{ id: "1", content: "dog: my dog", score: 0.9 }]);
      const res = await checkKnownEntity("a dog");
      expect(res.matched).toBe(true);
      expect(res.entity?.label).toBe("dog");
    });

    it("returns match by label fallback", async () => {
      registerKnownEntity({ label: "dog", description: "my dog" });
      vi.mocked(runRagSearch).mockResolvedValue([{ id: "1", content: "dog: other text", score: 0.9 }]);
      const res = await checkKnownEntity("a dog");
      expect(res.matched).toBe(true);
      expect(res.entity?.label).toBe("dog");
    });

    it("returns false if score < threshold", async () => {
      registerKnownEntity({ label: "dog", description: "my dog" });
      vi.mocked(runRagSearch).mockResolvedValue([{ id: "1", content: "dog: my dog", score: 0.5 }]);
      const res = await checkKnownEntity("a dog", 0.8);
      expect(res.matched).toBe(false);
    });

    it("returns false on error safely", async () => {
      registerKnownEntity({ label: "dog", description: "my dog" });
      vi.mocked(loadEmbeddingModel).mockRejectedValueOnce(new Error("fail"));
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await checkKnownEntity("a dog");
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Known-entity check failed"), expect.any(Error));
      consoleWarnSpy.mockRestore();
      expect(res.matched).toBe(false);
      expect(unloadQVACModel).not.toHaveBeenCalled(); // modelId was undefined
    });

    it("returns false if score >= threshold but entity not found", async () => {
      registerKnownEntity({ label: "dog", description: "my dog" });
      vi.mocked(runRagSearch).mockResolvedValue([{ id: "1", content: "unrelated: text", score: 0.9 }]);
      const res = await checkKnownEntity("a dog");
      expect(res.matched).toBe(false);
    });

    it("handles gracefully when runRagSearch returns non-array", async () => {
      registerKnownEntity({ label: "dog", description: "my dog" });
      vi.mocked(runRagSearch).mockResolvedValue("not an array" as any);
      const res = await checkKnownEntity("a dog");
      expect(res.matched).toBe(false);
    });
  });
});

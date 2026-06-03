import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @qvac/sdk
const mockLoadModel = vi.fn();
const mockUnloadModel = vi.fn();
const mockCompletion = vi.fn();
const mockTextToSpeech = vi.fn();
const mockRagIngest = vi.fn();
const mockRagSearch = vi.fn();
const mockStartQVACProvider = vi.fn();
const mockStopQVACProvider = vi.fn();

vi.mock("@qvac/sdk", () => ({
  loadModel: (...args: any[]) => mockLoadModel(...args),
  unloadModel: (...args: any[]) => mockUnloadModel(...args),
  completion: (...args: any[]) => mockCompletion(...args),
  textToSpeech: (...args: any[]) => mockTextToSpeech(...args),
  ragIngest: (...args: any[]) => mockRagIngest(...args),
  ragSearch: (...args: any[]) => mockRagSearch(...args),
  startQVACProvider: (...args: any[]) => mockStartQVACProvider(...args),
  stopQVACProvider: (...args: any[]) => mockStopQVACProvider(...args),
  LLAMA_3_2_1B_INST_Q4_0: "llama-model",
  GTE_LARGE_FP16: "gte-model",
  TTS_EN_ES_CHATTERBOX_Q4F16: { src: "tts-src" },
  WHISPER_EN_TINY_Q8_0: "whisper-model",
}));

// Mock ../vision dynamically using global variables to prevent hoisting issues
vi.mock("../vision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../vision")>();
  return {
    ...actual,
    captureFrame: async () => {
      if ((globalThis as any).captureFrameMockImpl) {
        return (globalThis as any).captureFrameMockImpl();
      }
      return actual.captureFrame();
    },
    analyzeScene: async (img: Buffer) => {
      if ((globalThis as any).analyzeSceneMockImpl) {
        return (globalThis as any).analyzeSceneMockImpl(img);
      }
      return actual.analyzeScene(img);
    }
  };
});

// Import Scarecrow core modules
import {
  captureFrame,
  analyzeScene,
} from "../vision";

import {
  evaluateRules,
  activeRules,
} from "../rules";

import {
  wakeAndCheck,
  getEventLog,
  startSentryLoop,
  stopSentryLoop,
} from "../power";

import {
  loadLLMModel,
  loadEmbeddingModel,
  loadTTSModel,
  unloadQVACModel,
  runCompletion,
  runSaveEmbeddings,
  runRagSearch,
  runTextToSpeech,
  startP2PProvider,
  stopP2PProvider,
} from "../qvac";

describe("Scarecrow Core Module", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (globalThis as any).captureFrameMockImpl = null;
    (globalThis as any).analyzeSceneMockImpl = null;
    // Suppress all console output — error-path tests intentionally trigger these
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    stopSentryLoop();
  });

  describe("vision.ts tests", () => {
    it("should capture frame successfully", async () => {
      const frame = await captureFrame();
      expect(frame).not.toBeNull();
      expect(frame?.toString()).toBe("simulated_image_data");
    });

    it("should analyze scene image using vision model", async () => {
      mockLoadModel.mockResolvedValue("vision-model-id");
      mockCompletion.mockResolvedValue({ text: Promise.resolve("A person approaching the shed") });
      mockUnloadModel.mockResolvedValue(undefined);

      const description = await analyzeScene(Buffer.from("dummy"));
      expect(description).toBe("A person approaching the shed");
      expect(mockLoadModel).toHaveBeenCalledWith({
        modelSrc: "QVAC-Vision-1B",
        modelType: "llm",
      });
    });
  });

  describe("rules.ts tests", () => {
    it("should evaluate rules successfully with matched rule JSON", async () => {
      mockLoadModel.mockResolvedValue("rules-model-id");
      const mockJSON = JSON.stringify({ matchedRuleId: "1", action: "alert" });
      mockCompletion.mockResolvedValue({ text: Promise.resolve(mockJSON) });

      const res = await evaluateRules("some scene text");
      expect(res.matchedRule).toEqual(activeRules[0]);
      expect(res.shouldAlert).toBe(true);
    });

    it("should return null for matchedRule if rule ID is unknown", async () => {
      mockLoadModel.mockResolvedValue("rules-model-id");
      const mockJSON = JSON.stringify({ matchedRuleId: "999", action: "alert" });
      mockCompletion.mockResolvedValue({ text: Promise.resolve(mockJSON) });

      const res = await evaluateRules("some scene text");
      expect(res.matchedRule).toBeNull();
      expect(res.shouldAlert).toBe(true);
    });

    it("should fall back to keyword matching if JSON parse fails", async () => {
      mockLoadModel.mockResolvedValue("rules-model-id");
      mockCompletion.mockResolvedValue({ text: Promise.resolve("NOT_JSON") });

      // Match person/human keyword
      const res1 = await evaluateRules("I see a human walking");
      expect(res1.shouldAlert).toBe(true);
      expect(res1.matchedRule).toEqual(activeRules[0]);

      // Match other keyword
      const res2 = await evaluateRules("just trees and grass");
      expect(res2.shouldAlert).toBe(false);
      expect(res2.matchedRule).toEqual(activeRules[1]);
    });
  });

  describe("power.ts tests", () => {
    beforeEach(() => {
      (globalThis as any).captureFrameMockImpl = vi.fn().mockResolvedValue(Buffer.from("frame"));
      (globalThis as any).analyzeSceneMockImpl = vi.fn().mockResolvedValue("A person approaching");
    });

    it("should handle wakeAndCheck with no frame captured", async () => {
      // Mock captureFrame to return null
      (globalThis as any).captureFrameMockImpl = vi.fn().mockResolvedValue(null);

      const event = await wakeAndCheck();
      expect(event.sceneDescription).toBe("No frame captured");
      expect(event.matchedRuleId).toBeNull();
      expect(event.alerted).toBe(false);
      expect(getEventLog()).toContain(event);
    });

    it("should execute full wakeAndCheck cycle successfully with alert and TTS", async () => {
      mockLoadModel.mockResolvedValue("rules-model-id");
      mockCompletion.mockResolvedValue({
        text: Promise.resolve(JSON.stringify({ matchedRuleId: "1", action: "alert" })),
      });
      mockTextToSpeech.mockReturnValue({ buffer: Promise.resolve(new Uint8Array([])) });

      const event = await wakeAndCheck();
      expect(event.sceneDescription).toBe("A person approaching");
      expect(event.matchedRuleId).toBe("1");
      expect(event.alerted).toBe(true);
      expect(mockTextToSpeech).toHaveBeenCalled();
    });

    it("should execute wakeAndCheck with no alert when rules evaluate to ignore", async () => {
      mockLoadModel.mockResolvedValue("rules-model-id");
      mockCompletion.mockResolvedValue({
        text: Promise.resolve(JSON.stringify({ matchedRuleId: "2", action: "ignore" })),
      });

      const event = await wakeAndCheck();
      expect(event.alerted).toBe(false);
      expect(mockTextToSpeech).not.toHaveBeenCalled();
    });

    it("should log warning when TTS fails during alert but not crash", async () => {
      mockLoadModel.mockResolvedValue("rules-model-id");
      mockCompletion.mockResolvedValue({
        text: Promise.resolve(JSON.stringify({ matchedRuleId: "1", action: "alert" })),
      });
      mockTextToSpeech.mockImplementation(() => {
        throw new Error("TTS Hardware Busy");
      });

      await expect(wakeAndCheck()).resolves.not.toThrow();
    });

    it("should start and stop sentry loop scheduling", async () => {
      // Set up mocks so wakeAndCheck completes cleanly when timer fires
      mockLoadModel.mockResolvedValue("rules-model-id");
      mockCompletion.mockResolvedValue({
        text: Promise.resolve(JSON.stringify({ matchedRuleId: "2", action: "ignore" })),
      });

      startSentryLoop(5000);

      // Trigger interval check (async to let wakeAndCheck settle)
      await vi.advanceTimersByTimeAsync(5000);

      // Try starting duplicate loop
      startSentryLoop(5000);
      expect(consoleWarnSpy).toHaveBeenCalledWith("[power] Sentry loop already running.");

      stopSentryLoop();
    });

    it("should log error when wakeAndCheck throws inside sentry loop", async () => {
      // Force wakeAndCheck to fail (e.g. by making captureFrame throw)
      (globalThis as any).captureFrameMockImpl = vi.fn().mockRejectedValue(new Error("Camera Disconnected"));
      
      startSentryLoop(5000);
      
      // Advance timer to trigger the interval
      await vi.advanceTimersByTimeAsync(5000);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith("[power] Sentry check error:", expect.any(Error));
      
      stopSentryLoop();
    });

    it("should handle wakeAndCheck when rule evaluation returns no matched rule", async () => {
      mockLoadModel.mockResolvedValue("rules-model-id");
      mockCompletion.mockResolvedValue({
        text: Promise.resolve(JSON.stringify({ matchedRuleId: "999", action: "ignore" })),
      });

      const event = await wakeAndCheck();
      expect(event.sceneDescription).toBe("A person approaching");
      expect(event.matchedRuleId).toBeNull();
      expect(event.alerted).toBe(false);
    });
  });

  describe("qvac.ts wrapper tests", () => {
    it("should load LLM Model successfully", async () => {
      mockLoadModel.mockResolvedValue("mock-llm-id");
      const id = await loadLLMModel();
      expect(id).toBe("mock-llm-id");

      // Test object modelSrc parameter to cover ternary branch
      const idObj = await loadLLMModel({ src: "obj-llama-model" });
      expect(idObj).toBe("mock-llm-id");
    });

    it("should load LLM Model with delegate options", async () => {
      mockLoadModel.mockResolvedValue("mock-llm-id");
      const id = await loadLLMModel("custom-src", {
        providerPublicKey: "pubkey",
        timeout: 10000,
        fallbackToLocal: false,
      });
      expect(id).toBe("mock-llm-id");
    });

    it("should load LLM Model with delegate options and defaults", async () => {
      mockLoadModel.mockResolvedValue("mock-llm-id");
      const id = await loadLLMModel("custom-src", {
        providerPublicKey: "pubkey"
      });
      expect(id).toBe("mock-llm-id");
      expect(mockLoadModel).toHaveBeenCalledWith({
        modelSrc: "custom-src",
        modelType: "llm",
        delegate: {
          providerPublicKey: "pubkey",
          timeout: 30000,
          fallbackToLocal: true
        }
      });
    });

    it("should load Embedding Model successfully", async () => {
      mockLoadModel.mockResolvedValue("mock-embed-id");
      const id = await loadEmbeddingModel();
      expect(id).toBe("mock-embed-id");

      // Test object modelSrc parameter to cover ternary branch
      const idObj = await loadEmbeddingModel({ src: "obj-embed-model" });
      expect(idObj).toBe("mock-embed-id");
    });


    it("should load TTS Model successfully", async () => {
      mockLoadModel.mockResolvedValue("mock-tts-id");
      const id = await loadTTSModel();
      expect(id).toBe("mock-tts-id");
    });

    it("should handle model loading failures", async () => {
      mockLoadModel.mockRejectedValue(new Error("Load failed"));
      await expect(loadLLMModel()).rejects.toThrow("Load failed");
      await expect(loadEmbeddingModel()).rejects.toThrow("Load failed");
      await expect(loadTTSModel()).rejects.toThrow("Load failed");
    });

    it("should log error when unloading fails but not throw", async () => {
      mockUnloadModel.mockRejectedValue(new Error("Unload failed"));
      await expect(unloadQVACModel("mock-id")).resolves.not.toThrow();
    });

    it("should run Completion successfully with text", async () => {
      mockCompletion.mockResolvedValue({ text: Promise.resolve("hello") });
      const res = await runCompletion({
        modelId: "mock-id",
        history: [{ role: "user", content: "hi" }],
      });
      expect(res.text).toBe("hello");
    });

    it("should run Completion successfully with stream", async () => {
      const mockStream = { tokenStream: "stream-obj" };
      mockCompletion.mockReturnValue(mockStream);
      const res = await runCompletion({
        modelId: "mock-id",
        history: [{ role: "user", content: "hi" }],
        stream: true,
      });
      expect(res.tokenStream).toBe("stream-obj");
    });

    it("should run Completion with images if provided", async () => {
      mockCompletion.mockResolvedValue({ text: Promise.resolve("image-processed") });
      const img = new Uint8Array([1, 2, 3]);
      const res = await runCompletion({
        modelId: "mock-id",
        history: [{ role: "user", content: "hi" }],
        images: [img],
      });
      expect(res.text).toBe("image-processed");

      // Test empty images array to cover the empty branch check
      const resEmpty = await runCompletion({
        modelId: "mock-id",
        history: [{ role: "user", content: "hi" }],
        images: [],
      });
      expect(resEmpty.text).toBe("image-processed");
    });


    it("should handle runCompletion failures", async () => {
      mockCompletion.mockRejectedValue(new Error("Inference failed"));
      await expect(
        runCompletion({
          modelId: "mock-id",
          history: [],
        })
      ).rejects.toThrow("Inference failed");
    });

    it("should save embeddings successfully", async () => {
      mockRagIngest.mockResolvedValue({ success: true });
      const res = await runSaveEmbeddings({
        modelId: "mock-id",
        documents: ["doc1"],
        chunk: true,
      });
      expect(res).toEqual({ success: true });
    });

    it("should handle save embeddings failure", async () => {
      mockRagIngest.mockRejectedValue(new Error("Ingest failed"));
      await expect(
        runSaveEmbeddings({
          modelId: "mock-id",
          documents: [],
        })
      ).rejects.toThrow("Ingest failed");
    });

    it("should search RAG successfully", async () => {
      mockRagSearch.mockResolvedValue([{ content: "found" }]);
      const res = await runRagSearch({
        modelId: "mock-id",
        query: "test",
      });
      expect(res).toEqual([{ content: "found" }]);
    });

    it("should handle RAG search failure", async () => {
      mockRagSearch.mockRejectedValue(new Error("Search failed"));
      await expect(
        runRagSearch({
          modelId: "mock-id",
          query: "test",
        })
      ).rejects.toThrow("Search failed");
    });

    it("should synthesize TTS successfully", async () => {
      mockLoadModel.mockResolvedValue("mock-tts-id");
      mockTextToSpeech.mockReturnValue({ buffer: Promise.resolve(new Uint8Array([9, 9])) });
      mockUnloadModel.mockResolvedValue(undefined);

      const buffer = await runTextToSpeech({ text: "say hi" });
      expect(buffer).toEqual(new Uint8Array([9, 9]));
    });

    it("should handle TTS failure", async () => {
      mockLoadModel.mockResolvedValue("mock-tts-id");
      mockTextToSpeech.mockReturnValue({ buffer: Promise.reject(new Error("TTS failed")) });
      await expect(runTextToSpeech({ text: "say hi" })).rejects.toThrow("TTS failed");
    });

    it("should handle stopP2PProvider failures", async () => {
      mockStopQVACProvider.mockRejectedValue(new Error("Stop failed"));
      await expect(stopP2PProvider()).rejects.toThrow("Stop failed");
    });

    it("should pair with invalid key and handle errors in startP2PProvider", async () => {
      mockStartQVACProvider.mockRejectedValue(new Error("Start failed"));
      await expect(startP2PProvider({ topic: "test" })).rejects.toThrow("Start failed");
    });

    it("should start P2P provider successfully", async () => {
      mockStartQVACProvider.mockResolvedValue({ success: true, publicKey: "pubkey" });
      const res = await startP2PProvider({ topic: "test" });
      expect(res).toEqual({ success: true, publicKey: "pubkey" });

      // Test with firewall definition to cover the firewall branch
      const resFW = await startP2PProvider({
        topic: "test",
        firewall: { mode: "allow", publicKeys: ["key1"] }
      });
      expect(resFW).toEqual({ success: true, publicKey: "pubkey" });
    });

  });
});

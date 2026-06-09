import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import { promises as realFs } from "fs";

// ── Mocks: QVAC SDK (RAG controllable) + child_process; fs is REAL here so the
//    storage tests exercise true append/read roundtrips against a temp file. ──
const mockLoadModel = vi.fn();
const mockUnloadModel = vi.fn();
const mockRagIngest = vi.fn();
const mockRagSearch = vi.fn();

vi.mock("child_process", () => ({
  exec: vi.fn((cmd: string, cb: any) => cb(null, { stdout: "", stderr: "" })),
}));

vi.mock("@qvac/sdk", () => ({
  loadModel: (...a: any[]) => mockLoadModel(...a),
  unloadModel: (...a: any[]) => mockUnloadModel(...a),
  completion: vi.fn(),
  textToSpeech: vi.fn(),
  ragIngest: (...a: any[]) => mockRagIngest(...a),
  ragSearch: (...a: any[]) => mockRagSearch(...a),
  startQVACProvider: vi.fn(),
  stopQVACProvider: vi.fn(),
  LLAMA_3_2_1B_INST_Q4_0: "llama-model",
  GTE_LARGE_FP16: "gte-model",
  TTS_EN_ES_CHATTERBOX_Q4F16: { src: "tts-src" },
  WHISPER_EN_TINY_Q8_0: "whisper-model",
}));

import {
  getKnownEntities,
  registerKnownEntity,
  removeKnownEntity,
  clearKnownEntities,
  checkKnownEntity,
  KNOWN_ENTITY_THRESHOLD,
} from "../memory";
import { addRule, removeRule, setActiveRules, activeRules } from "../rules";
import { getSystemStatus } from "../power";
import { watchPIR, gpioAvailable } from "../gpio";
import { appendEvent, loadEvents, type PersistableEvent } from "../storage";
import { handleApiMutation } from "../../web/server";

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  mockLoadModel.mockResolvedValue("embed-model");
  mockUnloadModel.mockResolvedValue(undefined);
  mockRagIngest.mockResolvedValue(undefined);
  clearKnownEntities();
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errSpy.mockRestore();
});

// ── memory.ts (RAG known-entity allow-list) ──────────────────────────────────
describe("memory.ts — known-entity allow-list", () => {
  it("registers and returns a defensive copy of entities", () => {
    const e = registerKnownEntity({ label: "My truck", description: "silver pickup" });
    expect(e.id).toBeTruthy();
    const list = getKnownEntities();
    expect(list).toHaveLength(1);
    list[0].label = "MUTATED";
    expect(getKnownEntities()[0].label).toBe("My truck");
  });

  it("removes entities by id", () => {
    const e = registerKnownEntity({ label: "Dog", description: "golden retriever" });
    expect(removeKnownEntity(e.id)).toBe(true);
    expect(removeKnownEntity("missing")).toBe(false);
    expect(getKnownEntities()).toHaveLength(0);
  });

  it("returns matched:false immediately when no entities are registered", async () => {
    const res = await checkKnownEntity("a person near the shed");
    expect(res.matched).toBe(false);
    expect(mockLoadModel).not.toHaveBeenCalled();
  });

  it("matches a known entity above the threshold and unloads the model", async () => {
    registerKnownEntity({ label: "My silver truck", description: "silver Toyota Tacoma" });
    mockRagSearch.mockResolvedValue([{ content: "My silver truck: silver Toyota Tacoma", score: 0.82 }]);

    const res = await checkKnownEntity("a silver pickup truck in the driveway");
    expect(res.matched).toBe(true);
    expect(res.entity?.label).toBe("My silver truck");
    expect(res.score).toBe(0.82);
    expect(mockUnloadModel).toHaveBeenCalled(); // RAM freed
  });

  it("does not match below the threshold", async () => {
    registerKnownEntity({ label: "My truck", description: "silver pickup" });
    mockRagSearch.mockResolvedValue([{ content: "My truck: silver pickup", score: 0.2 }]);
    const res = await checkKnownEntity("an unknown person");
    expect(res.matched).toBe(false);
    expect(res.score).toBe(0.2);
  });

  it("fails safe (matched:false) when RAG throws, still unloading", async () => {
    registerKnownEntity({ label: "X", description: "y" });
    mockRagSearch.mockRejectedValue(new Error("rag boom"));
    const res = await checkKnownEntity("scene");
    expect(res.matched).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    expect(mockUnloadModel).toHaveBeenCalled();
  });

  it("exposes a sane default threshold", () => {
    expect(KNOWN_ENTITY_THRESHOLD).toBeGreaterThan(0);
    expect(KNOWN_ENTITY_THRESHOLD).toBeLessThan(1);
  });
});

// ── power.ts telemetry honesty (real RAM, sim flag, sensor override) ─────────
describe("power.ts — telemetry honesty", () => {
  const prevBatt = process.env.SCARECROW_BATTERY_PCT;
  const prevSolar = process.env.SCARECROW_SOLAR_W;
  afterEach(() => {
    if (prevBatt === undefined) delete process.env.SCARECROW_BATTERY_PCT;
    else process.env.SCARECROW_BATTERY_PCT = prevBatt;
    if (prevSolar === undefined) delete process.env.SCARECROW_SOLAR_W;
    else process.env.SCARECROW_SOLAR_W = prevSolar;
  });

  it("reports REAL measured RSS for ramUsedGB (tracks process.memoryUsage)", () => {
    const expected = Math.round((process.memoryUsage().rss / 1e9) * 100) / 100;
    const s = getSystemStatus();
    expect(s.ramUsedGB).toBeCloseTo(expected, 1);
    expect(s.ramUsedGB).toBeGreaterThan(0); // not a hardcoded constant
    expect(s.ramTotalGB).toBe(4);
  });

  it("flags battery/solar as simulated when no sensor env is set", () => {
    delete process.env.SCARECROW_BATTERY_PCT;
    delete process.env.SCARECROW_SOLAR_W;
    const s = getSystemStatus();
    expect(s.powerSimulated).toBe(true);
    expect(s.batteryPct).toBeGreaterThanOrEqual(45);
    expect(s.batteryPct).toBeLessThanOrEqual(99);
  });

  it("uses real sensor values (and clears the sim flag) when env is provided", () => {
    process.env.SCARECROW_BATTERY_PCT = "63";
    process.env.SCARECROW_SOLAR_W = "9";
    const s = getSystemStatus();
    expect(s.powerSimulated).toBe(false);
    expect(s.batteryPct).toBe(63);
    expect(s.solarWatts).toBe(9);
  });
});

// ── rules.ts (editable rules) ────────────────────────────────────────────────
describe("rules.ts — add/remove rules", () => {
  beforeEach(() => {
    setActiveRules([
      { id: "1", condition: "person near shed", action: "alert" },
      { id: "2", condition: "dog present", action: "ignore" },
    ]);
  });

  it("adds a rule with the next sequential id", () => {
    const r = addRule("vehicle in driveway", "alert");
    expect(r.id).toBe("3");
    expect(r.condition).toBe("vehicle in driveway");
    expect(activeRules).toHaveLength(3);
  });

  it("trims whitespace and rejects empty conditions", () => {
    expect(addRule("  spaced  ", "ignore").condition).toBe("spaced");
    expect(() => addRule("   ", "alert")).toThrow(/empty/i);
  });

  it("rejects invalid actions", () => {
    // @ts-expect-error testing runtime guard
    expect(() => addRule("x", "maybe")).toThrow(/Invalid action/);
  });

  it("removes a rule by id and reports success", () => {
    expect(removeRule("1")).toBe(true);
    expect(removeRule("nope")).toBe(false);
    expect(activeRules.map((r) => r.id)).toEqual(["2"]);
  });
});

// ── server.ts mutation router ────────────────────────────────────────────────
describe("server.ts — handleApiMutation", () => {
  beforeEach(() => {
    setActiveRules([{ id: "1", condition: "person near shed", action: "alert" }]);
    clearKnownEntities();
  });

  it("POST /api/rules creates a rule (201)", () => {
    const res = handleApiMutation("POST", "/api/rules", { condition: "car in driveway", action: "alert" });
    expect(res?.status).toBe(201);
    expect(JSON.parse(res!.body).rule.condition).toBe("car in driveway");
  });

  it("POST /api/rules with empty condition → 400", () => {
    const res = handleApiMutation("POST", "/api/rules", { condition: "", action: "alert" });
    expect(res?.status).toBe(400);
    expect(JSON.parse(res!.body).ok).toBe(false);
  });

  it("DELETE /api/rules/:id removes a rule, 404 when missing", () => {
    expect(handleApiMutation("DELETE", "/api/rules/1", {})?.status).toBe(200);
    expect(handleApiMutation("DELETE", "/api/rules/999", {})?.status).toBe(404);
  });

  it("POST /api/entities registers a known entity (201)", () => {
    const res = handleApiMutation("POST", "/api/entities", { label: "Truck", description: "silver pickup" });
    expect(res?.status).toBe(201);
    expect(getKnownEntities()).toHaveLength(1);
  });

  it("POST /api/entities requires label and description → 400", () => {
    expect(handleApiMutation("POST", "/api/entities", { label: "x" })?.status).toBe(400);
  });

  it("DELETE /api/entities/:id forgets an entity", () => {
    const e = registerKnownEntity({ label: "Cat", description: "tabby" });
    expect(handleApiMutation("DELETE", `/api/entities/${e.id}`, {})?.status).toBe(200);
    expect(handleApiMutation("DELETE", "/api/entities/missing", {})?.status).toBe(404);
  });

  it("returns null for non-mutation routes", () => {
    expect(handleApiMutation("GET", "/api/rules", {})).toBeNull();
    expect(handleApiMutation("POST", "/api/unknown", {})).toBeNull();
  });
});

// ── gpio.ts (PIR wake) ───────────────────────────────────────────────────────
describe("gpio.ts — PIR wake source", () => {
  afterEach(() => vi.useRealTimers());

  it("gpioAvailable() is false when simulation is forced via env", () => {
    const prev = process.env.SCARECROW_SIMULATE_PIR;
    process.env.SCARECROW_SIMULATE_PIR = "1";
    expect(gpioAvailable()).toBe(false);
    if (prev === undefined) delete process.env.SCARECROW_SIMULATE_PIR;
    else process.env.SCARECROW_SIMULATE_PIR = prev;
  });

  it("fires the motion handler on the simulated interval", () => {
    vi.useFakeTimers();
    const onMotion = vi.fn();
    const stop = watchPIR(onMotion, { simulate: true, simulateIntervalMs: 1000 });
    vi.advanceTimersByTime(3000);
    expect(onMotion).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(3000);
    expect(onMotion).toHaveBeenCalledTimes(3); // stopped → no more
  });

  it("swallows handler errors without crashing the watcher", () => {
    vi.useFakeTimers();
    const stop = watchPIR(() => {
      throw new Error("handler boom");
    }, { simulate: true, simulateIntervalMs: 500 });
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    stop();
  });
});

// ── storage.ts (JSONL persistence, real fs) ──────────────────────────────────
describe("storage.ts — JSONL event persistence", () => {
  const tmpFile = () =>
    path.join(os.tmpdir(), `scarecrow_events_${Date.now()}_${Math.random().toString(36).slice(2)}.jsonl`);

  const evt = (over: Partial<PersistableEvent> = {}): PersistableEvent => ({
    timestamp: "2026-06-09T14:23:01.000Z",
    sceneDescription: "person near shed",
    matchedRuleId: "1",
    alerted: true,
    ...over,
  });

  it("appends and reloads events (roundtrip)", async () => {
    const file = tmpFile();
    expect(await appendEvent(evt({ sceneDescription: "a" }), file)).toBe(true);
    expect(await appendEvent(evt({ sceneDescription: "b", alerted: false }), file)).toBe(true);
    const loaded = await loadEvents(file);
    expect(loaded.map((e) => e.sceneDescription)).toEqual(["a", "b"]);
    expect(loaded[1].alerted).toBe(false);
    await realFs.unlink(file).catch(() => {});
  });

  it("returns [] for a non-existent file", async () => {
    expect(await loadEvents(tmpFile())).toEqual([]);
  });

  it("skips malformed lines without throwing", async () => {
    const file = tmpFile();
    await realFs.writeFile(file, '{"timestamp":"t","sceneDescription":"ok","matchedRuleId":null,"alerted":false}\nNOT_JSON\n');
    const loaded = await loadEvents(file);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].sceneDescription).toBe("ok");
    await realFs.unlink(file).catch(() => {});
  });

  it("persists the recognizedEntity field", async () => {
    const file = tmpFile();
    await appendEvent(evt({ recognizedEntity: "My truck", alerted: false }), file);
    const loaded = await loadEvents(file);
    expect(loaded[0].recognizedEntity).toBe("My truck");
    await realFs.unlink(file).catch(() => {});
  });
});

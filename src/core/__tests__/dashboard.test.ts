import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks (mirror scarecrow.test.ts so the QVAC SDK never really loads) ──────
const mockLoadModel = vi.fn();
const mockUnloadModel = vi.fn();
const mockCompletion = vi.fn();
const mockTextToSpeech = vi.fn();
const mockStartQVACProvider = vi.fn();
const mockStopQVACProvider = vi.fn();

vi.mock("child_process", () => ({
  exec: vi.fn((cmd: string, cb: any) => cb(null, { stdout: "", stderr: "" })),
}));
vi.mock("fs/promises", () => ({
  default: {
    readFile: async (p: string) => {
      if (p.includes("404")) throw new Error("ENOENT");
      return p.endsWith(".html") ? Buffer.from("<html>scarecrow</html>") : Buffer.from("simulated_image_data");
    },
    unlink: async () => {},
  },
  readFile: async (p: string) => {
    if (p.includes("404")) throw new Error("ENOENT");
    return p.endsWith(".html") ? Buffer.from("<html>scarecrow</html>") : Buffer.from("simulated_image_data");
  },
  unlink: async () => {},
}));

vi.mock("@qvac/sdk", () => ({
  loadModel: (...a: any[]) => mockLoadModel(...a),
  unloadModel: (...a: any[]) => mockUnloadModel(...a),
  completion: (...a: any[]) => mockCompletion(...a),
  textToSpeech: (...a: any[]) => mockTextToSpeech(...a),
  ragIngest: vi.fn(),
  ragSearch: vi.fn(),
  startQVACProvider: (...a: any[]) => mockStartQVACProvider(...a),
  stopQVACProvider: (...a: any[]) => mockStopQVACProvider(...a),
  LLAMA_3_2_1B_INST_Q4_0: "llama-model",
  GTE_LARGE_FP16: "gte-model",
  TTS_EN_ES_CHATTERBOX_Q4F16: { src: "tts-src" },
  WHISPER_EN_TINY_Q8_0: "whisper-model",
}));

import {
  buildPhoneAlert,
  sendPhoneAlert,
  startAlertChannel,
  stopAlertChannel,
  isAlertChannelOpen,
  getProviderPublicKey,
  ALERT_TOPIC,
  type AlertableEvent,
} from "../p2p";

import { getSystemStatus, getActiveRules, wakeAndCheck } from "../power";

import {
  handleApiRequest,
  contentTypeFor,
  resolveStaticPath,
  createDashboardServer,
  startDashboardServer,
} from "../../web/server";

import http from "http";
import { AddressInfo } from "net";

const alertEvent: AlertableEvent = {
  timestamp: "2026-06-09T14:23:01.000Z",
  sceneDescription: "Person near the shed",
  matchedRuleId: "1",
  alerted: true,
};
const clearEvent: AlertableEvent = {
  timestamp: "2026-06-09T13:45:00.000Z",
  sceneDescription: "Dog on the porch",
  matchedRuleId: "2",
  alerted: false,
};

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  mockStartQVACProvider.mockResolvedValue({ success: true, publicKey: "PUBKEY123" });
  mockStopQVACProvider.mockResolvedValue(undefined);
  await stopAlertChannel().catch(() => {});
  vi.clearAllMocks();
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

// ── P2P phone alerts ─────────────────────────────────────────────────────────
describe("p2p.ts — phone alert channel", () => {
  it("builds a structured phone alert payload", () => {
    const payload = buildPhoneAlert(alertEvent);
    expect(payload.topic).toBe(ALERT_TOPIC);
    expect(payload.title).toContain("Scarecrow");
    expect(payload.body).toBe("Person near the shed");
    expect(payload.matchedRuleId).toBe("1");
    expect(payload.timestamp).toBe(alertEvent.timestamp);
  });

  it("honors a custom topic", () => {
    expect(buildPhoneAlert(alertEvent, "garage").topic).toBe("garage");
  });

  it("returns null and sends nothing for non-alerting events", async () => {
    const result = await sendPhoneAlert(clearEvent);
    expect(result).toBeNull();
    expect(mockStartQVACProvider).not.toHaveBeenCalled();
  });

  it("opens the channel and pushes for alerting events", async () => {
    const result = await sendPhoneAlert(alertEvent);
    expect(result).not.toBeNull();
    expect(result?.body).toBe("Person near the shed");
    expect(mockStartQVACProvider).toHaveBeenCalledTimes(1);
    expect(isAlertChannelOpen()).toBe(true);
    expect(getProviderPublicKey()).toBe("PUBKEY123");
  });

  it("reuses an already-open channel instead of reopening", async () => {
    await startAlertChannel();
    mockStartQVACProvider.mockClear();
    await sendPhoneAlert(alertEvent);
    expect(mockStartQVACProvider).not.toHaveBeenCalled();
  });

  it("applies a firewall allow-list when phone keys are provided", async () => {
    await startAlertChannel(["phoneKeyA", "phoneKeyB"]);
    const arg = mockStartQVACProvider.mock.calls[0][0];
    expect(arg.firewall).toEqual({ mode: "allow", publicKeys: ["phoneKeyA", "phoneKeyB"] });
  });

  it("omits the firewall when no keys are provided", async () => {
    await startAlertChannel();
    expect(mockStartQVACProvider.mock.calls[0][0].firewall).toBeUndefined();
  });

  it("does not throw when the P2P provider fails (offline)", async () => {
    mockStartQVACProvider.mockRejectedValueOnce(new Error("no peers"));
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendPhoneAlert(alertEvent);
    expect(result).not.toBeNull(); // payload still returned
    expect(warnSpy).toHaveBeenCalled();
    expect(consoleErrSpy).toHaveBeenCalled();
    consoleErrSpy.mockRestore();
  });

  it("stopAlertChannel resets state", async () => {
    await startAlertChannel();
    expect(isAlertChannelOpen()).toBe(true);
    await stopAlertChannel();
    expect(isAlertChannelOpen()).toBe(false);
    expect(getProviderPublicKey()).toBeNull();
  });
});

// ── Telemetry ────────────────────────────────────────────────────────────────
describe("power.ts — getSystemStatus telemetry", () => {
  it("reports the ≤4GB budget and local-only network", () => {
    const s = getSystemStatus();
    expect(s.ramTotalGB).toBe(4);
    expect(s.ramUsedGB).toBeLessThanOrEqual(4);
    expect(s.network).toBe("local-only");
  });

    it("keeps battery and solar in plausible ranges", () => {
      const st = getSystemStatus();
      expect(st.batteryPct).toBeGreaterThanOrEqual(45);
      expect(st.batteryPct).toBeLessThanOrEqual(100);
      expect(st.solarWatts).toBeGreaterThanOrEqual(0);
      expect(st.solarWatts).toBeLessThanOrEqual(25);
    });

    it("uses real power readings if env vars are present", () => {
      process.env.SCARECROW_BATTERY_PCT = "92";
      process.env.SCARECROW_SOLAR_W = "15";
      const st = getSystemStatus();
      expect(st.batteryPct).toBe(92);
      expect(st.solarWatts).toBe(15);
      delete process.env.SCARECROW_BATTERY_PCT;
      delete process.env.SCARECROW_SOLAR_W;
    });

  it("exposes a known pipeline stage and matching active model", () => {
    const s = getSystemStatus();
    expect(["idle", "capture", "vision", "rules", "alert"]).toContain(s.stage);
    expect(typeof s.activeModel).toBe("string");
  });

  it("returns to idle and counts events/frames after a check", async () => {
    mockLoadModel.mockResolvedValue("model-1");
    mockUnloadModel.mockResolvedValue(undefined);
    mockCompletion.mockResolvedValue({ text: '{"matchedRuleId":"1","action":"alert"}' });
    mockTextToSpeech.mockReturnValue({ buffer: Promise.resolve(Buffer.from("wav")) });

    const before = getSystemStatus();
    await wakeAndCheck();
    const after = getSystemStatus();

    expect(after.eventsToday).toBe(before.eventsToday + 1);
    expect(after.framesProcessed).toBeGreaterThanOrEqual(before.framesProcessed);
    expect(after.stage).toBe("idle"); // returns to sleep
    expect(after.lastEvent).not.toBeNull();
  });
});

describe("power.ts — getActiveRules", () => {
  it("returns a defensive copy of the active rules", () => {
    const rules = getActiveRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    rules[0].condition = "MUTATED";
    expect(getActiveRules()[0].condition).not.toBe("MUTATED");
  });

  it("each rule has an alert/ignore action", () => {
    for (const r of getActiveRules()) {
      expect(["alert", "ignore"]).toContain(r.action);
    }
  });
});

// ── Dashboard server routing ─────────────────────────────────────────────────
describe("server.ts — API router", () => {
  it("GET /api/status returns live status JSON", () => {
    const res = handleApiRequest("/api/status");
    expect(res?.status).toBe(200);
    const body = JSON.parse(res!.body);
    expect(body).toHaveProperty("armed");
    expect(body).toHaveProperty("ramTotalGB", 4);
    expect(body).toHaveProperty("network", "local-only");
  });

  it("GET /api/events returns an events array", () => {
    const res = handleApiRequest("/api/events");
    expect(res?.status).toBe(200);
    expect(Array.isArray(JSON.parse(res!.body).events)).toBe(true);
  });

  it("GET /api/rules returns a rules array", () => {
    const body = JSON.parse(handleApiRequest("/api/rules")!.body);
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.rules.length).toBeGreaterThan(0);
  });

  it("GET /api/entities returns an entities array", () => {
    const body = JSON.parse(handleApiRequest("/api/entities")!.body);
    expect(body).toHaveProperty("entities");
  });

  it("GET /api/health returns ok", () => {
    const body = JSON.parse(handleApiRequest("/api/health")!.body);
    expect(body.ok).toBe(true);
    expect(body.network).toBe("local-only");
  });

  it("returns null for non-API paths (static fallthrough)", () => {
    expect(handleApiRequest("/")).toBeNull();
    expect(handleApiRequest("/index.html")).toBeNull();
  });
});

describe("server.ts — static path & content types", () => {
  it("maps content types by extension", () => {
    expect(contentTypeFor("a.html")).toContain("text/html");
    expect(contentTypeFor("a.js")).toContain("javascript");
    expect(contentTypeFor("a.svg")).toBe("image/svg+xml");
    expect(contentTypeFor("a.png")).toBe("image/png");
    expect(contentTypeFor("a.unknown")).toBe("application/octet-stream");
  });

  it("resolves '/' to index.html", () => {
    expect(resolveStaticPath("/")).toMatch(/index\.html$/);
  });

  it("blocks directory traversal", () => {
    expect(resolveStaticPath("/../../etc/passwd")).toBeNull();
  });
});

describe("server.ts — live HTTP roundtrip", () => {
  it("serves /api/status and a static file over a real socket", async () => {
    const server = createDashboardServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;

    const get = (p: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        http
          .get({ host: "127.0.0.1", port, path: p }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
          })
          .on("error", reject);
      });

    const status = await get("/api/status");
    expect(status.status).toBe(200);
    expect(JSON.parse(status.body)).toHaveProperty("ramTotalGB", 4);

    const page = await get("/");
    expect(page.status).toBe(200);
    expect(page.body).toContain("scarecrow");

    const notFound = await get("/404.html");
    expect(notFound.status).toBe(404);
    expect(notFound.body).toBe("Not Found");

    const forbidden = await get("/../etc/passwd");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toBe("Forbidden");

    // Test mutations via HTTP
    const request = (method: string, p: string, payload?: any) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port, path: p, method }, (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
        }).on("error", reject);
        if (payload) req.write(JSON.stringify(payload));
        req.end();
      });

    const opts = await request("OPTIONS", "/api/rules");
    expect(opts.status).toBe(204);

    const postRule = await request("POST", "/api/rules", { condition: "test HTTP rule", action: "ignore" });
    expect(postRule.status).toBe(201);
    const ruleRes = JSON.parse(postRule.body);
    expect(ruleRes.rule.condition).toBe("test HTTP rule");

    const delRule = await request("DELETE", `/api/rules/${ruleRes.rule.id}`);
    expect(delRule.status).toBe(200);

    const postEntity = await request("POST", "/api/entities", { label: "Bob", description: "The builder" });
    expect(postEntity.status).toBe(201);
    const entRes = JSON.parse(postEntity.body);
    expect(entRes.entity.label).toBe("Bob");

    const delEntity = await request("DELETE", `/api/entities/${entRes.entity.id}`);
    expect(delEntity.status).toBe(200);

    const badPost = await new Promise<{ status: number }>((resolve) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/api/rules", method: "POST" }, (res) => {
        resolve({ status: res.statusCode || 0 });
      });
      req.write("{ bad json }");
      req.end();
    });
    expect(badPost.status).toBe(400); // the API catches it and returns 400

    // Missing label on POST /api/entities
    const badEntity1 = await request("POST", "/api/entities", { description: "OnlyDesc" });
    expect(badEntity1.status).toBe(400);

    // Missing description on POST /api/entities
    const badEntity2 = await request("POST", "/api/entities", { label: "OnlyLabel" });
    expect(badEntity2.status).toBe(400);

    // Empty body test
    const emptyPost = await new Promise<{ status: number }>((resolve) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/api/rules", method: "POST" }, (res) => {
        resolve({ status: res.statusCode || 0 });
      });
      req.end(); // no write
    });
    expect(emptyPost.status).toBe(400);

    // Test a non-mutation POST (should fall through to api request or 404)
    const unknownPost = await request("POST", "/api/404_mut");
    expect(unknownPost.status).toBe(404);

    // Test direct listener invocation with missing method/url
    const listener = server.listeners("request")[0] as (req: any, res: any) => void;
    const resMock = { writeHead: vi.fn(), end: vi.fn() };
    
    // 1. Missing method and url -> hits `method = "GET"` and `req.url = "/"`
    listener({ method: "", url: "", on: vi.fn() }, resMock);
    
    // 2. Mock POST with readBody throwing an error
    const errReq = {
      method: "POST",
      url: "/api/rules",
      on: (event: string, handler: any) => {
        if (event === "error") {
          // call handler to resolve readBody with {}
          setTimeout(handler, 10);
        }
      }
    };
    listener(errReq, resMock);

    await new Promise<void>((r) => server.close(() => r()));
  });

  it("startDashboardServer binds and starts the sentry loop", async () => {
    const server = startDashboardServer(0, 5000);
    await new Promise<void>((r) => server.once("listening", r));
    
    // The listen callback fires asynchronously, use vitest waitFor or simple poll
    for (let i = 0; i < 10; i++) {
      if (logSpy.mock.calls.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Scarecrow — AI Sentry is LIVE"));
    server.close();
  });
});

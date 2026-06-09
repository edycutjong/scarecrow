import { captureFrame, analyzeScene } from "./vision.js";
import { evaluateRules, activeRules } from "./rules.js";
import { runTextToSpeech } from "./qvac.js";
import { sendPhoneAlert } from "./p2p.js";
import { checkKnownEntity } from "./memory.js";
import { appendEvent, loadEvents } from "./storage.js";
import { watchPIR, type PIROptions } from "./gpio.js";

export interface SentryEvent {
  timestamp: string;
  sceneDescription: string;
  matchedRuleId: string | null;
  alerted: boolean;
  /** Label of a known-friendly entity that suppressed the alert, if any. */
  recognizedEntity?: string | null;
}

/** Pipeline stages, mirrored live by the dashboard. */
export type SentryStage = "idle" | "capture" | "vision" | "rules" | "alert";

export interface SystemStatus {
  armed: boolean;
  stage: SentryStage;
  activeModel: string;
  framesProcessed: number;
  eventsToday: number;
  alertsToday: number;
  lastEvent: SentryEvent | null;
  /** Real measured process resident memory (RSS), in GB. */
  ramUsedGB: number;
  /** The ≤4GB Pi budget we prove we stay under. */
  ramTotalGB: number;
  batteryPct: number;
  solarWatts: number;
  /** True when battery/solar are modelled (no INA219 sensor wired). */
  powerSimulated: boolean;
  network: "local-only";
  uptimeSec: number;
}

const eventLog: SentryEvent[] = [];
const bootTime = Date.now();

let currentStage: SentryStage = "idle";
let framesProcessed = 0;
let armed = false;

const STAGE_MODELS: Record<SentryStage, string> = {
  idle: "idle",
  capture: "Pi Camera",
  vision: "QVAC-Vision-1B",
  rules: "Llama 3.2 1B",
  alert: "Piper TTS",
};

function setStage(stage: SentryStage): void {
  currentStage = stage;
}

export function getEventLog(): SentryEvent[] {
  return [...eventLog];
}

/** Restore persisted events from disk into the in-memory log (called on boot). */
export async function hydrateEventLog(): Promise<number> {
  const persisted = await loadEvents();
  if (persisted.length > 0) {
    eventLog.unshift(...persisted);
    console.log(`[power] Restored ${persisted.length} persisted event(s) from disk.`);
  }
  return persisted.length;
}

/**
 * Battery/solar reading. If a power daemon exports real INA219 values via
 * `SCARECROW_BATTERY_PCT` / `SCARECROW_SOLAR_W`, those are used and flagged as
 * real; otherwise a smooth day/night model is returned and flagged simulated.
 */
function readPower(uptimeSec: number): {
  batteryPct: number;
  solarWatts: number;
  powerSimulated: boolean;
} {
  const envBatt = process.env.SCARECROW_BATTERY_PCT;
  const envSolar = process.env.SCARECROW_SOLAR_W;
  if (envBatt !== undefined && envSolar !== undefined) {
    return {
      batteryPct: Number(envBatt),
      solarWatts: Number(envSolar),
      powerSimulated: false,
    };
  }
  return {
    solarWatts: Math.round(Math.max(0, 14 + Math.sin(uptimeSec / 90) * 8)),
    batteryPct: Math.round(Math.max(45, Math.min(99, 78 + Math.sin(uptimeSec / 200) * 12))),
    powerSimulated: true,
  };
}

/**
 * Live telemetry for the dashboard. RAM is the *real* measured process RSS;
 * battery/solar come from a sensor when wired (see {@link readPower}), else a
 * model flagged via `powerSimulated`.
 */
export function getSystemStatus(): SystemStatus {
  const uptimeSec = (Date.now() - bootTime) / 1000;
  const alertsToday = eventLog.filter((e) => e.alerted).length;
  const power = readPower(uptimeSec);

  return {
    armed,
    stage: currentStage,
    activeModel: STAGE_MODELS[currentStage],
    framesProcessed,
    eventsToday: eventLog.length,
    alertsToday,
    lastEvent: eventLog.length ? eventLog[eventLog.length - 1] : null,
    ramUsedGB: Math.round((process.memoryUsage().rss / 1e9) * 100) / 100,
    ramTotalGB: 4,
    batteryPct: power.batteryPct,
    solarWatts: power.solarWatts,
    powerSimulated: power.powerSimulated,
    network: "local-only",
    uptimeSec: Math.round(uptimeSec),
  };
}

/** Active rules surfaced to the dashboard (read-only snapshot). */
export function getActiveRules() {
  return activeRules.map((r) => ({ ...r }));
}

export async function wakeAndCheck(): Promise<SentryEvent> {
  console.log("[power] Waking from PIR sensor trigger...");
  const timestamp = new Date().toISOString();

  // 1. Capture frame from camera
  setStage("capture");
  const frame = await captureFrame();
  if (!frame) {
    console.log("[power] No frame captured. Returning to sleep.");
    setStage("idle");
    const event: SentryEvent = {
      timestamp,
      sceneDescription: "No frame captured",
      matchedRuleId: null,
      alerted: false,
    };
    eventLog.push(event);
    void appendEvent(event);
    return event;
  }
  framesProcessed++;

  // 2. Multimodal Inference (Load → Infer → Unload to respect ≤4GB RAM)
  setStage("vision");
  const sceneDescription = await analyzeScene(frame);
  console.log(`[vision] Scene: ${sceneDescription}`);

  // 3. Rule Evaluation (Load → Infer → Unload)
  setStage("rules");
  const evalResult = await evaluateRules(sceneDescription);

  // 3b. Known-entity recognition (RAG) — suppress alerts for friendly entities
  //     (the owner's car, a household pet, the mail carrier, …).
  let shouldAlert = evalResult.shouldAlert;
  let recognizedEntity: string | null = null;
  if (shouldAlert) {
    const known = await checkKnownEntity(sceneDescription);
    if (known.matched && known.entity) {
      shouldAlert = false;
      recognizedEntity = known.entity.label;
      console.log(
        `[memory] 🧩 Recognised '${known.entity.label}' (score ${known.score?.toFixed(2)}) — alert suppressed.`
      );
    }
  }

  // 4. Action — spoken TTS alert or silent log
  if (shouldAlert && evalResult.matchedRule) {
    setStage("alert");
    const alertMessage = `Alert: ${evalResult.matchedRule.condition} detected.`;
    console.log(`[action] 🔴 ALERT TRIGGERED! Rule ${evalResult.matchedRule.id}: ${alertMessage}`);

    try {
      await runTextToSpeech({ text: alertMessage });
      console.log("[action] Spoken alert delivered via TTS.");
    } catch (err) {
      console.warn("[action] TTS alert failed, logged silently:", err);
    }
  } else {
    console.log("[action] ✅ No alert. Condition not met, exclusion rule, or known entity.");
  }

  const event: SentryEvent = {
    timestamp,
    sceneDescription,
    matchedRuleId: evalResult.matchedRule?.id ?? null,
    alerted: shouldAlert,
    recognizedEntity,
  };
  eventLog.push(event);
  void appendEvent(event); // best-effort JSONL persistence

  // 5. Push a P2P phone alert (no-op for non-alerting events / offline peers)
  await sendPhoneAlert(event);

  setStage("idle");
  console.log("[power] Returning to sleep state (RAM freed).");
  return event;
}

// ── Power-Aware Scheduling ──────────────────────────────────────────────────

let sentryInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the sentry loop with a configurable interval (ms).
 * Default: 10 seconds between checks (power-aware).
 */
export function startSentryLoop(intervalMs: number = 10_000): void {
  if (sentryInterval) {
    console.warn("[power] Sentry loop already running.");
    return;
  }
  console.log(`[power] Starting sentry loop (interval: ${intervalMs}ms)`);
  armed = true;
  sentryInterval = setInterval(() => {
    wakeAndCheck().catch((err) =>
      console.error("[power] Sentry check error:", err)
    );
  }, intervalMs);
}

/**
 * Power-optimal mode: stay asleep and run a check only when the PIR sensor
 * reports motion (vs. the fixed-interval `startSentryLoop`). Returns a stop
 * function that detaches the watch.
 */
export function startPIRSentry(opts: PIROptions = {}): () => void {
  console.log("[power] Arming PIR-triggered sentry (sleep → motion → check → sleep)");
  armed = true;
  let busy = false;
  const stop = watchPIR(() => {
    if (busy) return; // skip motion while a check is already running
    busy = true;
    wakeAndCheck()
      .catch((err) => console.error("[power] PIR sentry check error:", err))
      .finally(() => {
        busy = false;
      });
  }, opts);
  return () => {
    stop();
    armed = false;
    setStage("idle");
    console.log("[power] PIR sentry disarmed.");
  };
}

export function stopSentryLoop(): void {
  if (sentryInterval) {
    clearInterval(sentryInterval);
    sentryInterval = null;
    armed = false;
    setStage("idle");
    console.log("[power] Sentry loop stopped.");
  }
}

// Start the loop automatically if this file is run directly (not imported in tests)
/* v8 ignore next 4 */
if (process.argv[1] && process.argv[1].endsWith("power.ts")) {
  console.log("[power] Booting Scarecrow Sentry...");
  startSentryLoop();
}

import { captureFrame, analyzeScene } from "./vision.js";
import { evaluateRules } from "./rules.js";
import { runTextToSpeech } from "./qvac.js";

export interface SentryEvent {
  timestamp: string;
  sceneDescription: string;
  matchedRuleId: string | null;
  alerted: boolean;
}

const eventLog: SentryEvent[] = [];

export function getEventLog(): SentryEvent[] {
  return [...eventLog];
}

export async function wakeAndCheck(): Promise<SentryEvent> {
  console.log("[power] Waking from PIR sensor trigger...");
  const timestamp = new Date().toISOString();

  // 1. Capture frame from camera
  const frame = await captureFrame();
  if (!frame) {
    console.log("[power] No frame captured. Returning to sleep.");
    const event: SentryEvent = {
      timestamp,
      sceneDescription: "No frame captured",
      matchedRuleId: null,
      alerted: false,
    };
    eventLog.push(event);
    return event;
  }

  // 2. Multimodal Inference (Load → Infer → Unload to respect ≤4GB RAM)
  const sceneDescription = await analyzeScene(frame);
  console.log(`[vision] Scene: ${sceneDescription}`);

  // 3. Rule Evaluation (Load → Infer → Unload)
  const evalResult = await evaluateRules(sceneDescription);

  // 4. Action — spoken TTS alert or silent log
  if (evalResult.shouldAlert && evalResult.matchedRule) {
    const alertMessage = `Alert: ${evalResult.matchedRule.condition} detected.`;
    console.log(`[action] 🔴 ALERT TRIGGERED! Rule ${evalResult.matchedRule.id}: ${alertMessage}`);

    try {
      await runTextToSpeech({ text: alertMessage });
      console.log("[action] Spoken alert delivered via TTS.");
    } catch (err) {
      console.warn("[action] TTS alert failed, logged silently:", err);
    }
  } else {
    console.log("[action] ✅ No alert. Condition not met or exclusion rule applied.");
  }

  const event: SentryEvent = {
    timestamp,
    sceneDescription,
    matchedRuleId: evalResult.matchedRule?.id ?? null,
    alerted: evalResult.shouldAlert,
  };
  eventLog.push(event);

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
  sentryInterval = setInterval(() => {
    wakeAndCheck().catch((err) =>
      console.error("[power] Sentry check error:", err)
    );
  }, intervalMs);
}

export function stopSentryLoop(): void {
  if (sentryInterval) {
    clearInterval(sentryInterval);
    sentryInterval = null;
    console.log("[power] Sentry loop stopped.");
  }
}

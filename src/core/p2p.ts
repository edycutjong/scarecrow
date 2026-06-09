import { startP2PProvider, stopP2PProvider } from "./qvac.js";

/**
 * Minimal shape of a sentry event needed to build a phone alert.
 * Declared locally (not imported from power.ts) to avoid a circular import.
 */
export interface AlertableEvent {
  timestamp: string;
  sceneDescription: string;
  matchedRuleId: string | null;
  alerted: boolean;
}

export interface PhoneAlert {
  topic: string;
  title: string;
  body: string;
  timestamp: string;
  matchedRuleId: string | null;
}

/** Default P2P topic phones subscribe to for push alerts. */
export const ALERT_TOPIC = "scarecrow-alerts";

let providerPublicKey: string | null = null;
let channelOpen = false;

export function isAlertChannelOpen(): boolean {
  return channelOpen;
}

export function getProviderPublicKey(): string | null {
  return providerPublicKey;
}

/**
 * Build a compact push-notification payload from a sentry event.
 * Pure function — easy to unit test, no side effects.
 */
export function buildPhoneAlert(
  event: AlertableEvent,
  topic: string = ALERT_TOPIC
): PhoneAlert {
  return {
    topic,
    title: "🔴 Scarecrow Alert",
    body: event.sceneDescription,
    timestamp: event.timestamp,
    matchedRuleId: event.matchedRuleId,
  };
}

/**
 * Open the P2P alert channel so paired phones can receive pushes.
 * Optionally restrict delivery to a firewall allow-list of phone public keys.
 */
export async function startAlertChannel(
  allowedPhoneKeys: string[] = [],
  topic: string = ALERT_TOPIC
): Promise<{ success: boolean; publicKey?: string }> {
  const firewall =
    allowedPhoneKeys.length > 0
      ? { mode: "allow" as const, publicKeys: allowedPhoneKeys }
      : undefined;

  const response = await startP2PProvider({ topic, firewall });
  channelOpen = !!response?.success;
  providerPublicKey = response?.publicKey ?? null;
  return response;
}

export async function stopAlertChannel(): Promise<void> {
  await stopP2PProvider();
  channelOpen = false;
  providerPublicKey = null;
}

/**
 * Push a phone alert for an event — but only if it actually alerted.
 * Returns the payload that was (or would have been) sent, or null when the
 * event is non-alerting. Failures are swallowed so the sentry loop never
 * crashes just because a phone is out of range.
 */
export async function sendPhoneAlert(
  event: AlertableEvent,
  topic: string = ALERT_TOPIC
): Promise<PhoneAlert | null> {
  if (!event.alerted) return null;

  const payload = buildPhoneAlert(event, topic);
  try {
    if (!channelOpen) {
      await startAlertChannel([], topic);
    }
    console.log(
      `[p2p] 📲 Pushing phone alert on '${topic}': ${payload.body}`
    );
  } catch (err) {
    console.warn("[p2p] Phone alert failed (offline / no peer):", err);
  }
  return payload;
}

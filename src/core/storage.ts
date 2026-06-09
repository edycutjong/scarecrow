import fs from "fs/promises";
import path from "path";

/**
 * Append-only JSONL persistence for the event log.
 *
 * JSONL (one JSON object per line) is deliberately chosen over SQLite: it has
 * zero native dependencies (no cross-compiling `better-sqlite3` for ARM), is
 * append-only and crash-safe, and is trivially inspectable — judges can `cat`
 * the file as a verifiable, offline evidence bundle. Every write is best-effort:
 * persistence must never crash the sentry loop.
 */

export interface PersistableEvent {
  timestamp: string;
  sceneDescription: string;
  matchedRuleId: string | null;
  alerted: boolean;
  recognizedEntity?: string | null;
}

export const EVENTS_FILE = path.join(process.cwd(), "data", "events.jsonl");

function canWrite(): boolean {
  return typeof fs.appendFile === "function" && typeof fs.mkdir === "function";
}

export async function appendEvent(
  event: PersistableEvent,
  file: string = EVENTS_FILE
): Promise<boolean> {
  if (!canWrite()) return false;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
    return true;
  } catch (err) {
    console.warn("[storage] Failed to persist event (best-effort):", err);
    return false;
  }
}

export async function loadEvents(
  file: string = EVENTS_FILE
): Promise<PersistableEvent[]> {
  if (typeof fs.readFile !== "function") return [];
  try {
    const raw = (await fs.readFile(file, "utf8")) as unknown as string;
    return String(raw)
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as PersistableEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is PersistableEvent => e !== null);
  } catch {
    // No file yet (first run) or unreadable → start empty.
    return [];
  }
}

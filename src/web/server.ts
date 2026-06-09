import http from "http";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  getEventLog,
  getSystemStatus,
  getActiveRules,
  startSentryLoop,
  hydrateEventLog,
} from "../core/power.js";
import { addRule, removeRule } from "../core/rules.js";
import {
  getKnownEntities,
  registerKnownEntity,
  removeKnownEntity,
} from "../core/memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = __dirname;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

export interface ApiResponse {
  status: number;
  body: string;
  contentType: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function json(data: unknown, status = 200): ApiResponse {
  return { status, body: JSON.stringify(data), contentType: "application/json; charset=utf-8" };
}

/**
 * Pure API router — maps an API pathname to a JSON response, or returns null
 * if the path is not an API route (so the caller falls back to static files).
 * Kept side-effect free for straightforward unit testing.
 */
export function handleApiRequest(pathname: string): ApiResponse | null {
  switch (pathname) {
    case "/api/status":
      return json(getSystemStatus());
    case "/api/events":
      return json({ events: getEventLog() });
    case "/api/rules":
      return json({ rules: getActiveRules() });
    case "/api/entities":
      return json({ entities: getKnownEntities() });
    case "/api/health":
      return json({ ok: true, service: "scarecrow", network: "local-only" });
    default:
      return null;
  }
}

/**
 * Pure mutation router for POST/DELETE — takes the method, pathname and an
 * already-parsed JSON body, returns a response or null for non-mutation routes.
 * Side-effects are limited to the in-memory rule/entity stores (easy to test).
 */
export function handleApiMutation(
  method: string,
  pathname: string,
  body: Record<string, unknown>
): ApiResponse | null {
  // Rules ───────────────────────────────────────────────
  if (pathname === "/api/rules" && method === "POST") {
    try {
      const rule = addRule(String(body.condition ?? ""), body.action as "alert" | "ignore");
      return json({ ok: true, rule }, 201);
    } catch (err) {
      return json({ ok: false, error: (err as Error).message }, 400);
    }
  }
  const ruleDel = pathname.match(/^\/api\/rules\/([^/]+)$/);
  if (ruleDel && method === "DELETE") {
    const removed = removeRule(decodeURIComponent(ruleDel[1]));
    return json({ ok: removed }, removed ? 200 : 404);
  }

  // Known entities ──────────────────────────────────────
  if (pathname === "/api/entities" && method === "POST") {
    const label = String(body.label ?? "").trim();
    const description = String(body.description ?? "").trim();
    if (!label || !description) {
      return json({ ok: false, error: "label and description are required" }, 400);
    }
    const entity = registerKnownEntity({ label, description });
    return json({ ok: true, entity }, 201);
  }
  const entDel = pathname.match(/^\/api\/entities\/([^/]+)$/);
  if (entDel && method === "DELETE") {
    const removed = removeKnownEntity(decodeURIComponent(entDel[1]));
    return json({ ok: removed }, removed ? 200 : 404);
  }

  return null;
}

/**
 * Resolve a request path to a safe absolute file inside the web/public dirs.
 * Returns null on directory-traversal attempts.
 */
export function resolveStaticPath(pathname: string): string | null {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (rel.includes("..")) return null;
  return path.join(WEB_DIR, rel);
}

async function readStatic(pathname: string): Promise<ApiResponse> {
  const safe = resolveStaticPath(pathname);
  if (!safe) return { status: 403, body: "Forbidden", contentType: "text/plain" };

  const candidates = [safe, path.join(PUBLIC_DIR, path.basename(safe))];
  for (const file of candidates) {
    try {
      const buf = await fs.readFile(file);
      return { status: 200, body: buf as unknown as string, contentType: contentTypeFor(file) };
    } catch {
      /* try next candidate */
    }
  }
  return { status: 404, body: "Not Found", contentType: "text/plain" };
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function createDashboardServer(): http.Server {
  return http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const pathname = (req.url || "/").split("?")[0];

    // CORS preflight for phone-originated mutations.
    if (method === "OPTIONS") {
      res.writeHead(204, JSON_HEADERS);
      res.end();
      return;
    }

    // Mutations (POST/DELETE): add/remove rules and known entities.
    if (method === "POST" || method === "DELETE") {
      const body = method === "POST" ? await readBody(req) : {};
      const mut = handleApiMutation(method, pathname, body);
      if (mut) {
        res.writeHead(mut.status, { "Content-Type": mut.contentType, ...JSON_HEADERS });
        res.end(mut.body);
        return;
      }
    }

    const api = handleApiRequest(pathname);
    if (api) {
      res.writeHead(api.status, { "Content-Type": api.contentType, ...JSON_HEADERS });
      res.end(api.body);
      return;
    }

    const file = await readStatic(pathname);
    res.writeHead(file.status, { "Content-Type": file.contentType });
    res.end(file.body);
  });
}

/**
 * Boot the local dashboard over the Pi's hotspot and start the sentry loop.
 * Binds 0.0.0.0 so phones joined to the AP can reach 192.168.4.1:PORT.
 */
export function startDashboardServer(port = 8080, intervalMs = 10_000): http.Server {
  const server = createDashboardServer();
  server.listen(port, "0.0.0.0", async () => {
    await hydrateEventLog(); // restore persisted events from previous runs
    console.log(`[web] 📡 Scarecrow dashboard live at http://0.0.0.0:${port} (Pi hotspot)`);
    startSentryLoop(intervalMs);
  });
  return server;
}

// Entrypoint: `npm start` runs this file directly.
/* v8 ignore next 4 */
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  const port = Number(process.env.PORT) || 8080;
  startDashboardServer(port);
}

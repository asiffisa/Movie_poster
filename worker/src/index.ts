import { DurableObject } from "cloudflare:workers";

interface Env {
  // This secret is intentionally set with `wrangler secret put`, so it is not
  // present in wrangler.jsonc or generated binding types.
  TMDB_API_KEY: string;
  RATE_LIMITER: DurableObjectNamespace<RequestRateLimiter>;
}

interface RateLimitRecord extends Record<string, SqlStorageValue> {
  windowStart: number;
  requestCount: number;
}

interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const CACHE_SECONDS = 10 * 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 200;
const RATE_LIMIT_SHARD_PREFIX_LENGTH = 2;
const MAX_QUERY_PARAMETERS = 8;
const MAX_QUERY_LENGTH = 120;

const staticPaths = new Set([
  "/configuration",
  "/genre/movie/list",
  "/genre/tv/list",
  "/search/movie",
  "/search/tv",
  "/search/person",
  "/discover/movie",
  "/discover/tv",
  "/movie/popular",
  "/movie/upcoming",
  "/movie/now_playing",
  "/movie/top_rated",
  "/tv/popular",
  "/tv/on_the_air",
  "/tv/airing_today",
  "/tv/top_rated"
]);

const sensitiveQueryParameters = new Set(["api_key", "api_token", "access_token"]);
const supportedQueryParameters = new Set([
  "append_to_response",
  "first_air_date.gte",
  "include_adult",
  "include_image_language",
  "include_video",
  "language",
  "page",
  "primary_release_date.gte",
  "query",
  "sort_by",
  "vote_average.gte",
  "vote_count.gte"
]);

function isAllowedTmdbPath(pathname: string): boolean {
  if (staticPaths.has(pathname)) return true;

  return [
    /^\/trending\/(movie|tv|person|all)\/(day|week)$/,
    /^\/(movie|tv)\/(popular|upcoming|now_playing|top_rated|on_the_air|airing_today)$/,
    /^\/(movie|tv)\/\d+$/,
    /^\/(movie|tv)\/\d+\/(credits|images|recommendations|similar|watch\/providers)$/,
    /^\/person\/\d+\/(movie_credits|tv_credits|combined_credits|images)$/
  ].some((pattern) => pattern.test(pathname));
}

function responseHeaders(contentType: string | null, cacheable = false): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": cacheable
      ? `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`
      : "no-store"
  });

  if (contentType) headers.set("Content-Type", contentType);
  return headers;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders("application/json; charset=utf-8")
  });
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidQueryValue(key: string, value: string): boolean {
  if (value.length === 0 || value.length > MAX_QUERY_LENGTH) return false;

  switch (key) {
    case "append_to_response":
      return value === "credits,images,recommendations";
    case "first_air_date.gte":
    case "primary_release_date.gte":
      return isValidDate(value);
    case "include_adult":
    case "include_video":
      return value === "false";
    case "include_image_language":
      return value === "en,null";
    case "language":
      return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value);
    case "page": {
      const page = Number(value);
      return Number.isInteger(page) && page >= 1 && page <= 500;
    }
    case "query":
      return !Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code === 0x7f;
      });
    case "sort_by":
      return value === "popularity.desc" || value === "primary_release_date.asc";
    case "vote_average.gte": {
      const rating = Number(value);
      return Number.isFinite(rating) && rating >= 0 && rating <= 10;
    }
    case "vote_count.gte": {
      const voteCount = Number(value);
      return Number.isInteger(voteCount) && voteCount >= 0 && voteCount <= 1_000_000;
    }
    default:
      return false;
  }
}

function normaliseQuery(searchParams: URLSearchParams): URLSearchParams | null {
  const entries = [...searchParams.entries()];
  if (entries.length > MAX_QUERY_PARAMETERS) return null;

  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (sensitiveQueryParameters.has(key) || !supportedQueryParameters.has(key) || seen.has(key)) return null;
    if (!isValidQueryValue(key, value)) return null;
    seen.add(key);
  }

  return new URLSearchParams(entries.sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey)));
}

function logError(event: string, fields: Record<string, string | number>): void {
  console.error(JSON.stringify({ event, ...fields }));
}

async function requestFingerprint(request: Request, secret: string): Promise<string> {
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const input = new TextEncoder().encode(`${secret}\u0000${clientIp}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class RequestRateLimiter extends DurableObject<Env> {
  private lastCleanupAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          client_hash TEXT PRIMARY KEY,
          window_start INTEGER NOT NULL,
          request_count INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);
      `);
    });
  }

  async check(clientHash: string, now: number): Promise<RateLimitDecision> {
    const windowStart = Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
    if (this.lastCleanupAt < now - RATE_LIMIT_WINDOW_MS) {
      this.ctx.storage.sql.exec(
        "DELETE FROM rate_limits WHERE window_start < ?",
        windowStart - RATE_LIMIT_WINDOW_MS
      );
      this.lastCleanupAt = now;
    }

    const current = this.ctx.storage.sql
      .exec<RateLimitRecord>(
        "SELECT window_start as windowStart, request_count as requestCount FROM rate_limits WHERE client_hash = ?",
        clientHash
      )
      .toArray()[0];

    if (!current || current.windowStart !== windowStart) {
      this.ctx.storage.sql.exec(
        `INSERT INTO rate_limits (client_hash, window_start, request_count)
         VALUES (?, ?, 1)
         ON CONFLICT(client_hash) DO UPDATE SET window_start = excluded.window_start, request_count = 1`,
        clientHash,
        windowStart
      );
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.requestCount >= RATE_LIMIT_MAX_REQUESTS) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000))
      };
    }

    this.ctx.storage.sql.exec(
      "UPDATE rate_limits SET request_count = request_count + 1 WHERE client_hash = ?",
      clientHash
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

async function rateLimitResponse(request: Request, env: Env): Promise<Response | null> {
  const fingerprint = await requestFingerprint(request, env.TMDB_API_KEY);
  const limiter = env.RATE_LIMITER.getByName(`tmdb-rate-limit-${fingerprint.slice(0, RATE_LIMIT_SHARD_PREFIX_LENGTH)}`);
  const decision = await limiter.check(fingerprint, Date.now());
  if (decision.allowed) return null;

  const response = jsonResponse({ error: "Too many requests. Try after a minute." }, 429);
  response.headers.set("Retry-After", String(decision.retryAfterSeconds));
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    const requestUrl = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: responseHeaders(null) });
      }

      if (requestUrl.pathname === "/health") {
        return jsonResponse({ ok: true }, 200);
      }

      if (request.method !== "GET") {
        return jsonResponse({ error: "Only GET requests are supported." }, 405);
      }

      if (!requestUrl.pathname.startsWith("/tmdb/")) {
        return jsonResponse({ error: "Unknown endpoint." }, 404);
      }

      const tmdbPath = requestUrl.pathname.slice("/tmdb".length);
      if (!isAllowedTmdbPath(tmdbPath)) {
        return jsonResponse({ error: "This TMDB endpoint is not allowed." }, 403);
      }

      if (!env.TMDB_API_KEY) {
        logError("tmdb_secret_missing", { requestId, path: tmdbPath });
        return jsonResponse({ error: "TMDB service is not configured." }, 500);
      }

      const query = normaliseQuery(requestUrl.searchParams);
      if (!query) {
        return jsonResponse({ error: "Unsupported query parameters." }, 400);
      }

      const limited = await rateLimitResponse(request, env);
      if (limited) return limited;

      const tmdbUrl = new URL(`${TMDB_API_BASE}${tmdbPath}`);
      tmdbUrl.search = query.toString();
      tmdbUrl.searchParams.set("api_key", env.TMDB_API_KEY);

      const cacheUrl = new URL(request.url);
      cacheUrl.search = query.toString();
      const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
      const cache = caches.default;
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) return cachedResponse;

      const upstream = await fetch(tmdbUrl.toString(), {
        headers: { Accept: "application/json" }
      });
      const response = new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders(upstream.headers.get("Content-Type"), upstream.ok)
      });

      if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      logError("tmdb_request_failed", {
        requestId,
        path: requestUrl.pathname,
        error: error instanceof Error ? error.message : "unknown"
      });
      return jsonResponse({ error: "TMDB is temporarily unavailable." }, 502);
    }
  }
} satisfies ExportedHandler<Env>;

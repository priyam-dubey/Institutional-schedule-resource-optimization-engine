/**
 * Central, fail-fast configuration helpers.
 * Nothing here ships a usable default secret into production.
 */

const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-do-not-use-in-production";
let warned = false;

export function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production");
  }
  if (!warned) {
    warned = true;
    console.warn("[config] JWT_SECRET missing or shorter than 32 chars: using an insecure development secret");
  }
  return DEV_FALLBACK_SECRET;
}

/** Comma-separated allow-list. A wildcard is never used together with credentials. */
export function corsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.NODE_ENV === "production") {
    throw new Error("CORS_ORIGIN must be set in production (comma-separated list of allowed origins)");
  }
  return ["http://localhost:3000", "http://localhost:5173"];
}

export const JWT_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS ?? 8 * 60 * 60);

import { getRequest } from "@tanstack/react-start/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL_MS = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

function callerKey(): string {
  try {
    const request = getRequest();
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
    return request.headers.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

export function checkRateLimit(
  key: string,
  maxHits: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= maxHits,
    remaining: Math.max(0, maxHits - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function checkRateLimitOrThrow(action: string, maxHits: number, windowMs: number): void {
  const ip = callerKey();
  const key = `${action}:${ip}`;
  const result = checkRateLimit(key, maxHits, windowMs);
  if (!result.allowed) {
    throw new Error("Too many requests. Please try again later.");
  }
}

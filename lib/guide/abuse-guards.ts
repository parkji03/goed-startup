import { createHash } from 'node:crypto';

const PER_MINUTE = 10;
const PER_HOUR = 60;
const MAX_INPUT_CHARS = 2000;
const MAX_BODY_BYTES = 32 * 1024;

type Hits = { perMinute: number[]; perHour: number[] };
const counters = new Map<string, Hits>();

export function __resetForTests(): void {
  counters.clear();
}

export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

type CheckResult = { ok: true } | { ok: false; reason: 'per-minute' | 'per-hour' };

/** Pure-ish (mutates module state). Records the hit AND returns whether it's allowed. */
export function recordAndCheck(hashedIp: string, nowMs: number): CheckResult {
  const minuteAgo = nowMs - 60_000;
  const hourAgo = nowMs - 60 * 60_000;
  const existing = counters.get(hashedIp) ?? { perMinute: [], perHour: [] };
  const perMinute = existing.perMinute.filter((t) => t > minuteAgo);
  const perHour = existing.perHour.filter((t) => t > hourAgo);

  if (perMinute.length >= PER_MINUTE) {
    counters.set(hashedIp, { perMinute, perHour });
    return { ok: false, reason: 'per-minute' };
  }
  if (perHour.length >= PER_HOUR) {
    counters.set(hashedIp, { perMinute, perHour });
    return { ok: false, reason: 'per-hour' };
  }
  perMinute.push(nowMs);
  perHour.push(nowMs);
  counters.set(hashedIp, { perMinute, perHour });
  return { ok: true };
}

export type GuardCheck =
  | { ok: true; hashedIp: string }
  | { ok: false; status: number; body: { error: string } };

/**
 * Single chokepoint for /api/chat. Validates body size, extracts IP,
 * checks per-IP rate limits.
 */
export async function enforceLimits(req: Request): Promise<GuardCheck> {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    return { ok: false, status: 500, body: { error: 'Server misconfigured: IP_HASH_SALT missing.' } };
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, body: { error: 'Request too large.' } };
  }

  const xff = req.headers.get('x-forwarded-for');
  const ip = xff?.split(',')[0]?.trim();
  if (!ip) {
    return { ok: false, status: 400, body: { error: 'Could not identify client.' } };
  }

  const hashedIp = hashIp(ip, salt);
  const limit = recordAndCheck(hashedIp, Date.now());
  if (!limit.ok) {
    const retry = limit.reason === 'per-minute' ? 60 : 3600;
    return { ok: false, status: 429, body: { error: `Too many requests (${limit.reason}). Try again in ${retry}s.` } };
  }
  return { ok: true, hashedIp };
}

/** Length cap for the user's freshly-typed message (the last user turn). */
export function validateUserMessageText(text: string): { ok: true } | { ok: false; status: number; body: { error: string } } {
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, status: 400, body: { error: `Message too long (max ${MAX_INPUT_CHARS} chars).` } };
  }
  return { ok: true };
}

/** Cap conversation history length sent to the model. */
export const HISTORY_TURN_CAP = 10;

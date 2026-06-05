// In-memory per-email throttle for the Credentials login flow.
//
// Caps: at most MAX_FAILED_ATTEMPTS failures in WINDOW_MS, after which any
// further `authorize()` calls for that email short-circuit (return false)
// for COOLDOWN_MS before counters reset. A successful login clears the
// counter immediately.
//
// In-memory means this is per-process — a single dev/prod Node instance is
// covered; horizontally-scaled deployments need a shared store (Redis, DB).
// For an internal tool deployed as a single Next.js process behind a VPN
// this is enough to defeat credential-stuffing scripts without operating
// new infra.

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60_000; // 5 minutes
const COOLDOWN_MS = 15 * 60_000; // 15 minutes

type Bucket = {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
};

const buckets = new Map<string, Bucket>();

function keyFor(email: string): string {
  return email.trim().toLowerCase();
}

// Returns false when the email is currently locked out. Call this before
// running bcrypt — it lets the system reject probable brute-force traffic
// without spending bcrypt CPU on every guess.
export function isLoginLocked(email: string, now = Date.now()): boolean {
  const b = buckets.get(keyFor(email));
  if (!b) return false;
  return b.lockedUntil > now;
}

// Record a failed login. If the failure window has rolled over, the bucket
// resets first. When the counter reaches MAX_FAILED_ATTEMPTS the bucket is
// locked for COOLDOWN_MS.
export function recordLoginFailure(email: string, now = Date.now()): void {
  const key = keyFor(email);
  let b = buckets.get(key);
  if (!b || now - b.firstFailureAt > WINDOW_MS) {
    b = { failures: 0, firstFailureAt: now, lockedUntil: 0 };
    buckets.set(key, b);
  }
  b.failures += 1;
  if (b.failures >= MAX_FAILED_ATTEMPTS) {
    b.lockedUntil = now + COOLDOWN_MS;
  }
}

// Successful login: drop the bucket so the next failure starts fresh.
export function clearLoginFailures(email: string): void {
  buckets.delete(keyFor(email));
}

// Testing aid — not exported through the public surface.
export function _resetForTests(): void {
  buckets.clear();
}

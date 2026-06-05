import { timingSafeEqual } from "node:crypto";

// Verifies the shared-secret header used to protect cron endpoints.
// Pass the secret as `Authorization: Bearer <CRON_SECRET>` or as `x-cron-secret`.
//
// Comparisons go through `crypto.timingSafeEqual` so a wrong secret takes the
// same time as a right one (preventing byte-by-byte timing side channels).
// `timingSafeEqual` requires equal-length buffers — we route through the
// `safeEqual` helper which pads both inputs to a fixed length so the function
// never short-circuits on length differences either.
export function isAuthorizedCronRequest(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const auth = req.headers.get("authorization");
  if (auth && safeEqual(auth, `Bearer ${expected}`)) return true;

  const x = req.headers.get("x-cron-secret");
  if (x && safeEqual(x, expected)) return true;

  return false;
}

function safeEqual(a: string, b: string): boolean {
  // Pad both to the same byte length before comparing — `timingSafeEqual`
  // throws on length mismatch, which would itself be a side channel.
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  const len = Math.max(ba.length, bb.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ba.copy(pa);
  bb.copy(pb);
  return ba.length === bb.length && timingSafeEqual(pa, pb);
}

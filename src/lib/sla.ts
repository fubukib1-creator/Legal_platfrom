import type { Review, SLAStatus } from "@prisma/client";
import { businessDaysBetween, APP_TZ } from "@/lib/business-days";
import { formatInTimeZone } from "date-fns-tz";

export type ReviewLike = Pick<
  Review,
  "submittedAt" | "pickedUpAt" | "returnedAt" | "slaDeadline"
>;

function bkkKey(d: Date): string {
  return formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
}

// Recomputes the live SLA status from the deadline + now. Mirrors the cron's
// rules in plan §10.1 — deliberately ignores the stored slaStatus so the cron
// has a single source of truth.
//
// SLA semantics: a review submitted on day X with N-BD SLA is due by end-of-day
// of the Nth business day strictly after X. While `now` is on the deadline day
// (same Bangkok-local date as the stored slaDeadline) the review is the LAST
// working day → WARNING. After the deadline timestamp passes → BREACHED.
export function computeSLAStatus(
  review: ReviewLike,
  now: Date,
  holidays: ReadonlyArray<Date>,
): SLAStatus {
  if (review.returnedAt) {
    return review.returnedAt <= review.slaDeadline ? "COMPLETED" : "COMPLETED_LATE";
  }
  if (now > review.slaDeadline) return "BREACHED";
  const remaining = businessDaysBetween(now, review.slaDeadline, holidays);
  // We're on the deadline day before EOD: businessDaysBetween returns 0 but
  // the contract is not yet breached — treat as the last working day.
  if (bkkKey(now) === bkkKey(review.slaDeadline)) return "WARNING";
  if (remaining <= 0) return "BREACHED";
  if (remaining === 1) return "WARNING";
  return "ON_TRACK";
}

export type SLABadgeKind =
  | { kind: "awaiting-pickup" }
  | { kind: "breached"; daysOver: number }
  | { kind: "warning"; daysRemaining: number }
  | { kind: "on-track"; daysRemaining: number }
  | { kind: "completed"; late: boolean };

// Picks the badge state shown next to each review in the dashboard / contract
// detail.
export function describeSLABadge(
  review: ReviewLike,
  now: Date,
  holidays: ReadonlyArray<Date>,
): SLABadgeKind {
  if (review.returnedAt) {
    return {
      kind: "completed",
      late: review.returnedAt > review.slaDeadline,
    };
  }
  if (!review.pickedUpAt) {
    return { kind: "awaiting-pickup" };
  }
  if (now > review.slaDeadline) {
    const daysOver = Math.abs(businessDaysBetween(now, review.slaDeadline, holidays));
    return { kind: "breached", daysOver: Math.max(1, daysOver) };
  }
  // Same-day-as-deadline before EOD = the last working day → 1 day remaining
  // visually, marked warning.
  if (bkkKey(now) === bkkKey(review.slaDeadline)) {
    return { kind: "warning", daysRemaining: 1 };
  }
  const remaining = businessDaysBetween(now, review.slaDeadline, holidays);
  if (remaining <= 1) return { kind: "warning", daysRemaining: Math.max(0, remaining) };
  return { kind: "on-track", daysRemaining: remaining };
}

// Used by the dashboard ordering — smaller value sorts to the top.
export function slaUrgencyRank(badge: SLABadgeKind): number {
  switch (badge.kind) {
    case "breached":
      return -1000 - badge.daysOver;
    case "warning":
      return badge.daysRemaining;
    case "awaiting-pickup":
      return 100;
    case "on-track":
      return 1000 + badge.daysRemaining;
    case "completed":
      return 10000;
  }
}

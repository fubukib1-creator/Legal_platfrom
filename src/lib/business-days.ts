import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { cache } from "react";

export const APP_TZ = "Asia/Bangkok";

// Bangkok has no DST and is UTC+7 year-round. We work in YYYY-MM-DD "date keys"
// (Bangkok local calendar dates) so the business-day arithmetic is independent
// of the absolute time-of-day inside any given Date.

function dateKey(d: Date): string {
  return formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
}

function bkkMidnight(key: string): Date {
  return fromZonedTime(`${key}T00:00:00`, APP_TZ);
}

function nextDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return formatInTimeZone(dt, "UTC", "yyyy-MM-dd");
}

function dowFromKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  // 0=Sun, 1=Mon, ..., 6=Sat
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isBDKey(key: string, holidayKeys: Set<string>): boolean {
  const dow = dowFromKey(key);
  return dow !== 0 && dow !== 6 && !holidayKeys.has(key);
}

function holidayKeySet(holidays: ReadonlyArray<Date>): Set<string> {
  return new Set(holidays.map(dateKey));
}

export function isBusinessDay(d: Date, holidays: ReadonlyArray<Date>): boolean {
  return isBDKey(dateKey(d), holidayKeySet(holidays));
}

// addBusinessDays per plan §5.2:
//   - if start is a non-business day, the count begins from the next business day
//   - day 0 returns the next business day if start is non-business
//   - returns midnight Bangkok of the resulting date
export function addBusinessDays(
  start: Date,
  days: number,
  holidays: ReadonlyArray<Date>,
): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`addBusinessDays: days must be a non-negative integer, got ${days}`);
  }
  const holidayKeys = holidayKeySet(holidays);
  let key = dateKey(start);
  while (!isBDKey(key, holidayKeys)) {
    key = nextDayKey(key);
  }
  let added = 0;
  while (added < days) {
    key = nextDayKey(key);
    if (isBDKey(key, holidayKeys)) added++;
  }
  return bkkMidnight(key);
}

// businessDaysBetween: number of business days strictly between the date keys
// of `start` and `end`, exclusive of `start` and inclusive of `end`. Returns
// negative when end < start. Time-of-day is irrelevant — only the Bangkok
// calendar date is used, matching how SLA deadlines are stored as midnight.
export function businessDaysBetween(
  start: Date,
  end: Date,
  holidays: ReadonlyArray<Date>,
): number {
  const holidayKeys = holidayKeySet(holidays);
  const startKey = dateKey(start);
  const endKey = dateKey(end);
  if (startKey === endKey) return 0;
  const reverse = endKey < startKey;
  const [from, to] = reverse ? [endKey, startKey] : [startKey, endKey];
  let count = 0;
  let key = nextDayKey(from);
  while (key <= to) {
    if (isBDKey(key, holidayKeys)) count++;
    key = nextDayKey(key);
  }
  return reverse ? -count : count;
}

// Returns the Date representing 23:59:59.999 Bangkok of the same calendar
// day as `d`. Used as the SLA deadline so the contract is not breached until
// after the deadline day has fully ended.
export function endOfBkkDay(d: Date): Date {
  const key = dateKey(d);
  return new Date(bkkMidnight(nextDayKey(key)).getTime() - 1);
}

// Returns midnight Bangkok of the Nth business day strictly after `start`.
// Day 1 is the first BD after `start` (regardless of whether `start` itself
// is a BD). Holidays are skipped.
//
// This differs from `addBusinessDays` which treats the first BD on-or-after
// start as day 0. The "strictly after" semantics give the correct count for
// SLA calculation: a 7-BD SLA gives legal 7 working days of work, no matter
// whether submission landed on a weekend, a holiday, or a regular weekday.
export function nthBusinessDayStrictlyAfter(
  start: Date,
  n: number,
  holidays: ReadonlyArray<Date>,
): Date {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`nthBusinessDayStrictlyAfter: n must be a positive integer, got ${n}`);
  }
  const holidayKeys = holidayKeySet(holidays);
  let key = nextDayKey(dateKey(start));
  let count = 0;
  while (true) {
    if (isBDKey(key, holidayKeys)) {
      count += 1;
      if (count === n) return bkkMidnight(key);
    }
    key = nextDayKey(key);
  }
}

// Computes the SLA deadline for a review submission: the end of the Nth
// business day strictly after the submission moment. So a 7-BD SLA always
// gives legal exactly 7 working days no matter when in the week (or whether
// during a holiday) the contract was submitted.
export function slaDeadlineFor(
  submittedAt: Date,
  days: number,
  holidays: ReadonlyArray<Date>,
): Date {
  return endOfBkkDay(nthBusinessDayStrictlyAfter(submittedAt, days, holidays));
}

// Per-request memoised fetch of the holiday list. Server-only — relies on the
// React cache primitive to dedupe calls within a single render.
export const getHolidays = cache(async (): Promise<Date[]> => {
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.holiday.findMany({ select: { date: true } });
  return rows.map((r) => r.date);
});

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// Hard-coded rather than imported from `lib/business-days` so this module can
// be safely pulled into client components (PeriodPicker) without dragging in
// server-only Prisma deps.
const APP_TZ = "Asia/Bangkok";

// A reporting window the user has selected on the dashboard / Legal
// performance page. Always anchored to Bangkok calendar boundaries — that's
// the only timezone the team thinks in.
export type Period =
  | { kind: "month"; value: string; start: Date; end: Date; label: string }
  | { kind: "year"; value: string; start: Date; end: Date; label: string };

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: APP_TZ,
});

function startOfBkkMonthFromKey(key: string): Date {
  return fromZonedTime(`${key}-01T00:00:00`, APP_TZ);
}

function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function isValidMonthKey(k: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k)) return false;
  const y = Number(k.slice(0, 4));
  return y >= 2000 && y <= 2100;
}

function isValidYearKey(k: string): boolean {
  if (!/^\d{4}$/.test(k)) return false;
  const y = Number(k);
  return y >= 2000 && y <= 2100;
}

function currentMonthKey(now: Date): string {
  return formatInTimeZone(now, APP_TZ, "yyyy-MM");
}

function currentYearKey(now: Date): string {
  return formatInTimeZone(now, APP_TZ, "yyyy");
}

// Resolves a Period from URL searchParams. Falls back to the current month
// (Bangkok) on any unrecognised / missing input — every page can call this
// without branching on "did the user pick something."
export function resolvePeriod(
  sp: { period?: string; value?: string } | undefined,
  now: Date = new Date(),
): Period {
  const kindRaw = sp?.period;
  const valueRaw = sp?.value;

  if (kindRaw === "year") {
    const value = valueRaw && isValidYearKey(valueRaw) ? valueRaw : currentYearKey(now);
    const start = fromZonedTime(`${value}-01-01T00:00:00`, APP_TZ);
    const end = fromZonedTime(`${Number(value) + 1}-01-01T00:00:00`, APP_TZ);
    return { kind: "year", value, start, end, label: value };
  }

  // Default + explicit "month"
  const value =
    valueRaw && isValidMonthKey(valueRaw) ? valueRaw : currentMonthKey(now);
  const start = startOfBkkMonthFromKey(value);
  const end = startOfBkkMonthFromKey(nextMonthKey(value));
  const label = MONTH_LABEL.format(start);
  return { kind: "month", value, start, end, label };
}

// Returns the 12 most recent month keys ending at the month containing `now`,
// oldest first. Used by the PeriodPicker dropdown so users can quickly hop
// between recent months without typing.
export function recentMonthKeys(now: Date = new Date(), count = 24): string[] {
  let key = currentMonthKey(now);
  const out: string[] = [key];
  for (let i = 1; i < count; i++) {
    const [y, m] = key.split("-").map(Number);
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    key = `${py}-${String(pm).padStart(2, "0")}`;
    out.push(key);
  }
  return out;
}

export function recentYearKeys(now: Date = new Date(), count = 6): string[] {
  const current = Number(currentYearKey(now));
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(String(current - i));
  return out;
}

// Human label for a YYYY-MM key (e.g. "May 2026").
export function monthKeyLabel(key: string): string {
  const start = startOfBkkMonthFromKey(key);
  return MONTH_LABEL.format(start);
}

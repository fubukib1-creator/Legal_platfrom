import { describe, it, expect } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  addBusinessDays,
  businessDaysBetween,
  isBusinessDay,
  APP_TZ,
} from "@/lib/business-days";

// Helper: construct a Date that represents `YYYY-MM-DD HH:MM` Bangkok local time.
function bkk(date: string, time = "09:00:00"): Date {
  return fromZonedTime(`${date}T${time}`, APP_TZ);
}

// Sample holiday set used in many cases — Songkran 2026 (13–15 April).
const SONGKRAN: Date[] = [bkk("2026-04-13", "00:00:00"), bkk("2026-04-14", "00:00:00"), bkk("2026-04-15", "00:00:00")];

describe("isBusinessDay", () => {
  it("treats Mon–Fri as business days when not a holiday", () => {
    expect(isBusinessDay(bkk("2026-04-06"), [])).toBe(true); // Mon
    expect(isBusinessDay(bkk("2026-04-07"), [])).toBe(true); // Tue
    expect(isBusinessDay(bkk("2026-04-10"), [])).toBe(true); // Fri
  });

  it("treats Sat and Sun as non-business days", () => {
    expect(isBusinessDay(bkk("2026-04-11"), [])).toBe(false); // Sat
    expect(isBusinessDay(bkk("2026-04-12"), [])).toBe(false); // Sun
  });

  it("treats holidays as non-business days even on weekdays", () => {
    expect(isBusinessDay(bkk("2026-04-13"), SONGKRAN)).toBe(false); // Mon Songkran
    expect(isBusinessDay(bkk("2026-04-14"), SONGKRAN)).toBe(false); // Tue Songkran
  });

  it("uses Bangkok-local calendar date even for late-UTC inputs", () => {
    // 2026-04-12 18:00 UTC == 2026-04-13 01:00 Bangkok = Mon Songkran (holiday)
    const utc = new Date("2026-04-12T18:00:00.000Z");
    expect(isBusinessDay(utc, SONGKRAN)).toBe(false);
  });
});

describe("addBusinessDays — snapping behaviour", () => {
  it("returns the start date itself when start is a business day and days=0", () => {
    const r = addBusinessDays(bkk("2026-04-06"), 0, []); // Mon
    expect(r.toISOString()).toBe(bkk("2026-04-06", "00:00:00").toISOString());
  });

  it("snaps weekend start to next Monday when days=0", () => {
    const r = addBusinessDays(bkk("2026-04-11"), 0, []); // Sat
    expect(r.toISOString()).toBe(bkk("2026-04-13", "00:00:00").toISOString()); // next Mon
  });

  it("snaps holiday start to next business day when days=0", () => {
    const r = addBusinessDays(bkk("2026-04-13"), 0, SONGKRAN); // Songkran Mon
    expect(r.toISOString()).toBe(bkk("2026-04-16", "00:00:00").toISOString()); // Thu
  });
});

describe("addBusinessDays — counting", () => {
  it("counts 1 BD forward across a normal week", () => {
    const r = addBusinessDays(bkk("2026-04-06"), 1, []); // Mon → Tue
    expect(r.toISOString()).toBe(bkk("2026-04-07", "00:00:00").toISOString());
  });

  it("skips weekends", () => {
    // Fri + 1 BD = next Mon
    const r = addBusinessDays(bkk("2026-04-10"), 1, []);
    expect(r.toISOString()).toBe(bkk("2026-04-13", "00:00:00").toISOString());
  });

  it("counts 7 BD spanning a week", () => {
    // Mon Apr 6 + 7 BD (no holidays) = Wed Apr 15
    const r = addBusinessDays(bkk("2026-04-06"), 7, []);
    expect(r.toISOString()).toBe(bkk("2026-04-15", "00:00:00").toISOString());
  });

  it("skips holidays during the count", () => {
    // Fri Apr 10 + 1 BD with Songkran = Thu Apr 16
    // (skips Sat 11, Sun 12, holidays Mon 13/Tue 14/Wed 15)
    const r = addBusinessDays(bkk("2026-04-10"), 1, SONGKRAN);
    expect(r.toISOString()).toBe(bkk("2026-04-16", "00:00:00").toISOString());
  });

  it("counts 7 BD across Songkran week", () => {
    // Mon Apr 6 + 7 BD with Songkran 13-15 holiday
    // BDs: Tue 7, Wed 8, Thu 9, Fri 10, Thu 16, Fri 17, Mon 20 → result Mon 20
    const r = addBusinessDays(bkk("2026-04-06"), 7, SONGKRAN);
    expect(r.toISOString()).toBe(bkk("2026-04-20", "00:00:00").toISOString());
  });

  it("rejects negative or non-integer days", () => {
    expect(() => addBusinessDays(bkk("2026-04-06"), -1, [])).toThrow();
    expect(() => addBusinessDays(bkk("2026-04-06"), 1.5, [])).toThrow();
  });
});

describe("businessDaysBetween", () => {
  it("returns 0 for the same calendar day", () => {
    expect(businessDaysBetween(bkk("2026-04-06", "08:00:00"), bkk("2026-04-06", "20:00:00"), [])).toBe(0);
  });

  it("counts one BD between consecutive business days", () => {
    expect(businessDaysBetween(bkk("2026-04-06"), bkk("2026-04-07"), [])).toBe(1);
  });

  it("excludes start date but includes end date", () => {
    // Mon → Fri = Tue, Wed, Thu, Fri = 4 BDs
    expect(businessDaysBetween(bkk("2026-04-06"), bkk("2026-04-10"), [])).toBe(4);
  });

  it("returns the same count after submission day for SLA semantics (7 BD deadline)", () => {
    // submitted Mon Apr 6, deadline = Mon Apr 6 + 7 BD = Apr 15 (no holidays)
    const submittedAt = bkk("2026-04-06", "10:00:00");
    const deadline = addBusinessDays(submittedAt, 7, []);
    expect(businessDaysBetween(submittedAt, deadline, [])).toBe(7);
  });

  it("returns 1 the day before SLA deadline (WARNING per plan §10.1)", () => {
    const submittedAt = bkk("2026-04-06", "10:00:00");
    const deadline = addBusinessDays(submittedAt, 7, []);
    // Day before deadline = Tue Apr 14
    const dayBefore = bkk("2026-04-14", "10:00:00");
    expect(businessDaysBetween(dayBefore, deadline, [])).toBe(1);
  });

  it("returns 0 on the deadline day itself (BREACHED per plan §10.1)", () => {
    const submittedAt = bkk("2026-04-06", "10:00:00");
    const deadline = addBusinessDays(submittedAt, 7, []);
    const onDeadline = bkk("2026-04-15", "10:00:00");
    expect(businessDaysBetween(onDeadline, deadline, [])).toBe(0);
  });

  it("returns negative count when end is before start", () => {
    expect(businessDaysBetween(bkk("2026-04-10"), bkk("2026-04-06"), [])).toBe(-4);
  });

  it("skips weekends and holidays in the count", () => {
    // Apr 10 (Fri) → Apr 20 (Mon) with Songkran 13-15 holiday
    // Days in (Fri10, Mon20]: Sat11, Sun12, Mon13(H), Tue14(H), Wed15(H), Thu16, Fri17, Sat18, Sun19, Mon20
    // BDs: Thu16, Fri17, Mon20 = 3
    expect(businessDaysBetween(bkk("2026-04-10"), bkk("2026-04-20"), SONGKRAN)).toBe(3);
  });

  it("multi-week span counts correctly", () => {
    // Mon Mar 2 → Mon Mar 30 = 4 weeks span. 21 BDs in a normal 4-week window
    // Tue 3..Fri 6 (4) + Mon 9..Fri 13 (5) + Mon 16..Fri 20 (5) + Mon 23..Fri 27 (5) + Mon 30 (1) = 20
    expect(businessDaysBetween(bkk("2026-03-02"), bkk("2026-03-30"), [])).toBe(20);
  });
});

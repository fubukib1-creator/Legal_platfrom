import { describe, it, expect } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { slaDeadlineFor, APP_TZ } from "@/lib/business-days";
import {
  computeSLAStatus,
  describeSLABadge,
  slaUrgencyRank,
  type ReviewLike,
} from "@/lib/sla";

function bkk(date: string, time = "09:00:00"): Date {
  return fromZonedTime(`${date}T${time}`, APP_TZ);
}

const NO_HOLIDAYS: Date[] = [];

function makeReview(opts: {
  submittedAt: Date;
  pickedUpAt?: Date | null;
  returnedAt?: Date | null;
  slaDeadline: Date;
}): ReviewLike {
  return {
    submittedAt: opts.submittedAt,
    pickedUpAt: opts.pickedUpAt ?? null,
    returnedAt: opts.returnedAt ?? null,
    slaDeadline: opts.slaDeadline,
  };
}

describe("computeSLAStatus", () => {
  const submittedAt = bkk("2026-04-06", "10:00:00"); // Mon
  // 7th BD strictly after Mon Apr 6 = Wed Apr 15 (Tue 7..Wed 15). Deadline is
  // EOD Apr 15.
  const deadline = slaDeadlineFor(submittedAt, 7, NO_HOLIDAYS);

  it("ON_TRACK well before deadline", () => {
    const review = makeReview({ submittedAt, slaDeadline: deadline });
    const now = bkk("2026-04-08");
    expect(computeSLAStatus(review, now, NO_HOLIDAYS)).toBe("ON_TRACK");
  });

  it("WARNING the day before deadline", () => {
    const review = makeReview({ submittedAt, slaDeadline: deadline });
    const now = bkk("2026-04-14"); // Tue, deadline is Wed Apr 15
    expect(computeSLAStatus(review, now, NO_HOLIDAYS)).toBe("WARNING");
  });

  it("WARNING on deadline day before EOD — last working day", () => {
    const review = makeReview({ submittedAt, slaDeadline: deadline });
    const now = bkk("2026-04-15", "09:00:00");
    expect(computeSLAStatus(review, now, NO_HOLIDAYS)).toBe("WARNING");
  });

  it("BREACHED past deadline", () => {
    const review = makeReview({ submittedAt, slaDeadline: deadline });
    const now = bkk("2026-04-16", "09:00:00");
    expect(computeSLAStatus(review, now, NO_HOLIDAYS)).toBe("BREACHED");
  });

  it("returnedAt before deadline → COMPLETED", () => {
    const review = makeReview({
      submittedAt,
      slaDeadline: deadline,
      returnedAt: bkk("2026-04-10"),
    });
    expect(computeSLAStatus(review, bkk("2026-05-01"), NO_HOLIDAYS)).toBe("COMPLETED");
  });

  it("returnedAt after deadline → COMPLETED_LATE", () => {
    const review = makeReview({
      submittedAt,
      slaDeadline: deadline,
      returnedAt: bkk("2026-04-20"),
    });
    expect(computeSLAStatus(review, bkk("2026-05-01"), NO_HOLIDAYS)).toBe("COMPLETED_LATE");
  });
});

describe("describeSLABadge", () => {
  const submittedAt = bkk("2026-04-06", "10:00:00");
  const deadline = slaDeadlineFor(submittedAt, 7, NO_HOLIDAYS);

  it("awaiting-pickup when pickedUpAt is null and not returned", () => {
    const review = makeReview({ submittedAt, slaDeadline: deadline });
    const badge = describeSLABadge(review, bkk("2026-04-08"), NO_HOLIDAYS);
    expect(badge).toEqual({ kind: "awaiting-pickup" });
  });

  it("on-track once picked up and far from deadline", () => {
    const review = makeReview({
      submittedAt,
      pickedUpAt: bkk("2026-04-06", "11:00:00"),
      slaDeadline: deadline,
    });
    const badge = describeSLABadge(review, bkk("2026-04-08"), NO_HOLIDAYS);
    expect(badge).toEqual({ kind: "on-track", daysRemaining: 5 });
  });

  it("warning the day before deadline", () => {
    const review = makeReview({
      submittedAt,
      pickedUpAt: bkk("2026-04-06", "11:00:00"),
      slaDeadline: deadline,
    });
    const badge = describeSLABadge(review, bkk("2026-04-14"), NO_HOLIDAYS);
    expect(badge).toEqual({ kind: "warning", daysRemaining: 1 });
  });

  it("warning on deadline day before EOD — last working day shows 1d remaining", () => {
    const review = makeReview({
      submittedAt,
      pickedUpAt: bkk("2026-04-06", "11:00:00"),
      slaDeadline: deadline,
    });
    // Deadline now stores end-of-day Apr 15, so any time during Apr 15 is
    // still on the last working day → warning, daysRemaining: 1.
    const badge = describeSLABadge(review, bkk("2026-04-15", "01:00:00"), NO_HOLIDAYS);
    expect(badge).toEqual({ kind: "warning", daysRemaining: 1 });
  });

  it("breached after the deadline shows daysOver", () => {
    const review = makeReview({
      submittedAt,
      pickedUpAt: bkk("2026-04-06", "11:00:00"),
      slaDeadline: deadline,
    });
    const badge = describeSLABadge(review, bkk("2026-04-20"), NO_HOLIDAYS);
    expect(badge.kind).toBe("breached");
    if (badge.kind === "breached") {
      // Apr 15 (deadline) → Apr 20 = 3 BD over (Thu 16, Fri 17, Mon 20)
      expect(badge.daysOver).toBe(3);
    }
  });

  it("completed badge respects on-time vs late", () => {
    const onTime = makeReview({
      submittedAt,
      pickedUpAt: bkk("2026-04-06", "11:00:00"),
      slaDeadline: deadline,
      returnedAt: bkk("2026-04-10"),
    });
    expect(describeSLABadge(onTime, bkk("2026-05-01"), NO_HOLIDAYS)).toEqual({
      kind: "completed",
      late: false,
    });
    const late = makeReview({
      submittedAt,
      pickedUpAt: bkk("2026-04-06", "11:00:00"),
      slaDeadline: deadline,
      returnedAt: bkk("2026-04-20"),
    });
    expect(describeSLABadge(late, bkk("2026-05-01"), NO_HOLIDAYS)).toEqual({
      kind: "completed",
      late: true,
    });
  });
});

describe("slaUrgencyRank", () => {
  it("orders breached < warning < awaiting-pickup < on-track < completed", () => {
    const ranks = [
      slaUrgencyRank({ kind: "breached", daysOver: 1 }),
      slaUrgencyRank({ kind: "warning", daysRemaining: 1 }),
      slaUrgencyRank({ kind: "awaiting-pickup" }),
      slaUrgencyRank({ kind: "on-track", daysRemaining: 5 }),
      slaUrgencyRank({ kind: "completed", late: false }),
    ];
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i - 1]).toBeLessThan(ranks[i]);
    }
  });

  it("orders worse breaches first within breached", () => {
    const a = slaUrgencyRank({ kind: "breached", daysOver: 5 });
    const b = slaUrgencyRank({ kind: "breached", daysOver: 1 });
    expect(a).toBeLessThan(b);
  });
});

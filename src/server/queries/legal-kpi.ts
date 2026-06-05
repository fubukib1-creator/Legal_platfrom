import "server-only";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type {
  ContractComplexity,
  ContractStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  APP_TZ,
  businessDaysBetween,
  getHolidays,
} from "@/lib/business-days";
import type { Period } from "@/lib/period";

// "Deadline approaching" is anything with ≤ this many business days left on
// an open review. Matches the SLA "warning" badge used elsewhere.
const APPROACHING_BD_THRESHOLD = 2;

export type MonthlyKPIRow = {
  // monthKey is "year" for the yearly aggregate row, otherwise YYYY-MM in Bangkok TZ
  monthKey: string;
  monthLabel: string; // e.g. "May 2026" or "2026 total"
  registered: number; // contracts that started (startDate) in the bucket
  returned: number;   // contracts marked-awaiting-signature in the bucket
  onTime: number;
  late: number;
  avgTurnaroundBD: number | null;
  medianTurnaroundBD: number | null;
};

export type ComplexityProportion = {
  complexity: ContractComplexity;
  count: number;
  ratio: number;
};

export type ExtensionProportion = {
  extended: number;
  notExtended: number;
  total: number;
  ratio: number;
};

export type PendingByBU = {
  department: string;
  count: number;
};

export type LegalKPIData = {
  generatedAt: Date;
  periodLabel: string;
  periodKind: "month" | "year";
  rangeStartLabel: string;
  // Period-scoped cohort: contracts whose startDate falls in the period.
  // Every KPI tile reflects this cohort so flipping the period filter changes
  // every number on the page.
  cohort: {
    registered: number;
    inLegalReview: number;
    breachedOpen: number;
    deadlineApproaching: number;
    awaitingSignature: number;
  };
  periodOnTimeRate: number | null;
  periodAvgTurnaroundBD: number | null;
  // Monthly table: 1 row when period.kind="month"; 12 rows + 1 yearly total when "year"
  monthly: MonthlyKPIRow[];
  yearlyTotal: MonthlyKPIRow | null;
  // Proportions (also cohort-scoped)
  complexityProportions: ComplexityProportion[];
  extensionProportion: ExtensionProportion;
  // Pending-by-BU chart data (live snapshot — independent of period)
  pendingByBU: PendingByBU[];
};

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: APP_TZ,
});

function monthKeyFor(d: Date): string {
  return formatInTimeZone(d, APP_TZ, "yyyy-MM");
}

function monthLabelFor(d: Date): string {
  return MONTH_LABEL.format(d);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Statuses that mean "not yet signed & uploaded" for the pending-by-BU chart.
// OUT_FOR_SIGNING is the terminal "signed and uploaded" state in this app.
const NOT_DONE_STATUSES: ContractStatus[] = [
  "REGISTERED",
  "AWAITING_TEMPLATE",
  "DRAFTING",
  "IN_LEGAL_REVIEW",
  "WITH_COUNTERPARTY",
  "CP_RESPONDED",
  "AWAITING_SIGNATURE",
];

export async function getLegalKPIData(
  period: Period,
  now: Date = new Date(),
): Promise<LegalKPIData> {
  const holidays = await getHolidays();

  // Decide which month boundaries we need for the table:
  //   period.kind="month" → 1 row covering the picked month
  //   period.kind="year"  → 12 rows for Jan…Dec of that year
  const monthStarts: Date[] = [];
  if (period.kind === "year") {
    const yyyy = Number(period.value);
    for (let m = 1; m <= 12; m++) {
      monthStarts.push(
        fromZonedTime(
          `${yyyy}-${String(m).padStart(2, "0")}-01T00:00:00`,
          APP_TZ,
        ),
      );
    }
  } else {
    monthStarts.push(period.start);
  }
  const windowStart = monthStarts[0];

  const [cohort, contractsPeriod, reviewsForMonthlyTable, pendingGrouped] =
    await Promise.all([
      // Cohort drives every KPI tile + complexity/extension proportions.
      // "startDate falls in the selected period" is the single rule used so
      // flipping the period changes every number on the dashboard.
      prisma.contract.findMany({
        where: { startDate: { gte: period.start, lt: period.end } },
        select: {
          id: true,
          status: true,
          complexity: true,
          reviews: {
            select: {
              submittedAt: true,
              returnedAt: true,
              slaDeadline: true,
              slaExtensionDays: true,
            },
          },
        },
      }),
      // Monthly table volume columns: contracts whose startDate (Registered)
      // or finalizedDate (Returned) falls in the window. Bucket client-side.
      prisma.contract.findMany({
        where: {
          OR: [
            { startDate: { gte: period.start, lt: period.end } },
            { finalizedDate: { gte: period.start, lt: period.end } },
          ],
        },
        select: { id: true, startDate: true, finalizedDate: true },
      }),
      // For monthly on-time/late + turnaround stats, we need reviews that
      // either submitted or returned inside the window — independent of
      // cohort so a contract started before the window still contributes
      // when it gets returned during the window.
      prisma.review.findMany({
        where: {
          OR: [
            { submittedAt: { gte: period.start, lt: period.end } },
            { returnedAt: { gte: period.start, lt: period.end } },
          ],
        },
        select: {
          submittedAt: true,
          returnedAt: true,
          slaDeadline: true,
        },
      }),
      // Pending-by-BU: live snapshot of contracts whose status is anything but
      // OUT_FOR_SIGNING / CANCELLED, grouped by department.
      prisma.contract.groupBy({
        by: ["buDepartment"],
        where: { status: { in: NOT_DONE_STATUSES } },
        _count: { _all: true },
        orderBy: { buDepartment: "asc" },
      }),
    ]);

  // ── Cohort-scoped tile counts ────────────────────────────────────────────
  let cohortInReview = 0;
  let cohortAwaitingSig = 0;
  let cohortBreached = 0;
  let cohortApproaching = 0;
  for (const c of cohort) {
    if (c.status === "IN_LEGAL_REVIEW") cohortInReview += 1;
    if (c.status === "AWAITING_SIGNATURE") cohortAwaitingSig += 1;
    for (const r of c.reviews) {
      if (r.returnedAt) continue;
      if (r.slaDeadline <= now) {
        cohortBreached += 1;
        continue;
      }
      const bdLeft = businessDaysBetween(now, r.slaDeadline, holidays);
      if (bdLeft <= APPROACHING_BD_THRESHOLD && bdLeft >= 0) {
        cohortApproaching += 1;
      }
    }
  }

  // ── Cohort-scoped turnaround / on-time rate ──────────────────────────────
  const cohortReturned = cohort.flatMap((c) =>
    c.reviews.filter((r) => r.returnedAt),
  );
  const cohortTurnarounds = cohortReturned.map((r) =>
    businessDaysBetween(r.submittedAt, r.returnedAt!, holidays),
  );
  const periodAvgBD =
    cohortTurnarounds.length === 0
      ? null
      : cohortTurnarounds.reduce((s, n) => s + n, 0) /
        cohortTurnarounds.length;
  const cohortOnTime = cohortReturned.filter(
    (r) => r.returnedAt && r.returnedAt <= r.slaDeadline,
  ).length;
  const periodOnTimeRate =
    cohortReturned.length === 0 ? null : cohortOnTime / cohortReturned.length;

  // ── Monthly buckets (volume columns + on-time/late stats) ────────────────
  type Bucket = {
    registered: number;
    returned: number;
    onTime: number;
    late: number;
    turnarounds: number[];
  };
  const monthBuckets = new Map<string, Bucket>();
  for (const start of monthStarts) {
    monthBuckets.set(monthKeyFor(start), {
      registered: 0,
      returned: 0,
      onTime: 0,
      late: 0,
      turnarounds: [],
    });
  }

  for (const c of contractsPeriod) {
    if (c.startDate) {
      const k = monthKeyFor(c.startDate);
      const b = monthBuckets.get(k);
      if (b) b.registered += 1;
    }
    if (c.finalizedDate) {
      const k = monthKeyFor(c.finalizedDate);
      const b = monthBuckets.get(k);
      if (b) b.returned += 1;
    }
  }

  for (const r of reviewsForMonthlyTable) {
    if (!r.returnedAt) continue;
    const k = monthKeyFor(r.returnedAt);
    const b = monthBuckets.get(k);
    if (!b) continue;
    if (r.returnedAt <= r.slaDeadline) b.onTime += 1;
    else b.late += 1;
    b.turnarounds.push(
      businessDaysBetween(r.submittedAt, r.returnedAt, holidays),
    );
  }

  const monthly: MonthlyKPIRow[] = monthStarts.map((start) => {
    const key = monthKeyFor(start);
    const b = monthBuckets.get(key)!;
    const avg =
      b.turnarounds.length === 0
        ? null
        : b.turnarounds.reduce((s, n) => s + n, 0) / b.turnarounds.length;
    return {
      monthKey: key,
      monthLabel: monthLabelFor(start),
      registered: b.registered,
      returned: b.returned,
      onTime: b.onTime,
      late: b.late,
      avgTurnaroundBD: avg,
      medianTurnaroundBD: median(b.turnarounds),
    };
  });

  // Yearly aggregate row, only meaningful when period.kind === "year".
  const yearlyTotal: MonthlyKPIRow | null =
    period.kind === "year"
      ? (() => {
          let registered = 0;
          let returned = 0;
          let onTime = 0;
          let late = 0;
          const turnarounds: number[] = [];
          for (const b of monthBuckets.values()) {
            registered += b.registered;
            returned += b.returned;
            onTime += b.onTime;
            late += b.late;
            turnarounds.push(...b.turnarounds);
          }
          const avg =
            turnarounds.length === 0
              ? null
              : turnarounds.reduce((s, n) => s + n, 0) / turnarounds.length;
          return {
            monthKey: "year",
            monthLabel: `${period.value} total`,
            registered,
            returned,
            onTime,
            late,
            avgTurnaroundBD: avg,
            medianTurnaroundBD: median(turnarounds),
          };
        })()
      : null;

  // ── Complexity proportion (cohort) ───────────────────────────────────────
  const complexityCounts = new Map<ContractComplexity, number>([
    ["LOW", 0],
    ["MEDIUM", 0],
    ["HIGH", 0],
  ]);
  let complexityTotal = 0;
  for (const c of cohort) {
    if (!c.complexity) continue;
    complexityCounts.set(
      c.complexity,
      (complexityCounts.get(c.complexity) ?? 0) + 1,
    );
    complexityTotal += 1;
  }
  const complexityProportions: ComplexityProportion[] = Array.from(
    complexityCounts.entries(),
  ).map(([complexity, count]) => ({
    complexity,
    count,
    ratio: complexityTotal === 0 ? 0 : count / complexityTotal,
  }));

  // ── Extension proportion (cohort) ────────────────────────────────────────
  let extendedCount = 0;
  for (const c of cohort) {
    if (c.reviews.some((r) => r.slaExtensionDays > 0)) extendedCount += 1;
  }
  const extensionProportion: ExtensionProportion = {
    extended: extendedCount,
    notExtended: cohort.length - extendedCount,
    total: cohort.length,
    ratio: cohort.length === 0 ? 0 : extendedCount / cohort.length,
  };

  // ── Pending-by-BU ─────────────────────────────────────────────────────────
  const pendingByBU: PendingByBU[] = pendingGrouped
    .map((g) => ({
      department: g.buDepartment,
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: now,
    periodLabel: period.label,
    periodKind: period.kind,
    rangeStartLabel: monthLabelFor(windowStart),
    cohort: {
      registered: cohort.length,
      inLegalReview: cohortInReview,
      breachedOpen: cohortBreached,
      deadlineApproaching: cohortApproaching,
      awaitingSignature: cohortAwaitingSig,
    },
    periodOnTimeRate,
    periodAvgTurnaroundBD: periodAvgBD,
    monthly,
    yearlyTotal,
    complexityProportions,
    extensionProportion,
    pendingByBU,
  };
}

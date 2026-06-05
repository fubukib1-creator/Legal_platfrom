import "server-only";
import type { SLAStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getHolidays, slaDeadlineFor } from "@/lib/business-days";
import { computeSLAStatus } from "@/lib/sla";
import {
  alertForTransition,
  dispatchSLAAlert,
} from "@/lib/notifications/sla-alerts";

const SLA_DAYS = Number(process.env.SLA_BUSINESS_DAYS ?? 7);

export type SLARecomputeSummary = {
  scanned: number;
  deadlineUpdated: number;
  statusUpdated: number;
  alerts: { warning: number; breached: number };
  byStatus: Record<SLAStatus, number>;
};

// Walks every open Review and recomputes both `slaDeadline` (from submittedAt
// + current holiday set) and `slaStatus` (from the new deadline + now).
// Persists changes when either differs. Used by the cron AND by admin actions
// that mutate the holiday calendar so deadline edits propagate immediately.
export async function recomputeOpenSLA(now: Date = new Date()): Promise<SLARecomputeSummary> {
  const holidays = await getHolidays();
  const open = await prisma.review.findMany({ where: { returnedAt: null } });

  const summary: SLARecomputeSummary = {
    scanned: open.length,
    deadlineUpdated: 0,
    statusUpdated: 0,
    alerts: { warning: 0, breached: 0 },
    byStatus: {
      ON_TRACK: 0,
      WARNING: 0,
      BREACHED: 0,
      COMPLETED: 0,
      COMPLETED_LATE: 0,
    },
  };

  for (const r of open) {
    const newDeadline = slaDeadlineFor(r.submittedAt, SLA_DAYS, holidays);
    const newStatus = computeSLAStatus(
      { ...r, slaDeadline: newDeadline },
      now,
      holidays,
    );
    summary.byStatus[newStatus] = (summary.byStatus[newStatus] ?? 0) + 1;

    const deadlineChanged = newDeadline.getTime() !== r.slaDeadline.getTime();
    const statusChanged = newStatus !== r.slaStatus;

    if (deadlineChanged || statusChanged) {
      await prisma.review.update({
        where: { id: r.id },
        data: {
          ...(deadlineChanged ? { slaDeadline: newDeadline } : {}),
          ...(statusChanged ? { slaStatus: newStatus } : {}),
        },
      });
      if (deadlineChanged) summary.deadlineUpdated += 1;
      if (statusChanged) summary.statusUpdated += 1;
    }

    if (statusChanged) {
      const transition = alertForTransition(r.slaStatus, newStatus);
      if (transition) {
        await dispatchSLAAlert(
          { ...r, slaStatus: newStatus, slaDeadline: newDeadline },
          transition,
        );
        summary.alerts[transition] += 1;
      }
    }
  }

  return summary;
}

import "server-only";
import type { Review, SLAStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import { sendLineMessage } from "@/lib/notifications/line";

const TZ = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

type AlertableTransition = "warning" | "breached";

// Decides whether a status change should fire an alert. Re-firing on every
// recalc would spam — we only alert on the entry-into-state transition.
export function alertForTransition(
  prev: SLAStatus,
  next: SLAStatus,
): AlertableTransition | null {
  if (next === "WARNING" && prev !== "WARNING") return "warning";
  if (next === "BREACHED" && prev !== "BREACHED") return "breached";
  return null;
}

export async function dispatchSLAAlert(
  review: Review,
  transition: AlertableTransition,
): Promise<{ emailSent: number; lineSent: number }> {
  const contract = await prisma.contract.findUnique({
    where: { id: review.contractId },
    include: {
      buOwner: { select: { id: true, name: true, email: true, lineUserId: true } },
    },
  });
  if (!contract) return { emailSent: 0, lineSent: 0 };

  const assignee = review.assignedToId
    ? await prisma.user.findUnique({
        where: { id: review.assignedToId },
        select: { id: true, name: true, email: true, lineUserId: true },
      })
    : null;

  const legalLeads = await prisma.user.findMany({
    where: { role: "LEGAL_LEAD", active: true },
    select: { id: true, name: true, email: true, lineUserId: true },
  });

  const buManagers =
    transition === "breached"
      ? await prisma.user.findMany({
          where: {
            role: "BU_MANAGER",
            active: true,
            department: contract.buDepartment,
          },
          select: { id: true, name: true, email: true, lineUserId: true },
        })
      : [];

  // Recipient set per plan §9.1
  const recipients = new Map<
    string,
    { id: string; name: string; email: string; lineUserId: string | null }
  >();
  if (assignee) recipients.set(assignee.id, assignee);
  for (const u of legalLeads) recipients.set(u.id, u);
  if (transition === "breached") {
    recipients.set(contract.buOwner.id, contract.buOwner);
    for (const u of buManagers) recipients.set(u.id, u);
  }
  if (recipients.size === 0) return { emailSent: 0, lineSent: 0 };

  const subject =
    transition === "breached"
      ? `[Past deadline] ${contract.contractNumber} — ${contract.title}`
      : `[Due soon] ${contract.contractNumber} — 1 business day left`;

  const deadline = TZ.format(review.slaDeadline);
  const text = [
    transition === "breached"
      ? `Review deadline has passed for round ${review.round} of ${contract.contractNumber}.`
      : `Round ${review.round} of ${contract.contractNumber} has 1 business day left before it goes past deadline.`,
    `Contract: ${contract.title} (${contract.counterparty})`,
    `Department: ${contract.buDepartment}`,
    `Deadline: ${deadline} (Bangkok)`,
    `Open: ${appUrl(`/contracts/${contract.id}`)}`,
  ].join("\n");

  const html = text
    .split("\n")
    .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
    .join("");

  const emailRes = await sendEmail({
    to: Array.from(recipients.values()).map((u) => u.email),
    subject,
    html,
    text,
    contractId: contract.id,
  });

  let lineSent = 0;
  await Promise.all(
    Array.from(recipients.values()).map(async (u) => {
      const r = await sendLineMessage(u.lineUserId, text, contract.id);
      if (r.ok && !r.skipped) lineSent += 1;
    }),
  );

  return { emailSent: emailRes.ok ? recipients.size : 0, lineSent };
}

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

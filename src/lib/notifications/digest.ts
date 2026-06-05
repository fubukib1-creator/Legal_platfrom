import "server-only";
import { prisma } from "@/lib/db";
import {
  computeDigestsFromSnapshot,
  type DigestRecipient,
} from "@/lib/notifications/digest-compute";

export {
  computeDigestsFromSnapshot,
  type DigestItem,
  type DigestRecipient,
  type DigestSnapshot,
} from "@/lib/notifications/digest-compute";

// DB-aware version that pulls everything needed for today's digest run.
export async function buildDailyDigests(now: Date): Promise<DigestRecipient[]> {
  const [users, contracts] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, email: true, name: true, role: true, department: true },
    }),
    prisma.contract.findMany({
      where: {
        status: {
          in: [
            "WITH_COUNTERPARTY",
            "AWAITING_SIGNATURE",
            "IN_LEGAL_REVIEW",
          ],
        },
      },
      include: {
        reviews: {
          where: { returnedAt: null },
          select: { round: true, slaStatus: true, assignedToId: true, returnedAt: true },
        },
      },
    }),
  ]);

  return computeDigestsFromSnapshot(now, { users, contracts });
}

export function renderDigestEmail(d: DigestRecipient): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `INNOPOWER LEGAL daily digest — ${d.items.length} item${d.items.length === 1 ? "" : "s"}`;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const lines = d.items.map(
    (it) => `• [${it.contractNumber}] ${it.title} (${it.buDepartment}) — ${it.reason}`,
  );
  const text = [
    `Hello ${d.name},`,
    "",
    `You have ${d.items.length} item${d.items.length === 1 ? "" : "s"} needing attention today:`,
    "",
    ...lines,
    "",
    `Open contracts: ${baseUrl}/contracts`,
  ].join("\n");

  const html = `
    <p>Hello ${escapeHtml(d.name)},</p>
    <p>You have <strong>${d.items.length}</strong> item${d.items.length === 1 ? "" : "s"} needing attention today:</p>
    <ul>
      ${d.items
        .map(
          (it) =>
            `<li><a href="${baseUrl}/contracts/${it.contractId}"><code>${escapeHtml(it.contractNumber)}</code></a> — ${escapeHtml(it.title)} (${escapeHtml(it.buDepartment)}) — ${escapeHtml(it.reason)}</li>`,
        )
        .join("")}
    </ul>
    <p><a href="${baseUrl}/contracts">Open contracts</a></p>
  `;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

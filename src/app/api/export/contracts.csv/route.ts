import { NextResponse } from "next/server";
import { Prisma, type ContractStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { contractTypeLabel } from "@/lib/contract-types";

export const dynamic = "force-dynamic";

const ALL_STATUSES: ContractStatus[] = [
  "REGISTERED",
  "AWAITING_TEMPLATE",
  "DRAFTING",
  "IN_LEGAL_REVIEW",
  "WITH_COUNTERPARTY",
  "CP_RESPONDED",
  "AWAITING_SIGNATURE",
  "OUT_FOR_SIGNING",
  "MONITORING",
  "CANCELLED",
];

const TZ = "Asia/Bangkok";

// Escapes a CSV cell:
//   1. Neutralises formula-injection prefixes (=, +, -, @, TAB, CR) by
//      prepending an apostrophe — Excel / LibreOffice / Sheets all treat
//      "'=cmd|..." as literal text rather than a formula. Without this an
//      attacker controlling any cell content (title, counterparty, notes,
//      cancel reason) could trigger remote code execution when the file is
//      opened by a recipient.
//   2. Wraps cells containing quotes/commas/newlines in double-quotes per
//      RFC 4180, doubling any embedded quotes.
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(d: Date | null): string {
  return d ? formatInTimeZone(d, TZ, "yyyy-MM-dd") : "";
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, "contract:export-csv")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusFilters = url.searchParams
    .getAll("status")
    .filter((s): s is ContractStatus => ALL_STATUSES.includes(s as ContractStatus));
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));

  const where: Prisma.ContractWhereInput = {};
  if (statusFilters.length > 0) where.status = { in: statusFilters };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  const rows = await prisma.contract.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      buOwner: { select: { name: true, email: true } },
    },
  });

  const headers = [
    "contract_number",
    "title",
    "type",
    "counterparty",
    "estimated_value",
    "currency",
    "bu_department",
    "bu_owner_name",
    "bu_owner_email",
    "status",
    "current_round",
    "start_date",
    "template_date",
    "finalized_date",
    "signed_date",
    "cancel_reason",
    "created_at",
    "updated_at",
  ];

  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.contractNumber),
        csvField(r.title),
        csvField(contractTypeLabel(r.type)),
        csvField(r.counterparty),
        csvField(r.estimatedValue?.toString() ?? ""),
        csvField(r.currency),
        csvField(r.buDepartment),
        csvField(r.buOwner.name),
        csvField(r.buOwner.email),
        csvField(r.status),
        csvField(r.currentRound),
        csvField(fmtDate(r.startDate)),
        csvField(fmtDate(r.templateDate)),
        csvField(fmtDate(r.finalizedDate)),
        csvField(fmtDate(r.signedDate)),
        csvField(r.cancelReason ?? ""),
        csvField(r.createdAt.toISOString()),
        csvField(r.updatedAt.toISOString()),
      ].join(","),
    );
  }

  // Prepend BOM so Excel detects UTF-8 (Thai text would otherwise garble).
  const body = "﻿" + lines.join("\r\n");
  const filename = `contracts-${formatInTimeZone(new Date(), TZ, "yyyyMMdd-HHmm")}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

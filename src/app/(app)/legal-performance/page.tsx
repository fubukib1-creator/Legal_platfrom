import Link from "next/link";
import { redirect } from "next/navigation";
import type { ContractComplexity } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getLegalKPIData } from "@/server/queries/legal-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KPITile } from "@/components/dashboard/kpi-tile";
import { PeriodPicker } from "@/components/shared/period-picker";
import { recentMonthKeys, recentYearKeys, resolvePeriod } from "@/lib/period";
import { cn } from "@/lib/utils";

type SearchParams = { period?: string; value?: string };

// Links to /contracts pre-filtered for the SLA cards.
const PAST_DEADLINE_HREF = "/contracts?status=IN_LEGAL_REVIEW&sla=breached";
const DEADLINE_APPROACHING_HREF = "/contracts?status=IN_LEGAL_REVIEW&sla=warning";

// Statuses that match the "pending signed & uploaded" definition used by the
// legal KPI query (NOT_DONE_STATUSES). We only forward the ones the contracts
// list still exposes as filter chips; legacy statuses are dropped at the page
// layer anyway.
const PENDING_STATUSES = [
  "REGISTERED",
  "IN_LEGAL_REVIEW",
  "PENDING_BU_REVISION",
  "AWAITING_SIGNATURE",
];

function pendingByDeptHref(department: string): string {
  const params = new URLSearchParams();
  params.set("department", department);
  for (const s of PENDING_STATUSES) params.append("status", s);
  return `/contracts?${params.toString()}`;
}

export default async function LegalKPIPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "LEGAL_LEAD" && session.user.role !== "ADMIN") {
    redirect("/contracts");
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const data = await getLegalKPIData(period);

  const fmtNum = (n: number, digits = 1) =>
    Number.isFinite(n) ? n.toFixed(digits) : "—";
  const fmtPct = (v: number | null) =>
    v == null ? "—" : `${Math.round(v * 100)}%`;
  const fmtBD = (v: number | null) => (v == null ? "—" : fmtNum(v, 1));

  // For the bar in the monthly chart row: max throughput across the table.
  const maxFlow = Math.max(
    1,
    ...data.monthly.map((m) => Math.max(m.registered, m.returned)),
  );

  const maxPending = Math.max(1, ...data.pendingByBU.map((p) => p.count));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Legal review performance</h1>
          <p className="text-sm text-slate-500">
            Showing <span className="font-medium">{data.periodLabel}</span>.
            Turnaround is measured in business days.
          </p>
        </div>
        <PeriodPicker
          kind={period.kind}
          value={period.value}
          monthKeys={recentMonthKeys()}
          yearKeys={recentYearKeys()}
        />
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPITile label="Registered" value={data.cohort.registered} />
        <KPITile label="In Legal Review" value={data.cohort.inLegalReview} />
        <Link
          href={DEADLINE_APPROACHING_HREF}
          className="rounded-xl transition hover:ring-2 hover:ring-primary/40"
        >
          <KPITile
            label="Deadline approaching"
            value={data.cohort.deadlineApproaching}
            accent={data.cohort.deadlineApproaching > 0 ? "warning" : "default"}
            hint="≤ 2 business days · View →"
          />
        </Link>
        <Link
          href={PAST_DEADLINE_HREF}
          className="rounded-xl transition hover:ring-2 hover:ring-primary/40"
        >
          <KPITile
            label="Past deadline"
            value={data.cohort.breachedOpen}
            accent={data.cohort.breachedOpen > 0 ? "danger" : "default"}
            hint="View contracts →"
          />
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPITile
          label="Awaiting signature"
          value={data.cohort.awaitingSignature}
        />
        <KPITile
          label="Avg turnaround"
          value={
            data.periodAvgTurnaroundBD == null
              ? "—"
              : `${fmtNum(data.periodAvgTurnaroundBD, 1)} BD`
          }
        />
        <KPITile
          label="On-time rate"
          value={fmtPct(data.periodOnTimeRate)}
          accent={
            data.periodOnTimeRate == null
              ? "default"
              : data.periodOnTimeRate >= 0.9
                ? "success"
                : data.periodOnTimeRate >= 0.7
                  ? "warning"
                  : "danger"
          }
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {period.kind === "year"
                ? `Monthly performance — ${data.periodLabel}`
                : `Monthly performance — ${data.periodLabel}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Month</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="w-44">Volume</TableHead>
                  <TableHead className="text-right">Avg BD</TableHead>
                  <TableHead className="text-right">Median BD</TableHead>
                  <TableHead className="text-right">On-time</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">On-time %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.monthly.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-slate-500">
                      No data for {data.periodLabel}.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {data.monthly.map((m) => {
                      const onTimeRate =
                        m.onTime + m.late === 0
                          ? null
                          : m.onTime / (m.onTime + m.late);
                      const registeredPct = (m.registered / maxFlow) * 100;
                      const returnedPct = (m.returned / maxFlow) * 100;
                      return (
                        <TableRow key={m.monthKey}>
                          <TableCell className="font-medium">{m.monthLabel}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.registered}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.returned}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <BarRow
                                color="bg-blue-500"
                                label="Reg"
                                valuePct={registeredPct}
                              />
                              <BarRow
                                color="bg-emerald-500"
                                label="Ret"
                                valuePct={returnedPct}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtBD(m.avgTurnaroundBD)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtBD(m.medianTurnaroundBD)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700">
                            {m.onTime}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-orange-700">
                            {m.late}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span
                              className={cn(
                                onTimeRate == null
                                  ? "text-slate-400"
                                  : onTimeRate >= 0.9
                                    ? "text-emerald-700"
                                    : onTimeRate >= 0.7
                                      ? "text-amber-700"
                                      : "text-red-700",
                              )}
                            >
                              {fmtPct(onTimeRate)}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {data.yearlyTotal ? (
                      (() => {
                        const t = data.yearlyTotal;
                        const onTimeRate =
                          t.onTime + t.late === 0
                            ? null
                            : t.onTime / (t.onTime + t.late);
                        return (
                          <TableRow
                            key="year-total"
                            className="border-t-2 bg-muted/40 font-semibold"
                          >
                            <TableCell>{t.monthLabel}</TableCell>
                            <TableCell className="text-right tabular-nums">{t.registered}</TableCell>
                            <TableCell className="text-right tabular-nums">{t.returned}</TableCell>
                            <TableCell />
                            <TableCell className="text-right tabular-nums">
                              {fmtBD(t.avgTurnaroundBD)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtBD(t.medianTurnaroundBD)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-emerald-700">
                              {t.onTime}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-orange-700">
                              {t.late}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtPct(onTimeRate)}
                            </TableCell>
                          </TableRow>
                        );
                      })()
                    ) : null}
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ComplexityCard proportions={data.complexityProportions} />
        <ExtensionCard
          extended={data.extensionProportion.extended}
          notExtended={data.extensionProportion.notExtended}
          total={data.extensionProportion.total}
          ratio={data.extensionProportion.ratio}
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pending signed and uploaded contract by BU
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.pendingByBU.length === 0 ? (
              <p className="text-sm text-slate-500">
                Every BU is clear — no pending contracts right now.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.pendingByBU.map((row) => {
                  const pct = (row.count / maxPending) * 100;
                  return (
                    <li key={row.department}>
                      <Link
                        href={pendingByDeptHref(row.department)}
                        className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1 transition hover:bg-muted/40"
                      >
                        <span className="w-12 text-xs font-medium text-slate-700">
                          {row.department}
                        </span>
                        <div className="h-3 flex-1 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{
                              width: `${Math.max(pct, pct > 0 ? 4 : 0)}%`,
                            }}
                          />
                        </div>
                        <span className="w-10 text-right text-sm font-semibold tabular-nums">
                          {row.count}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function BarRow({
  color,
  label,
  valuePct,
}: {
  color: string;
  label: string;
  valuePct: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[10px] uppercase text-slate-500">{label}</span>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(valuePct, valuePct > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

const COMPLEXITY_LABEL: Record<ContractComplexity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const COMPLEXITY_COLOR: Record<ContractComplexity, string> = {
  LOW: "bg-emerald-500",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-red-500",
};

function ComplexityCard({
  proportions,
}: {
  proportions: ReadonlyArray<{
    complexity: ContractComplexity;
    count: number;
    ratio: number;
  }>;
}) {
  const total = proportions.reduce((s, p) => s + p.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contract complexity proportion</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-slate-500">
            No categorised contracts in this period.
          </p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {proportions.map((p) =>
                p.count === 0 ? null : (
                  <div
                    key={p.complexity}
                    className={COMPLEXITY_COLOR[p.complexity]}
                    style={{ width: `${p.ratio * 100}%` }}
                    title={`${COMPLEXITY_LABEL[p.complexity]}: ${p.count}`}
                  />
                ),
              )}
            </div>
            <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
              {proportions.map((p) => (
                <li key={p.complexity} className="flex items-center gap-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-sm ${COMPLEXITY_COLOR[p.complexity]}`}
                  />
                  <span className="text-slate-700">
                    {COMPLEXITY_LABEL[p.complexity]}
                  </span>
                  <span className="ml-auto tabular-nums text-slate-500">
                    {p.count} · {Math.round(p.ratio * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ExtensionCard({
  extended,
  notExtended,
  total,
  ratio,
}: {
  extended: number;
  notExtended: number;
  total: number;
  ratio: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">SLA extension proportion</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-slate-500">No contracts in this period.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {extended === 0 ? null : (
                <div
                  className="bg-orange-500"
                  style={{ width: `${ratio * 100}%` }}
                />
              )}
              {notExtended === 0 ? null : (
                <div
                  className="bg-sky-500"
                  style={{ width: `${(1 - ratio) * 100}%` }}
                />
              )}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm bg-orange-500" />
                <span className="text-slate-700">Extended</span>
                <span className="ml-auto tabular-nums text-slate-500">
                  {extended} · {Math.round(ratio * 100)}%
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm bg-sky-500" />
                <span className="text-slate-700">Not extended</span>
                <span className="ml-auto tabular-nums text-slate-500">
                  {notExtended} · {Math.round((1 - ratio) * 100)}%
                </span>
              </li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

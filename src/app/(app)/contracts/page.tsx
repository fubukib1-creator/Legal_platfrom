import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ContractComplexity,
  ContractStatus,
  ContractType,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  listContracts,
  isContractSortKey,
  parseSortDir,
  DEFAULT_SORT_KEY,
  DEFAULT_SORT_DIR,
  type ContractSortKey,
  type ContractSLAFilter,
} from "@/server/queries/contracts";
import {
  isContractComplexity,
  isContractExtensionFilter,
  type ContractExtensionFilter,
} from "@/lib/contract-filters";
import { resolvePeriod } from "@/lib/period";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/contract/status-badge";
import { ContractsFilterForm } from "./contracts-filter-form";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import { BU_DEPARTMENTS } from "@/lib/departments";
import { cn } from "@/lib/utils";

// Filterable statuses — legacy values (WITH_COUNTERPARTY / CP_RESPONDED /
// MONITORING / AWAITING_TEMPLATE) are deliberately omitted because no current
// transition can land a contract in them.
const FILTER_STATUSES: ContractStatus[] = [
  "REGISTERED",
  "IN_LEGAL_REVIEW",
  "PENDING_BU_REVISION",
  "AWAITING_SIGNATURE",
  "OUT_FOR_SIGNING",
  "CANCELLED",
];

const ALL_CONTRACT_TYPES: ContractType[] = CONTRACT_TYPES.map((t) => t.id);
const ALL_SLA: ContractSLAFilter[] = ["breached", "warning"];

const TZ = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

type SearchParams = {
  search?: string;
  status?: string | string[];
  department?: string | string[];
  type?: string | string[];
  sla?: string | string[];
  complexity?: string | string[];
  extension?: string;
  period?: string;
  value?: string;
  page?: string;
  sort?: string;
  dir?: string;
};

const COMPLEXITY_LABEL: Record<ContractComplexity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const EXTENSION_LABEL: Record<ContractExtensionFilter, string> = {
  extended: "SLA extended",
  not_extended: "Not extended",
};

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;

  const search = sp.search?.trim() || undefined;

  const statusFilter = asArray(sp.status).filter((s): s is ContractStatus =>
    FILTER_STATUSES.includes(s as ContractStatus),
  );
  const departmentFilter = asArray(sp.department).filter((d) =>
    BU_DEPARTMENTS.includes(d),
  );
  const typeFilter = asArray(sp.type).filter((t): t is ContractType =>
    ALL_CONTRACT_TYPES.includes(t as ContractType),
  );
  const slaFilter = asArray(sp.sla).filter((s): s is ContractSLAFilter =>
    ALL_SLA.includes(s as ContractSLAFilter),
  );
  const complexityFilter = asArray(sp.complexity).filter(isContractComplexity);
  const extensionFilter =
    sp.extension && isContractExtensionFilter(sp.extension)
      ? sp.extension
      : undefined;

  // Period scoping is opt-in: only the Legal performance drill-downs pass a
  // `period` param, and the list then restricts to that window's start dates so
  // its totals line up with the card. A bare /contracts visit has no period and
  // shows every contract in scope.
  const period = sp.period
    ? resolvePeriod({ period: sp.period, value: sp.value })
    : null;

  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const sort: ContractSortKey =
    sp.sort && isContractSortKey(sp.sort) ? sp.sort : DEFAULT_SORT_KEY;
  const dir = parseSortDir(sp.dir);

  const result = await listContracts(
    {
      id: session.user.id,
      role: session.user.role,
      department: session.user.department,
    },
    {
      search,
      status: statusFilter.length ? statusFilter : undefined,
      departments: departmentFilter.length ? departmentFilter : undefined,
      types: typeFilter.length ? typeFilter : undefined,
      sla: slaFilter.length ? slaFilter : undefined,
      complexity: complexityFilter.length ? complexityFilter : undefined,
      extension: extensionFilter,
      startFrom: period?.start,
      startTo: period?.end,
      page,
      sort,
      dir,
    },
  );

  // Single source of truth for the filter params that must survive sorting,
  // pagination, and CSV export.
  const filterExtras: FilterExtras = {
    search,
    statuses: statusFilter,
    departments: departmentFilter,
    types: typeFilter,
    sla: slaFilter,
    complexity: complexityFilter,
    extension: extensionFilter,
    period: period?.kind,
    value: period?.value,
  };

  const canCreate = hasPermission(session.user.role, "contract:create");
  const canExport = hasPermission(session.user.role, "contract:export-csv");
  const isBU =
    session.user.role === "BU_MANAGER" || session.user.role === "BU_MEMBER";
  const titleSuffix = isBU ? ` - ${session.user.department}` : "";
  const exportParams = new URLSearchParams();
  appendFilters(exportParams, filterExtras);
  const exportHref = `/api/export/contracts.csv${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Contracts{titleSuffix}
          </h1>
          <p className="text-sm text-slate-500">
            {result.total} total · page {result.page} of {result.pageCount}
          </p>
        </div>
        <div className="flex gap-2">
          {canExport ? (
            <Link
              href={exportHref}
              prefetch={false}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              <span aria-hidden="true">⬇</span>
              Export CSV
            </Link>
          ) : null}
          {canCreate ? (
            <Link href="/contracts/new" className={buttonVariants({ variant: "default" })}>
              New contract
            </Link>
          ) : null}
        </div>
      </header>

      <ContractsFilterForm
        statuses={FILTER_STATUSES}
        departments={[...BU_DEPARTMENTS]}
        selectedStatuses={statusFilter}
        selectedDepartments={departmentFilter}
        selectedTypes={typeFilter}
        selectedSLA={slaFilter}
        defaultSearch={search ?? ""}
        role={session.user.role}
      />

      {period || complexityFilter.length > 0 || extensionFilter ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Drill-down from Legal performance:</span>
          {period ? (
            <DrillChip
              label={`Period · ${period.label}`}
              href={hrefWithout(filterExtras, { period: true })}
            />
          ) : null}
          {complexityFilter.map((c) => (
            <DrillChip
              key={c}
              label={`Complexity · ${COMPLEXITY_LABEL[c]}`}
              href={hrefWithout(filterExtras, { complexity: c })}
            />
          ))}
          {extensionFilter ? (
            <DrillChip
              label={EXTENSION_LABEL[extensionFilter]}
              href={hrefWithout(filterExtras, { extension: true })}
            />
          ) : null}
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="#" sortKey="contractNumber" currentSort={sort} currentDir={dir} extra={filterExtras} />
              <SortHeader label="Title" sortKey="title" currentSort={sort} currentDir={dir} extra={filterExtras} />
              <SortHeader label="Counterparty" sortKey="counterparty" currentSort={sort} currentDir={dir} extra={filterExtras} />
              {!isBU ? (
                <SortHeader label="Department" sortKey="buDepartment" currentSort={sort} currentDir={dir} extra={filterExtras} />
              ) : null}
              <SortHeader label="Status" sortKey="status" currentSort={sort} currentDir={dir} extra={filterExtras} />
              <SortHeader label="Round" sortKey="currentRound" currentSort={sort} currentDir={dir} extra={filterExtras} />
              <SortHeader label="Updated" sortKey="updatedAt" currentSort={sort} currentDir={dir} extra={filterExtras} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isBU ? 6 : 7} className="text-center text-sm text-slate-500">
                  No contracts match these filters yet.
                </TableCell>
              </TableRow>
            ) : (
              result.items.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    <Link href={`/contracts/${c.id}`} className="hover:underline">
                      {c.contractNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/contracts/${c.id}`} className="hover:underline">
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell>{c.counterparty}</TableCell>
                  {!isBU ? <TableCell>{c.buDepartment}</TableCell> : null}
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>{c.currentRound}</TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {TZ.format(c.updatedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {result.pageCount > 1 ? (
        <div className="flex justify-end gap-2">
          <PaginationLink
            page={result.page - 1}
            disabled={result.page <= 1}
            label="Previous"
            extra={filterExtras}
            sort={sort}
            dir={dir}
          />
          <PaginationLink
            page={result.page + 1}
            disabled={result.page >= result.pageCount}
            label="Next"
            extra={filterExtras}
            sort={sort}
            dir={dir}
          />
        </div>
      ) : null}
    </div>
  );
}

type FilterExtras = {
  search?: string;
  statuses: ContractStatus[];
  departments: string[];
  types: ContractType[];
  sla: ContractSLAFilter[];
  complexity: ContractComplexity[];
  extension?: ContractExtensionFilter;
  period?: string;
  value?: string;
};

function appendFilters(params: URLSearchParams, e: FilterExtras) {
  if (e.search) params.set("search", e.search);
  for (const s of e.statuses) params.append("status", s);
  for (const d of e.departments) params.append("department", d);
  for (const t of e.types) params.append("type", t);
  for (const s of e.sla) params.append("sla", s);
  for (const c of e.complexity) params.append("complexity", c);
  if (e.extension) params.set("extension", e.extension);
  if (e.period) params.set("period", e.period);
  if (e.value) params.set("value", e.value);
}

// Builds a /contracts URL identical to the current one but with a single
// drill-down dimension removed — backs the "×" on each drill-down chip.
function hrefWithout(
  extras: FilterExtras,
  drop: { period?: boolean; extension?: boolean; complexity?: ContractComplexity },
): string {
  const next: FilterExtras = {
    ...extras,
    complexity: drop.complexity
      ? extras.complexity.filter((c) => c !== drop.complexity)
      : extras.complexity,
    extension: drop.extension ? undefined : extras.extension,
    period: drop.period ? undefined : extras.period,
    value: drop.period ? undefined : extras.value,
  };
  const params = new URLSearchParams();
  appendFilters(params, next);
  return `/contracts${params.toString() ? `?${params.toString()}` : ""}`;
}

function DrillChip({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-primary/10"
    >
      {label}
      <span aria-hidden="true" className="text-muted-foreground">
        ×
      </span>
    </Link>
  );
}

function PaginationLink({
  page,
  disabled,
  label,
  extra,
  sort,
  dir,
}: {
  page: number;
  disabled: boolean;
  label: string;
  extra: FilterExtras;
  sort: ContractSortKey;
  dir: "asc" | "desc";
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {label}
      </Button>
    );
  }
  const params = new URLSearchParams();
  params.set("page", String(page));
  appendFilters(params, extra);
  if (sort !== DEFAULT_SORT_KEY) params.set("sort", sort);
  if (dir !== DEFAULT_SORT_DIR) params.set("dir", dir);
  return (
    <Link
      href={`/contracts?${params.toString()}`}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      {label}
    </Link>
  );
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  extra,
}: {
  label: string;
  sortKey: ContractSortKey;
  currentSort: ContractSortKey;
  currentDir: "asc" | "desc";
  extra: FilterExtras;
}) {
  const active = currentSort === sortKey;
  const nextDir: "asc" | "desc" =
    active ? (currentDir === "asc" ? "desc" : "asc") : "desc";

  const params = new URLSearchParams();
  appendFilters(params, extra);
  if (sortKey !== DEFAULT_SORT_KEY) params.set("sort", sortKey);
  if (nextDir !== DEFAULT_SORT_DIR) params.set("dir", nextDir);

  const arrow = active ? (currentDir === "asc" ? "↑" : "↓") : "";

  return (
    <TableHead>
      <Link
        href={`/contracts${params.toString() ? `?${params.toString()}` : ""}`}
        className={cn(
          "inline-flex items-center gap-1 hover:underline",
          active && "font-semibold text-foreground",
        )}
      >
        {label}
        {arrow ? <span className="text-xs">{arrow}</span> : null}
      </Link>
    </TableHead>
  );
}

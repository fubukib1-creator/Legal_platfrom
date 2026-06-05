import "server-only";
import { Prisma } from "@prisma/client";
import type { Contract, ContractStatus, ContractType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { contractScopeWhere, type SessionUser } from "@/lib/permissions";

import { DEFAULT_SORT_DIR, DEFAULT_SORT_KEY } from "@/lib/contract-sort";
import type { ContractSortKey } from "@/lib/contract-sort";

// Re-export the sort allow-list so callers that already import from this
// module can keep doing so. The lib module stays Prisma-free for unit tests.
export {
  CONTRACT_SORT_KEYS,
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  isContractSortKey,
  parseSortDir,
} from "@/lib/contract-sort";
export type { ContractSortKey } from "@/lib/contract-sort";

const DEFAULT_PAGE_SIZE = 25;

// SLA-status URL filters. "breached" = open review past deadline, "warning"
// = open review ≤2 BD from deadline (matches the legal-performance cards).
export type ContractSLAFilter = "breached" | "warning";

export type ContractListFilters = {
  status?: ContractStatus[];
  departments?: string[];
  types?: ContractType[];
  sla?: ContractSLAFilter[];
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: ContractSortKey;
  dir?: "asc" | "desc";
};

export type ContractListItem = Pick<
  Contract,
  | "id"
  | "contractNumber"
  | "title"
  | "counterparty"
  | "buDepartment"
  | "status"
  | "currentRound"
  | "updatedAt"
> & { ownerName: string };

export type ContractListResult = {
  items: ContractListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listContracts(
  user: SessionUser,
  filters: ContractListFilters = {},
): Promise<ContractListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  // SLA filter is applied via a `reviews` relation predicate. "breached" looks
  // for any open Review row with slaStatus BREACHED; "warning" matches WARNING.
  // Multiple SLA filters OR together inside the same relation predicate.
  const slaStatuses: Array<"BREACHED" | "WARNING"> = [];
  if (filters.sla?.includes("breached")) slaStatuses.push("BREACHED");
  if (filters.sla?.includes("warning")) slaStatuses.push("WARNING");

  const where: Prisma.ContractWhereInput = {
    ...contractScopeWhere(user),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.departments?.length
      ? { buDepartment: { in: filters.departments } }
      : {}),
    ...(filters.types?.length ? { type: { in: filters.types } } : {}),
    ...(slaStatuses.length
      ? {
          reviews: {
            some: {
              returnedAt: null,
              slaStatus: { in: slaStatuses },
            },
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { contractNumber: { contains: filters.search, mode: "insensitive" } },
            { title: { contains: filters.search, mode: "insensitive" } },
            { counterparty: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const sortKey: ContractSortKey = filters.sort ?? DEFAULT_SORT_KEY;
  const sortDir: "asc" | "desc" = filters.dir ?? DEFAULT_SORT_DIR;
  // Stable secondary sort by id so rows with identical sort values stay
  // ordered consistently across page loads.
  const orderBy: Prisma.ContractOrderByWithRelationInput[] = [
    { [sortKey]: sortDir } as Prisma.ContractOrderByWithRelationInput,
    { id: "asc" },
  ];

  const [total, rows] = await prisma.$transaction([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { buOwner: { select: { name: true } } },
    }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      contractNumber: r.contractNumber,
      title: r.title,
      counterparty: r.counterparty,
      buDepartment: r.buDepartment,
      status: r.status,
      currentRound: r.currentRound,
      updatedAt: r.updatedAt,
      ownerName: r.buOwner.name,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type ContractDetail = Awaited<ReturnType<typeof getContractDetail>>;

async function getContractDetail(id: string) {
  return prisma.contract.findUnique({
    where: { id },
    include: {
      buOwner: { select: { id: true, name: true, email: true } },
      versions: {
        orderBy: { uploadedAt: "desc" },
      },
      reviews: {
        orderBy: { round: "asc" },
        include: { assignedTo: { select: { id: true, name: true } } },
      },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, name: true, role: true } } },
      },
    },
  });
}

// Returns the contract if (a) it exists and (b) the user is allowed to see it.
// Returns null in both the "not found" and "scope violation" cases — callers
// should surface 404 in either case to avoid leaking existence.
export async function getContractById(user: SessionUser, id: string) {
  const contract = await getContractDetail(id);
  if (!contract) return null;

  const scopeWhere = contractScopeWhere(user);
  if ("buDepartment" in scopeWhere && contract.buDepartment !== scopeWhere.buDepartment) {
    return null;
  }
  return contract;
}

export type ContractWithScope = NonNullable<
  Awaited<ReturnType<typeof getContractById>>
>;

// BU teams (departments) available as the "owner" of a contract from Legal's
// creation form. Only teams with at least one active BU user can be selected,
// because the schema requires a concrete `buOwnerId` and the owning team is
// represented in DB by an active user from that department.
export type BUTeamOption = {
  department: string;
  memberCount: number;
};

export async function listBUTeams(): Promise<BUTeamOption[]> {
  const grouped = await prisma.user.groupBy({
    by: ["department"],
    where: {
      active: true,
      role: { in: ["BU_MEMBER", "BU_MANAGER"] },
    },
    _count: { _all: true },
    orderBy: { department: "asc" },
  });
  return grouped.map((g) => ({
    department: g.department,
    memberCount: g._count._all,
  }));
}

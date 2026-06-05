// Allow-list of fields the contracts list will sort by. Anything outside this
// set falls back to the default in the page handler, so attacker-supplied URL
// params can never reach Prisma. Kept Prisma-free so unit tests can import it
// without spinning up a DB connection.
export const CONTRACT_SORT_KEYS = [
  "contractNumber",
  "title",
  "counterparty",
  "buDepartment",
  "status",
  "currentRound",
  "updatedAt",
  "createdAt",
  "startDate",
] as const;
export type ContractSortKey = (typeof CONTRACT_SORT_KEYS)[number];

export const DEFAULT_SORT_KEY: ContractSortKey = "updatedAt";
export const DEFAULT_SORT_DIR: "asc" | "desc" = "desc";

export function isContractSortKey(value: string): value is ContractSortKey {
  return (CONTRACT_SORT_KEYS as ReadonlyArray<string>).includes(value);
}

export function parseSortDir(value: string | undefined): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

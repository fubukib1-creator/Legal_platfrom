// URL-driven filters for the contracts list that are shared with the Legal
// performance dashboard drill-downs. Kept Prisma-free (type-only imports) so
// unit tests can validate the allow-lists without a DB connection — same
// philosophy as `contract-sort.ts`.
import type { ContractComplexity } from "@prisma/client";

// Complexity buckets, mirroring the `ContractComplexity` enum. Used both to
// validate URL params and to drive the Legal performance complexity card.
export const CONTRACT_COMPLEXITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export function isContractComplexity(value: string): value is ContractComplexity {
  return (CONTRACT_COMPLEXITIES as ReadonlyArray<string>).includes(value);
}

// SLA-extension drill-down. "extended" = the contract has at least one review
// that pushed its SLA deadline (slaExtensionDays > 0). "not_extended" = it has
// no such review — this INCLUDES contracts with zero reviews, so it matches the
// Legal performance "Not extended" segment (cohort total minus extended).
export const CONTRACT_EXTENSION_FILTERS = ["extended", "not_extended"] as const;
export type ContractExtensionFilter = (typeof CONTRACT_EXTENSION_FILTERS)[number];

export function isContractExtensionFilter(
  value: string,
): value is ContractExtensionFilter {
  return (CONTRACT_EXTENSION_FILTERS as ReadonlyArray<string>).includes(value);
}

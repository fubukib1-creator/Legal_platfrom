// BU departments shown in the contract registration form. Sorted
// alphabetically per spec — display order = sort order.
export const BU_DEPARTMENTS: ReadonlyArray<string> = [
  "CE",
  "DP",
  "FM",
  "FP",
  "SP",
  "VB",
  "VC",
];

// Internal departments — Legal/IT are admin-managed roles, not BU lines.
export const INTERNAL_DEPARTMENTS: ReadonlyArray<string> = ["Legal", "IT"];

// Every assignable department for /admin/users. BU departments first, then
// the internal ones. Legal users go in "Legal", admins typically in "IT".
export const ALL_DEPARTMENTS: ReadonlyArray<string> = [
  ...BU_DEPARTMENTS,
  ...INTERNAL_DEPARTMENTS,
];

export function isBUDepartment(value: string): boolean {
  return BU_DEPARTMENTS.includes(value);
}

// Two-digit team code embedded in contract numbers (e.g. "06" for VB).
// Numbering is the BU_DEPARTMENTS list's alphabetical order starting at 01.
// Non-BU departments (Legal, IT) fall back to "00" because they should never
// be the buDepartment of a contract anyway.
export function teamCodeFor(department: string): string {
  const idx = BU_DEPARTMENTS.indexOf(department);
  if (idx < 0) return "00";
  return String(idx + 1).padStart(2, "0");
}


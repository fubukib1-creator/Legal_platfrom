import type { ContractType } from "@prisma/client";

// Display order matters — these appear in the type select on /contracts/new
// in this exact sequence. `code` is the 2-letter token embedded in the
// contract number.
//
// The first four types (MOU/NDA/PROCUREMENT/OTHERS) share a single global
// per-year running counter. The latter three (INQUIRY/POA/OFFICIAL_LETTER)
// each maintain their own per-type per-year sequence — `separateSequence`
// flags them so the registration action knows to filter by type code when
// computing the next sequence.
export const CONTRACT_TYPES: ReadonlyArray<{
  id: ContractType;
  label: string;
  code: string;
  separateSequence?: boolean;
}> = [
  { id: "MOU", label: "MOU", code: "AM" },
  { id: "NDA", label: "NDA", code: "AN" },
  { id: "PROCUREMENT", label: "Procurement", code: "AP" },
  { id: "OTHERS", label: "Others", code: "AO" },
  { id: "INQUIRY", label: "ข้อสอบถาม", code: "IN", separateSequence: true },
  { id: "POA", label: "POA", code: "PO", separateSequence: true },
  { id: "OFFICIAL_LETTER", label: "หนังสือทางการ", code: "OL", separateSequence: true },
];

const LABEL_BY_ID = new Map(CONTRACT_TYPES.map((t) => [t.id, t.label] as const));
const CODE_BY_ID = new Map(CONTRACT_TYPES.map((t) => [t.id, t.code] as const));
const SEP_BY_ID = new Map(
  CONTRACT_TYPES.map((t) => [t.id, t.separateSequence === true] as const),
);

export function contractTypeLabel(id: ContractType): string {
  return LABEL_BY_ID.get(id) ?? String(id);
}

export function contractTypeCode(id: ContractType): string {
  return CODE_BY_ID.get(id) ?? "AO";
}

export function contractTypeUsesSeparateSequence(id: ContractType): boolean {
  return SEP_BY_ID.get(id) ?? false;
}

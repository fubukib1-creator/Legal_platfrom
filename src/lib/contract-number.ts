// Contract number formats:
//   Running format (real contracts — MOU/NDA/PROCUREMENT/OTHERS):
//     INP_{TT}{XX}{YYYY}{NNN}
//       TT   = two-digit team code (alphabetical position of the BU dept)
//       XX   = two-letter type code starting with "A"
//       YYYY = four-digit year
//       NNN  = three-digit running sequence, restarts every January
//     Example: INP_06AN2026001 = VB team (06), NDA (AN), 1st contract of 2026.
//
//   Non-running format (INQUIRY/POA/OFFICIAL_LETTER):
//     INP_{TT}{XX}{YYYY}-{HHHHHH}
//       HHHHHH = 6-char uppercase hex random suffix
//     Example: INP_06IN2026-A4B2C1
//   These types never had a meaningful sequence (legal doesn't number letters
//   of inquiry), so we drop the counter and just use a random suffix to keep
//   the identifier unique without coordinating a shared per-year counter.

const CONTRACT_NUMBER_RE = /^INP_(\d{2})([A-Z]{2})(\d{4})(\d{3})$/;
const NON_RUNNING_RE = /^INP_(\d{2})([A-Z]{2})(\d{4})-([A-F0-9]{6})$/;
const SEQ_PAD = 3;
const MAX_SEQUENCE = 999;

export type ContractNumberParts = {
  teamCode: string;
  typeCode: string;
  year: number;
  sequence: number;
};

export type ContractNumberInputs = {
  teamCode: string;
  typeCode: string;
  year: number;
  sequence: number;
};

export function formatContractNumber(p: ContractNumberInputs): string {
  if (!/^\d{2}$/.test(p.teamCode)) {
    throw new Error(`Invalid teamCode: ${p.teamCode} (must be two digits)`);
  }
  if (!/^[A-Z]{2}$/.test(p.typeCode)) {
    throw new Error(`Invalid typeCode: ${p.typeCode} (must be two capitals)`);
  }
  if (!Number.isInteger(p.year) || p.year < 2000 || p.year > 9999) {
    throw new Error(`Invalid year: ${p.year}`);
  }
  if (!Number.isInteger(p.sequence) || p.sequence < 1 || p.sequence > MAX_SEQUENCE) {
    throw new Error(
      `Invalid sequence: ${p.sequence} (must be 1..${MAX_SEQUENCE})`,
    );
  }
  const seq = String(p.sequence).padStart(SEQ_PAD, "0");
  return `INP_${p.teamCode}${p.typeCode}${p.year}${seq}`;
}

export function parseContractNumber(value: string): ContractNumberParts | null {
  const m = CONTRACT_NUMBER_RE.exec(value);
  if (!m) return null;
  return {
    teamCode: m[1],
    typeCode: m[2],
    year: Number(m[3]),
    sequence: Number(m[4]),
  };
}

// Computes the next sequence given every existing contract number. The counter
// is global per year, so we look across every contract — regardless of team
// or type — and return max-sequence-for-`year` + 1.
export function nextSequenceFromAll(
  contractNumbers: ReadonlyArray<string>,
  year: number,
): number {
  let max = 0;
  for (const cn of contractNumbers) {
    const parts = parseContractNumber(cn);
    if (!parts) continue;
    if (parts.year !== year) continue;
    if (parts.sequence > max) max = parts.sequence;
  }
  return max + 1;
}

// Builds an identifier for non-running types (no counter, random suffix).
export function formatNonRunningContractNumber(p: {
  teamCode: string;
  typeCode: string;
  year: number;
  // Caller supplies the random suffix so the function stays deterministic and
  // testable; production code uses `randomHexSuffix(6)`.
  randomSuffix: string;
}): string {
  if (!/^\d{2}$/.test(p.teamCode)) {
    throw new Error(`Invalid teamCode: ${p.teamCode} (must be two digits)`);
  }
  if (!/^[A-Z]{2}$/.test(p.typeCode)) {
    throw new Error(`Invalid typeCode: ${p.typeCode} (must be two capitals)`);
  }
  if (!Number.isInteger(p.year) || p.year < 2000 || p.year > 9999) {
    throw new Error(`Invalid year: ${p.year}`);
  }
  if (!/^[A-F0-9]{6}$/.test(p.randomSuffix)) {
    throw new Error(
      `Invalid randomSuffix: ${p.randomSuffix} (must be 6 uppercase hex chars)`,
    );
  }
  return `INP_${p.teamCode}${p.typeCode}${p.year}-${p.randomSuffix}`;
}

export function parseNonRunningContractNumber(value: string): {
  teamCode: string;
  typeCode: string;
  year: number;
  randomSuffix: string;
} | null {
  const m = NON_RUNNING_RE.exec(value);
  if (!m) return null;
  return {
    teamCode: m[1],
    typeCode: m[2],
    year: Number(m[3]),
    randomSuffix: m[4],
  };
}

export function randomHexSuffix(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += Math.floor(Math.random() * 16).toString(16).toUpperCase();
  }
  return out;
}

import type { ContractStatus, Role } from "@prisma/client";

export type TransitionAction =
  | "registerContract"
  | "startReview"
  | "pickupReview"
  | "revise"
  | "resubmitForReview"
  | "markAwaitingSignature"
  | "submitForSigning"
  | "updateTracking"
  | "cancelContract";

export type TransitionResult =
  | { allowed: true; nextStatus: ContractStatus }
  | { allowed: false; reason: TransitionDenialReason };

export type TransitionDenialReason =
  | "role-not-permitted"
  | "wrong-source-status"
  | "unknown-action";

type Rule = {
  from: ReadonlyArray<ContractStatus> | "noContract";
  to: ContractStatus | "self";
  allowedRoles: ReadonlyArray<Role>;
};

const LEGAL_ROLES = ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"] as const;

export const TRANSITION_RULES: Readonly<Record<TransitionAction, Rule>> = {
  registerContract: {
    from: "noContract",
    to: "REGISTERED",
    allowedRoles: LEGAL_ROLES,
  },
  // Legal starts review directly from REGISTERED — no drafting step.
  startReview: {
    from: ["REGISTERED"],
    to: "IN_LEGAL_REVIEW",
    allowedRoles: LEGAL_ROLES,
  },
  pickupReview: {
    from: ["IN_LEGAL_REVIEW"],
    to: "self",
    allowedRoles: LEGAL_ROLES,
  },
  // Legal sends the contract back to BU owner for revision.
  revise: {
    from: ["IN_LEGAL_REVIEW"],
    to: "PENDING_BU_REVISION",
    allowedRoles: LEGAL_ROLES,
  },
  // Legal resubmits after BU has revised — opens a new review with the same round.
  resubmitForReview: {
    from: ["PENDING_BU_REVISION"],
    to: "IN_LEGAL_REVIEW",
    allowedRoles: LEGAL_ROLES,
  },
  markAwaitingSignature: {
    from: ["IN_LEGAL_REVIEW", "PENDING_BU_REVISION"],
    to: "AWAITING_SIGNATURE",
    allowedRoles: LEGAL_ROLES,
  },
  submitForSigning: {
    from: ["AWAITING_SIGNATURE"],
    to: "OUT_FOR_SIGNING",
    allowedRoles: LEGAL_ROLES,
  },
  updateTracking: {
    from: [
      "REGISTERED",
      "AWAITING_TEMPLATE",
      "PENDING_BU_REVISION",
      "IN_LEGAL_REVIEW",
      "AWAITING_SIGNATURE",
      "OUT_FOR_SIGNING",
    ],
    to: "self",
    allowedRoles: LEGAL_ROLES,
  },
  cancelContract: {
    from: [
      "REGISTERED",
      "AWAITING_TEMPLATE",
      "PENDING_BU_REVISION",
      "IN_LEGAL_REVIEW",
      "AWAITING_SIGNATURE",
    ],
    to: "CANCELLED",
    allowedRoles: ["LEGAL_LEAD", "ADMIN"],
  },
};

export function evaluateTransition(
  action: TransitionAction,
  role: Role,
  currentStatus: ContractStatus | null,
): TransitionResult {
  const rule = TRANSITION_RULES[action];
  if (!rule) return { allowed: false, reason: "unknown-action" };

  if (!rule.allowedRoles.includes(role)) {
    return { allowed: false, reason: "role-not-permitted" };
  }

  if (rule.from === "noContract") {
    if (currentStatus !== null) {
      return { allowed: false, reason: "wrong-source-status" };
    }
    if (rule.to === "self") {
      return { allowed: false, reason: "unknown-action" };
    }
    return { allowed: true, nextStatus: rule.to };
  }

  if (currentStatus === null || !rule.from.includes(currentStatus)) {
    return { allowed: false, reason: "wrong-source-status" };
  }

  const nextStatus = rule.to === "self" ? currentStatus : rule.to;
  return { allowed: true, nextStatus };
}

// Round increment rules:
//   - revise from IN_LEGAL_REVIEW → round + 1 (legal finished a review cycle)
//   - everything else             → unchanged
// Round starts at 0 and increments each time legal sends back to BU.
// Round 0 = first review cycle, round 1 = after first revision, etc.
export function nextRoundForAction(
  action: TransitionAction,
  currentRound: number,
): number {
  if (action === "revise") return currentRound + 1;
  return currentRound;
}

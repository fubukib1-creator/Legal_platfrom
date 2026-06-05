import type { ContractStatus, Role } from "@prisma/client";

export type TransitionAction =
  | "registerContract"
  | "assignTemplate"
  | "submitForReview"
  | "pickupReview"
  | "revise"
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

// AWAITING_TEMPLATE is reserved in the enum but not used in v1 — assignTemplate
// transitions REGISTERED directly to DRAFTING in a single action.
// All transitions are Legal-only.
const LEGAL_ROLES = ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"] as const;

export const TRANSITION_RULES: Readonly<Record<TransitionAction, Rule>> = {
  registerContract: {
    from: "noContract",
    to: "REGISTERED",
    allowedRoles: LEGAL_ROLES,
  },
  assignTemplate: {
    from: ["REGISTERED"],
    to: "DRAFTING",
    allowedRoles: LEGAL_ROLES,
  },
  submitForReview: {
    from: ["DRAFTING"],
    to: "IN_LEGAL_REVIEW",
    allowedRoles: LEGAL_ROLES,
  },
  pickupReview: {
    from: ["IN_LEGAL_REVIEW"],
    to: "self",
    allowedRoles: LEGAL_ROLES,
  },
  // Legal sends the contract back to BU for another draft iteration. Closes
  // the current Review and routes back to DRAFTING with round + 1.
  revise: {
    from: ["IN_LEGAL_REVIEW"],
    to: "DRAFTING",
    allowedRoles: LEGAL_ROLES,
  },
  // Collapsed transition: legal moves IN_LEGAL_REVIEW straight to
  // AWAITING_SIGNATURE in one step (replaces the old returnReview→markFinal
  // pair and the now-removed REVIEW_RETURNED stage).
  markAwaitingSignature: {
    from: ["IN_LEGAL_REVIEW"],
    to: "AWAITING_SIGNATURE",
    allowedRoles: LEGAL_ROLES,
  },
  // Terminal: marks the contract as signed and uploaded.
  submitForSigning: {
    from: ["AWAITING_SIGNATURE"],
    to: "OUT_FOR_SIGNING",
    allowedRoles: LEGAL_ROLES,
  },
  // Edit the lifecycle tracking fields without changing status.
  updateTracking: {
    from: [
      "REGISTERED",
      "AWAITING_TEMPLATE",
      "DRAFTING",
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
      "DRAFTING",
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
//   - submitForReview from DRAFTING (round 0)        → round 1 (first review)
//   - submitForReview from DRAFTING with round > 0    → no change
//       (revise already bumped the round on the way back to drafting; the
//       resubmit re-opens the same round number with a new Review)
//   - revise from IN_LEGAL_REVIEW                     → round + 1
//   - everything else                                 → unchanged
export function nextRoundForAction(
  action: TransitionAction,
  currentRound: number,
  currentStatus: ContractStatus | null,
): number {
  if (action === "revise") return currentRound + 1;
  if (action !== "submitForReview") return currentRound;
  if (currentStatus === "DRAFTING" && currentRound === 0) return 1;
  return currentRound;
}

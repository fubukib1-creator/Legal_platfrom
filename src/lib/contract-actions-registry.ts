import type { ContractStatus } from "@prisma/client";
import {
  evaluateTransition,
  type TransitionAction,
} from "@/lib/state-machine";
import {
  PERMISSIONS,
  hasPermission,
  type Permission,
  type SessionUser,
} from "@/lib/permissions";

// The dashboard is a stage-lock tool — no file uploads. Each entry just
// records that Legal advanced the stage on the chosen date, with optional
// notes. `uploadSignedPdf` keeps its lifecycle-tracking fields (still no
// file required) so Legal can capture effective/expiry dates etc.
export type AvailableAction = {
  action: TransitionAction;
  label: string;
  notesField?: string;
};

type ActionDef = {
  action: TransitionAction;
  permission: Permission;
  label: string;
  notesField?: string;
};

// All Legal-driven transitions. The UI surfaces at most ONE of these per
// status via PRIMARY_BY_STATUS below. The full list is kept here so the
// labels stay in one place and the action panel knows how to render any
// action it's handed.
const ACTION_DEFS: ReadonlyArray<ActionDef> = [
  { action: "assignTemplate", permission: "contract:assignTemplate", label: "Assign template", notesField: "templateName" },
  { action: "submitForReview", permission: "contract:submitForReview", label: "Submit for review", notesField: "submitNotes" },
  { action: "revise", permission: "contract:revise", label: "Return with comments", notesField: "legalNotes" },
  { action: "markAwaitingSignature", permission: "contract:markAwaitingSignature", label: "Mark awaiting signature", notesField: "legalNotes" },
  { action: "submitForSigning", permission: "contract:submitForSigning", label: "Mark signed and uploaded" },
  { action: "cancelContract", permission: "contract:cancel", label: "Cancel contract" },
];

// One advance button per stage. IN_LEGAL_REVIEW surfaces two buttons: "Return
// with comments" (loop back to DRAFTING with round + 1) and "Mark awaiting
// signature" (jump straight to AWAITING_SIGNATURE — the old REVIEW_RETURNED
// intermediate stage was removed). OUT_FOR_SIGNING is terminal. `pickupReview`
// is auto-claimed when a legal user opens the detail page, so it has no button.
const ACTIONS_BY_STATUS: Partial<Record<ContractStatus, ReadonlyArray<TransitionAction>>> = {
  REGISTERED: ["assignTemplate"],
  DRAFTING: ["submitForReview"],
  IN_LEGAL_REVIEW: ["revise", "markAwaitingSignature"],
  AWAITING_SIGNATURE: ["submitForSigning"],
};

void PERMISSIONS;

export type ContractCore = {
  id: string;
  status: ContractStatus;
  currentRound: number;
  buOwnerId: string;
  buDepartment: string;
};

function tryAddAction(
  result: AvailableAction[],
  action: TransitionAction,
  user: SessionUser,
  contract: ContractCore,
) {
  const def = ACTION_DEFS.find((d) => d.action === action);
  if (!def) return;
  if (!hasPermission(user.role, def.permission)) return;
  const r = evaluateTransition(def.action, user.role, contract.status);
  if (!r.allowed) return;
  result.push({
    action: def.action,
    label: def.label,
    notesField: def.notesField,
  });
}

export function availableActionsFor(
  user: SessionUser,
  contract: ContractCore,
): AvailableAction[] {
  const result: AvailableAction[] = [];
  const actions = ACTIONS_BY_STATUS[contract.status] ?? [];
  for (const a of actions) tryAddAction(result, a, user, contract);
  // Cancel is always paired with the advance action(s) wherever the contract
  // can still be cancelled.
  tryAddAction(result, "cancelContract", user, contract);
  return result;
}

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

const ACTION_DEFS: ReadonlyArray<ActionDef> = [
  { action: "startReview", permission: "contract:startReview", label: "Start review", notesField: "submitNotes" },
  { action: "revise", permission: "contract:revise", label: "Send back to BU owner", notesField: "legalNotes" },
  { action: "resubmitForReview", permission: "contract:resubmitForReview", label: "Resubmit for review", notesField: "submitNotes" },
  { action: "markAwaitingSignature", permission: "contract:markAwaitingSignature", label: "Mark as signed", notesField: "legalNotes" },
  { action: "submitForSigning", permission: "contract:submitForSigning", label: "Mark as uploaded" },
  { action: "cancelContract", permission: "contract:cancel", label: "Cancel contract" },
];

const ACTIONS_BY_STATUS: Partial<Record<ContractStatus, ReadonlyArray<TransitionAction>>> = {
  REGISTERED: ["startReview"],
  IN_LEGAL_REVIEW: ["revise", "markAwaitingSignature"],
  PENDING_BU_REVISION: ["resubmitForReview", "markAwaitingSignature"],
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
  tryAddAction(result, "cancelContract", user, contract);
  return result;
}

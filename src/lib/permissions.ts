import type { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  role: Role;
  department: string;
};

export type ContractScope = {
  buOwnerId: string;
  buDepartment: string;
};

export type Permission =
  | "contract:view-all"
  | "contract:create"
  | "contract:startReview"
  | "contract:pickupReview"
  | "contract:revise"
  | "contract:resubmitForReview"
  | "contract:markAwaitingSignature"
  | "contract:submitForSigning"
  | "contract:updateTracking"
  | "contract:cancel"
  | "contract:extendSLA"
  | "contract:edit"
  | "contract:delete"
  | "contract:undoStage"
  | "contract:export-csv"
  | "admin:manage-users"
  | "admin:manage-holidays"
  | "admin:manage-templates";

// Dashboard is a stage-lock tool — Legal team drives every transition. BU
// users (members and managers) are read-only viewers of contracts in their
// department.
export const PERMISSIONS: Readonly<Record<Permission, ReadonlyArray<Role>>> = {
  "contract:view-all": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:create": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:startReview": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:pickupReview": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:revise": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:resubmitForReview": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:markAwaitingSignature": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:submitForSigning": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:updateTracking": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:cancel": ["LEGAL_LEAD", "ADMIN"],
  "contract:extendSLA": ["LEGAL_LEAD", "ADMIN"],
  "contract:edit": ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  "contract:delete": ["LEGAL_LEAD", "ADMIN"],
  "contract:undoStage": ["LEGAL_LEAD", "ADMIN"],
  "contract:export-csv": ["LEGAL_LEAD", "ADMIN"],
  "admin:manage-users": ["ADMIN"],
  "admin:manage-holidays": ["ADMIN"],
  "admin:manage-templates": ["ADMIN"],
};

export class PermissionDeniedError extends Error {
  readonly permission: Permission | "scope";
  constructor(permission: Permission | "scope", message?: string) {
    super(message ?? `Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

// Scope check: can this user *see* this contract at all?
// BU members and managers see every contract whose BU owner team matches their
// department (read-only).
export function canViewContract(user: SessionUser, contract: ContractScope): boolean {
  switch (user.role) {
    case "ADMIN":
    case "LEGAL_REVIEWER":
    case "LEGAL_LEAD":
      return true;
    case "BU_MANAGER":
    case "BU_MEMBER":
      return contract.buDepartment === user.department;
  }
}

// For BU-side write actions, ownership is required even if the user holds the
// permission. Legal/admin pass through because they don't have BU ownership.
export function canBUActOnContract(
  user: SessionUser,
  contract: ContractScope,
): boolean {
  switch (user.role) {
    case "ADMIN":
      return true;
    case "BU_MANAGER":
      return contract.buDepartment === user.department;
    case "BU_MEMBER":
      return contract.buOwnerId === user.id;
    case "LEGAL_REVIEWER":
    case "LEGAL_LEAD":
      return false;
  }
}

// Returns a Prisma-compatible WHERE fragment that scopes to what the user may
// see. Used by both list queries and `getContractById`.
export function contractScopeWhere(user: SessionUser):
  | { buDepartment: string }
  | Record<string, never> {
  switch (user.role) {
    case "ADMIN":
    case "LEGAL_REVIEWER":
    case "LEGAL_LEAD":
      return {};
    case "BU_MANAGER":
    case "BU_MEMBER":
      return { buDepartment: user.department };
  }
}

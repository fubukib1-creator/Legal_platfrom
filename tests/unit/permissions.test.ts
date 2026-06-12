import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  PermissionDeniedError,
  assertPermission,
  canViewContract,
  contractScopeWhere,
  hasPermission,
  type Permission,
  type SessionUser,
  type ContractScope,
} from "@/lib/permissions";
import type { Role } from "@prisma/client";

const buMember: SessionUser = { id: "u-bu1", role: "BU_MEMBER", department: "EPC" };
const buManager: SessionUser = { id: "u-bu2", role: "BU_MANAGER", department: "EPC" };

const contractEPCByBU1: ContractScope = { buOwnerId: "u-bu1", buDepartment: "EPC" };
const contractEPCByOther: ContractScope = { buOwnerId: "u-other", buDepartment: "EPC" };
const contractCommercial: ContractScope = { buOwnerId: "u-other", buDepartment: "Commercial" };

describe("permissions matrix — Legal-only stage-lock model", () => {
  it("create is Legal-only", () => {
    expect(hasPermission("LEGAL_REVIEWER", "contract:create")).toBe(true);
    expect(hasPermission("LEGAL_LEAD", "contract:create")).toBe(true);
    expect(hasPermission("ADMIN", "contract:create")).toBe(true);
    expect(hasPermission("BU_MEMBER", "contract:create")).toBe(false);
    expect(hasPermission("BU_MANAGER", "contract:create")).toBe(false);
  });

  it("startReview is Legal/Admin only", () => {
    expect(hasPermission("LEGAL_REVIEWER", "contract:startReview")).toBe(true);
    expect(hasPermission("LEGAL_LEAD", "contract:startReview")).toBe(true);
    expect(hasPermission("ADMIN", "contract:startReview")).toBe(true);
    expect(hasPermission("BU_MEMBER", "contract:startReview")).toBe(false);
    expect(hasPermission("BU_MANAGER", "contract:startReview")).toBe(false);
  });

  it("cancel is LEGAL_LEAD / ADMIN only", () => {
    expect(hasPermission("LEGAL_LEAD", "contract:cancel")).toBe(true);
    expect(hasPermission("ADMIN", "contract:cancel")).toBe(true);
    expect(hasPermission("LEGAL_REVIEWER", "contract:cancel")).toBe(false);
    expect(hasPermission("BU_MANAGER", "contract:cancel")).toBe(false);
    expect(hasPermission("BU_MEMBER", "contract:cancel")).toBe(false);
  });

  const everyContractAction: Permission[] = [
    "contract:create",
    "contract:startReview",
    "contract:resubmitForReview",
    "contract:pickupReview",
    "contract:revise",
    "contract:markAwaitingSignature",
    "contract:submitForSigning",
    "contract:updateTracking",
    "contract:cancel",
  ];

  it("BU roles never hold any contract write permission (read-only)", () => {
    for (const p of everyContractAction) {
      expect(hasPermission("BU_MEMBER", p), `${p} should not be granted to BU_MEMBER`).toBe(false);
      expect(hasPermission("BU_MANAGER", p), `${p} should not be granted to BU_MANAGER`).toBe(false);
    }
  });

  it("admin permissions are admin-exclusive", () => {
    const adminOnly: Permission[] = [
      "admin:manage-users",
      "admin:manage-holidays",
      "admin:manage-templates",
    ];
    const otherRoles: Role[] = ["BU_MEMBER", "BU_MANAGER", "LEGAL_REVIEWER", "LEGAL_LEAD"];
    for (const p of adminOnly) {
      expect(hasPermission("ADMIN", p)).toBe(true);
      for (const r of otherRoles) {
        expect(hasPermission(r, p)).toBe(false);
      }
    }
  });

  it("export-csv requires LEGAL_LEAD or ADMIN", () => {
    expect(hasPermission("LEGAL_LEAD", "contract:export-csv")).toBe(true);
    expect(hasPermission("ADMIN", "contract:export-csv")).toBe(true);
    expect(hasPermission("LEGAL_REVIEWER", "contract:export-csv")).toBe(false);
    expect(hasPermission("BU_MANAGER", "contract:export-csv")).toBe(false);
  });

  it("every permission key has a non-empty allowed-roles list", () => {
    for (const [perm, roles] of Object.entries(PERMISSIONS)) {
      expect(roles.length, `${perm} should allow at least one role`).toBeGreaterThan(0);
    }
  });
});

describe("assertPermission", () => {
  it("does nothing when allowed", () => {
    expect(() => assertPermission("LEGAL_REVIEWER", "contract:create")).not.toThrow();
  });

  it("throws PermissionDeniedError when denied", () => {
    expect(() => assertPermission("BU_MEMBER", "contract:create")).toThrow(
      PermissionDeniedError,
    );
  });
});

describe("canViewContract — scope rules", () => {
  it("BU_MEMBER sees every contract assigned to their team", () => {
    expect(canViewContract(buMember, contractEPCByBU1)).toBe(true);
    expect(canViewContract(buMember, contractEPCByOther)).toBe(true);
    expect(canViewContract(buMember, contractCommercial)).toBe(false);
  });

  it("BU_MANAGER sees every contract assigned to their team", () => {
    expect(canViewContract(buManager, contractEPCByBU1)).toBe(true);
    expect(canViewContract(buManager, contractEPCByOther)).toBe(true);
    expect(canViewContract(buManager, contractCommercial)).toBe(false);
  });

  it.each<[Role]>([["LEGAL_REVIEWER"], ["LEGAL_LEAD"], ["ADMIN"]])(
    "%s sees all contracts",
    (role) => {
      const u: SessionUser = { id: "x", role, department: "Legal" };
      expect(canViewContract(u, contractEPCByBU1)).toBe(true);
      expect(canViewContract(u, contractCommercial)).toBe(true);
    },
  );
});

describe("contractScopeWhere — Prisma WHERE fragments", () => {
  it("BU_MEMBER scopes to buDepartment (team-wide read access)", () => {
    expect(contractScopeWhere(buMember)).toEqual({ buDepartment: "EPC" });
  });

  it("BU_MANAGER scopes to buDepartment", () => {
    expect(contractScopeWhere(buManager)).toEqual({ buDepartment: "EPC" });
  });

  it.each<[Role]>([["LEGAL_REVIEWER"], ["LEGAL_LEAD"], ["ADMIN"]])(
    "%s gets an empty WHERE fragment (sees all)",
    (role) => {
      const u: SessionUser = { id: "x", role, department: "x" };
      expect(contractScopeWhere(u)).toEqual({});
    },
  );
});

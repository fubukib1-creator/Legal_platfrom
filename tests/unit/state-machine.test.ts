import { describe, it, expect } from "vitest";
import {
  evaluateTransition,
  nextRoundForAction,
  TRANSITION_RULES,
  type TransitionAction,
} from "@/lib/state-machine";
import type { ContractStatus } from "@prisma/client";

describe("state machine — legal transitions", () => {
  it("LEGAL_REVIEWER can register a new contract (no current status)", () => {
    const r = evaluateTransition("registerContract", "LEGAL_REVIEWER", null);
    expect(r).toEqual({ allowed: true, nextStatus: "REGISTERED" });
  });

  it("LEGAL_REVIEWER can startReview from REGISTERED → IN_LEGAL_REVIEW", () => {
    const r = evaluateTransition("startReview", "LEGAL_REVIEWER", "REGISTERED");
    expect(r).toEqual({ allowed: true, nextStatus: "IN_LEGAL_REVIEW" });
  });

  it("LEGAL_REVIEWER pickupReview keeps status IN_LEGAL_REVIEW", () => {
    const r = evaluateTransition("pickupReview", "LEGAL_REVIEWER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: true, nextStatus: "IN_LEGAL_REVIEW" });
  });

  it("LEGAL_REVIEWER can revise from IN_LEGAL_REVIEW → PENDING_BU_REVISION", () => {
    const r = evaluateTransition("revise", "LEGAL_REVIEWER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: true, nextStatus: "PENDING_BU_REVISION" });
  });

  it("LEGAL_REVIEWER can resubmitForReview from PENDING_BU_REVISION → IN_LEGAL_REVIEW", () => {
    const r = evaluateTransition("resubmitForReview", "LEGAL_REVIEWER", "PENDING_BU_REVISION");
    expect(r).toEqual({ allowed: true, nextStatus: "IN_LEGAL_REVIEW" });
  });

  it("LEGAL_REVIEWER can markAwaitingSignature from IN_LEGAL_REVIEW → AWAITING_SIGNATURE", () => {
    const r = evaluateTransition("markAwaitingSignature", "LEGAL_REVIEWER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: true, nextStatus: "AWAITING_SIGNATURE" });
  });

  it("LEGAL_REVIEWER can submitForSigning (terminal) from AWAITING_SIGNATURE → OUT_FOR_SIGNING", () => {
    const r = evaluateTransition("submitForSigning", "LEGAL_REVIEWER", "AWAITING_SIGNATURE");
    expect(r).toEqual({ allowed: true, nextStatus: "OUT_FOR_SIGNING" });
  });

  it.each<[ContractStatus]>([
    ["REGISTERED"],
    ["PENDING_BU_REVISION"],
    ["IN_LEGAL_REVIEW"],
    ["AWAITING_SIGNATURE"],
  ])("LEGAL_LEAD can cancel from %s", (from) => {
    const r = evaluateTransition("cancelContract", "LEGAL_LEAD", from);
    expect(r).toEqual({ allowed: true, nextStatus: "CANCELLED" });
  });

  it("ADMIN can do anything (registerContract)", () => {
    const r = evaluateTransition("registerContract", "ADMIN", null);
    expect(r.allowed).toBe(true);
  });
});

describe("state machine — illegal transitions", () => {
  it("BU_MEMBER cannot register a contract (Legal-only)", () => {
    const r = evaluateTransition("registerContract", "BU_MEMBER", null);
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MANAGER cannot register a contract (Legal-only)", () => {
    const r = evaluateTransition("registerContract", "BU_MANAGER", null);
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MEMBER cannot startReview (Legal-only)", () => {
    const r = evaluateTransition("startReview", "BU_MEMBER", "REGISTERED");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MEMBER cannot markAwaitingSignature (BU is read-only)", () => {
    const r = evaluateTransition("markAwaitingSignature", "BU_MEMBER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MEMBER cannot submitForSigning (BU is read-only)", () => {
    const r = evaluateTransition("submitForSigning", "BU_MEMBER", "AWAITING_SIGNATURE");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("revise not allowed from REGISTERED (only from IN_LEGAL_REVIEW)", () => {
    const r = evaluateTransition("revise", "LEGAL_REVIEWER", "REGISTERED");
    expect(r).toEqual({ allowed: false, reason: "wrong-source-status" });
  });

  it("BU_MEMBER cannot revise (Legal-only)", () => {
    const r = evaluateTransition("revise", "BU_MEMBER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("startReview not allowed from IN_LEGAL_REVIEW", () => {
    const r = evaluateTransition("startReview", "LEGAL_REVIEWER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: false, reason: "wrong-source-status" });
  });

  it("submitForSigning not allowed from IN_LEGAL_REVIEW", () => {
    const r = evaluateTransition("submitForSigning", "LEGAL_REVIEWER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: false, reason: "wrong-source-status" });
  });

  it("cannot cancel an OUT_FOR_SIGNING (terminal) contract", () => {
    const r = evaluateTransition("cancelContract", "ADMIN", "OUT_FOR_SIGNING");
    expect(r).toEqual({ allowed: false, reason: "wrong-source-status" });
  });

  it("BU_MEMBER cannot cancel (Legal-only)", () => {
    const r = evaluateTransition("cancelContract", "BU_MEMBER", "PENDING_BU_REVISION");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MANAGER cannot cancel (Legal-only)", () => {
    const r = evaluateTransition("cancelContract", "BU_MANAGER", "PENDING_BU_REVISION");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("LEGAL_REVIEWER cannot cancel (must be LEGAL_LEAD or ADMIN)", () => {
    const r = evaluateTransition("cancelContract", "LEGAL_REVIEWER", "PENDING_BU_REVISION");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("registerContract on existing contract is rejected (already has status)", () => {
    const r = evaluateTransition("registerContract", "LEGAL_REVIEWER", "REGISTERED");
    expect(r).toEqual({ allowed: false, reason: "wrong-source-status" });
  });
});

describe("nextRoundForAction", () => {
  it("startReview from REGISTERED does not bump round (round stays 0)", () => {
    expect(nextRoundForAction("startReview", 0)).toBe(0);
  });

  it("non-revise actions never change round", () => {
    expect(nextRoundForAction("markAwaitingSignature", 1)).toBe(1);
    expect(nextRoundForAction("submitForSigning", 3)).toBe(3);
    expect(nextRoundForAction("resubmitForReview", 1)).toBe(1);
  });

  it("revise from IN_LEGAL_REVIEW increments round", () => {
    expect(nextRoundForAction("revise", 0)).toBe(1);
    expect(nextRoundForAction("revise", 1)).toBe(2);
    expect(nextRoundForAction("revise", 3)).toBe(4);
  });
});

describe("TRANSITION_RULES — coverage sanity", () => {
  const expectedActions: TransitionAction[] = [
    "registerContract",
    "startReview",
    "resubmitForReview",
    "pickupReview",
    "revise",
    "markAwaitingSignature",
    "submitForSigning",
    "cancelContract",
  ];

  it("declares a rule for every documented action", () => {
    for (const a of expectedActions) {
      expect(TRANSITION_RULES[a]).toBeDefined();
    }
  });

  it("BU roles are never listed as allowed for any transition (Legal-only)", () => {
    for (const a of expectedActions) {
      expect(TRANSITION_RULES[a].allowedRoles).not.toContain("BU_MEMBER");
      expect(TRANSITION_RULES[a].allowedRoles).not.toContain("BU_MANAGER");
    }
  });

  it("every Legal role appears as an allowed role for at least one action", () => {
    for (const role of ["LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"] as const) {
      const found = expectedActions.some((a) =>
        TRANSITION_RULES[a].allowedRoles.includes(role),
      );
      expect(found).toBe(true);
    }
  });
});

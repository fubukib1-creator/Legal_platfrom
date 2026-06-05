import { describe, it, expect } from "vitest";
import {
  evaluateTransition,
  nextRoundForAction,
  TRANSITION_RULES,
  type TransitionAction,
} from "@/lib/state-machine";
import type { ContractStatus } from "@prisma/client";

// The dashboard is a stage-lock tool — Legal drives every transition. These
// tests pin down that BU roles can only view contracts (no transitions), and
// every transition is permitted to LEGAL_REVIEWER / LEGAL_LEAD / ADMIN.

describe("state machine — legal transitions", () => {
  it("LEGAL_REVIEWER can register a new contract (no current status)", () => {
    const r = evaluateTransition("registerContract", "LEGAL_REVIEWER", null);
    expect(r).toEqual({ allowed: true, nextStatus: "REGISTERED" });
  });

  it("LEGAL_REVIEWER can assign template from REGISTERED → DRAFTING", () => {
    const r = evaluateTransition("assignTemplate", "LEGAL_REVIEWER", "REGISTERED");
    expect(r).toEqual({ allowed: true, nextStatus: "DRAFTING" });
  });

  it("LEGAL_REVIEWER can submitForReview from DRAFTING", () => {
    const r = evaluateTransition("submitForReview", "LEGAL_REVIEWER", "DRAFTING");
    expect(r).toEqual({ allowed: true, nextStatus: "IN_LEGAL_REVIEW" });
  });

  it("LEGAL_REVIEWER pickupReview keeps status IN_LEGAL_REVIEW", () => {
    const r = evaluateTransition("pickupReview", "LEGAL_REVIEWER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: true, nextStatus: "IN_LEGAL_REVIEW" });
  });

  it("LEGAL_REVIEWER can revise from IN_LEGAL_REVIEW → DRAFTING", () => {
    const r = evaluateTransition("revise", "LEGAL_REVIEWER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: true, nextStatus: "DRAFTING" });
  });

  it("LEGAL_REVIEWER can markAwaitingSignature from IN_LEGAL_REVIEW → AWAITING_SIGNATURE", () => {
    const r = evaluateTransition(
      "markAwaitingSignature",
      "LEGAL_REVIEWER",
      "IN_LEGAL_REVIEW",
    );
    expect(r).toEqual({ allowed: true, nextStatus: "AWAITING_SIGNATURE" });
  });

  it("LEGAL_REVIEWER can submitForSigning (terminal) from AWAITING_SIGNATURE → OUT_FOR_SIGNING", () => {
    const r = evaluateTransition("submitForSigning", "LEGAL_REVIEWER", "AWAITING_SIGNATURE");
    expect(r).toEqual({ allowed: true, nextStatus: "OUT_FOR_SIGNING" });
  });

  it.each<[ContractStatus]>([
    ["REGISTERED"],
    ["DRAFTING"],
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

  it("BU_MEMBER cannot assign template", () => {
    const r = evaluateTransition("assignTemplate", "BU_MEMBER", "REGISTERED");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MEMBER cannot submitForReview (BU is read-only)", () => {
    const r = evaluateTransition("submitForReview", "BU_MEMBER", "DRAFTING");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MEMBER cannot markAwaitingSignature (BU is read-only)", () => {
    const r = evaluateTransition(
      "markAwaitingSignature",
      "BU_MEMBER",
      "IN_LEGAL_REVIEW",
    );
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MEMBER cannot submitForSigning (BU is read-only)", () => {
    const r = evaluateTransition("submitForSigning", "BU_MEMBER", "AWAITING_SIGNATURE");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("revise not allowed from DRAFTING (only from IN_LEGAL_REVIEW)", () => {
    const r = evaluateTransition("revise", "LEGAL_REVIEWER", "DRAFTING");
    expect(r).toEqual({ allowed: false, reason: "wrong-source-status" });
  });

  it("BU_MEMBER cannot revise (Legal-only)", () => {
    const r = evaluateTransition("revise", "BU_MEMBER", "IN_LEGAL_REVIEW");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("submitForReview not allowed from REGISTERED", () => {
    const r = evaluateTransition("submitForReview", "LEGAL_REVIEWER", "REGISTERED");
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
    const r = evaluateTransition("cancelContract", "BU_MEMBER", "DRAFTING");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("BU_MANAGER cannot cancel (Legal-only)", () => {
    const r = evaluateTransition("cancelContract", "BU_MANAGER", "DRAFTING");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("LEGAL_REVIEWER cannot cancel (must be LEGAL_LEAD or ADMIN)", () => {
    const r = evaluateTransition("cancelContract", "LEGAL_REVIEWER", "DRAFTING");
    expect(r).toEqual({ allowed: false, reason: "role-not-permitted" });
  });

  it("registerContract on existing contract is rejected (already has status)", () => {
    const r = evaluateTransition("registerContract", "LEGAL_REVIEWER", "DRAFTING");
    expect(r).toEqual({ allowed: false, reason: "wrong-source-status" });
  });
});

describe("nextRoundForAction", () => {
  it("first submitForReview from DRAFTING (round 0) → round 1", () => {
    expect(nextRoundForAction("submitForReview", 0, "DRAFTING")).toBe(1);
  });

  it("non-submit actions never change round (except revise)", () => {
    expect(nextRoundForAction("markAwaitingSignature", 1, "IN_LEGAL_REVIEW")).toBe(1);
    expect(nextRoundForAction("submitForSigning", 3, "AWAITING_SIGNATURE")).toBe(3);
  });

  it("revise from IN_LEGAL_REVIEW increments round", () => {
    expect(nextRoundForAction("revise", 1, "IN_LEGAL_REVIEW")).toBe(2);
    expect(nextRoundForAction("revise", 3, "IN_LEGAL_REVIEW")).toBe(4);
  });

  it("submitForReview from DRAFTING after revise does NOT double-bump", () => {
    // After revise: round was already bumped on the way to DRAFTING. The
    // resubmit re-opens the same round with a new Review row.
    expect(nextRoundForAction("submitForReview", 2, "DRAFTING")).toBe(2);
    expect(nextRoundForAction("submitForReview", 5, "DRAFTING")).toBe(5);
  });
});

describe("TRANSITION_RULES — coverage sanity", () => {
  const expectedActions: TransitionAction[] = [
    "registerContract",
    "assignTemplate",
    "submitForReview",
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

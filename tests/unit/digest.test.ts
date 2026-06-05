import { describe, it, expect } from "vitest";
import {
  computeDigestsFromSnapshot,
  type DigestSnapshot,
} from "@/lib/notifications/digest-compute";

const now = new Date("2026-05-06T03:00:00.000Z");

const users: DigestSnapshot["users"] = [
  { id: "u-bu1", email: "bu1@x", name: "BU One", role: "BU_MEMBER", department: "EPC" },
  { id: "u-bu2", email: "bu2@x", name: "BU Two", role: "BU_MEMBER", department: "Commercial" },
  { id: "u-mgr", email: "mgr@x", name: "Mgr EPC", role: "BU_MANAGER", department: "EPC" },
  { id: "u-rev", email: "rev@x", name: "Reviewer", role: "LEGAL_REVIEWER", department: "Legal" },
  { id: "u-lead", email: "lead@x", name: "Lead", role: "LEGAL_LEAD", department: "Legal" },
];

function contract(
  partial: Partial<DigestSnapshot["contracts"][number]> &
    Pick<DigestSnapshot["contracts"][number], "id" | "contractNumber" | "title" | "buOwnerId" | "buDepartment" | "status">,
): DigestSnapshot["contracts"][number] {
  return {
    counterparty: "Counterparty Co.",
    currentRound: 1,
    updatedAt: now,
    reviews: [],
    ...partial,
  };
}

describe("computeDigestsFromSnapshot — BU users", () => {
  it("excludes WITH_COUNTERPARTY contracts owned by someone else", () => {
    const snapshot: DigestSnapshot = {
      users,
      contracts: [
        contract({
          id: "c1",
          contractNumber: "CTR-2026-0001",
          title: "EPC X",
          buOwnerId: "u-bu2",
          buDepartment: "Commercial",
          status: "WITH_COUNTERPARTY",
          updatedAt: new Date(now.getTime() - 10 * 86400_000),
        }),
      ],
    };
    const out = computeDigestsFromSnapshot(now, snapshot);
    expect(out.find((d) => d.userId === "u-bu1")).toBeUndefined();
  });

  it("includes WITH_COUNTERPARTY only after >5 days idle", () => {
    const snapshot: DigestSnapshot = {
      users,
      contracts: [
        contract({
          id: "c-fresh",
          contractNumber: "CTR-2026-0002",
          title: "Fresh CP",
          buOwnerId: "u-bu1",
          buDepartment: "EPC",
          status: "WITH_COUNTERPARTY",
          updatedAt: new Date(now.getTime() - 3 * 86400_000),
        }),
        contract({
          id: "c-stale",
          contractNumber: "CTR-2026-0003",
          title: "Stale CP",
          buOwnerId: "u-bu1",
          buDepartment: "EPC",
          status: "WITH_COUNTERPARTY",
          updatedAt: new Date(now.getTime() - 8 * 86400_000),
        }),
      ],
    };
    const out = computeDigestsFromSnapshot(now, snapshot);
    const bu1 = out.find((d) => d.userId === "u-bu1");
    expect(bu1?.items).toHaveLength(1);
    expect(bu1?.items[0].contractId).toBe("c-stale");
  });

  it("BU_MANAGER sees their department's contracts", () => {
    const snapshot: DigestSnapshot = {
      users,
      contracts: [
        contract({
          id: "c-epc",
          contractNumber: "CTR-2026-0004",
          title: "EPC dept",
          buOwnerId: "u-bu1",
          buDepartment: "EPC",
          status: "AWAITING_SIGNATURE",
        }),
        contract({
          id: "c-comm",
          contractNumber: "CTR-2026-0005",
          title: "Comm dept",
          buOwnerId: "u-bu2",
          buDepartment: "Commercial",
          status: "AWAITING_SIGNATURE",
        }),
      ],
    };
    const out = computeDigestsFromSnapshot(now, snapshot);
    const mgr = out.find((d) => d.userId === "u-mgr");
    expect(mgr?.items).toHaveLength(1);
    expect(mgr?.items[0].contractId).toBe("c-epc");
  });
});

describe("computeDigestsFromSnapshot — legal users", () => {
  it("LEGAL_LEAD sees every IN_LEGAL_REVIEW contract", () => {
    const snapshot: DigestSnapshot = {
      users,
      contracts: [
        contract({
          id: "c1",
          contractNumber: "CTR-2026-0006",
          title: "Some review",
          buOwnerId: "u-bu1",
          buDepartment: "EPC",
          status: "IN_LEGAL_REVIEW",
          reviews: [
            { round: 1, slaStatus: "ON_TRACK", assignedToId: null, returnedAt: null },
          ],
        }),
        contract({
          id: "c2",
          contractNumber: "CTR-2026-0007",
          title: "Another review",
          buOwnerId: "u-bu2",
          buDepartment: "Commercial",
          status: "IN_LEGAL_REVIEW",
          reviews: [
            { round: 1, slaStatus: "BREACHED", assignedToId: "u-rev", returnedAt: null },
          ],
        }),
      ],
    };
    const out = computeDigestsFromSnapshot(now, snapshot);
    const lead = out.find((d) => d.userId === "u-lead");
    expect(lead?.items).toHaveLength(2);
  });

  it("LEGAL_REVIEWER sees their own assignments + WARNING/BREACHED across the org", () => {
    const snapshot: DigestSnapshot = {
      users,
      contracts: [
        contract({
          id: "c-mine",
          contractNumber: "CTR-2026-0008",
          title: "Mine",
          buOwnerId: "u-bu1",
          buDepartment: "EPC",
          status: "IN_LEGAL_REVIEW",
          reviews: [
            { round: 1, slaStatus: "ON_TRACK", assignedToId: "u-rev", returnedAt: null },
          ],
        }),
        contract({
          id: "c-someone-else-on-track",
          contractNumber: "CTR-2026-0009",
          title: "Other ON_TRACK",
          buOwnerId: "u-bu1",
          buDepartment: "EPC",
          status: "IN_LEGAL_REVIEW",
          reviews: [
            { round: 1, slaStatus: "ON_TRACK", assignedToId: null, returnedAt: null },
          ],
        }),
        contract({
          id: "c-org-breach",
          contractNumber: "CTR-2026-0010",
          title: "Org breach",
          buOwnerId: "u-bu2",
          buDepartment: "Commercial",
          status: "IN_LEGAL_REVIEW",
          reviews: [
            { round: 1, slaStatus: "BREACHED", assignedToId: "someone", returnedAt: null },
          ],
        }),
      ],
    };
    const out = computeDigestsFromSnapshot(now, snapshot);
    const rev = out.find((d) => d.userId === "u-rev");
    expect(rev?.items.map((i) => i.contractId).sort()).toEqual(
      ["c-mine", "c-org-breach"].sort(),
    );
  });
});

describe("computeDigestsFromSnapshot — empty digests are skipped", () => {
  it("does not emit a digest for users with no items", () => {
    const snapshot: DigestSnapshot = { users, contracts: [] };
    expect(computeDigestsFromSnapshot(now, snapshot)).toHaveLength(0);
  });
});

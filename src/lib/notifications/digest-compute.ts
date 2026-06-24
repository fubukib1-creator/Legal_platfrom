import type {
  Contract,
  ContractStatus,
  Review,
  Role,
  SLAStatus,
  User,
} from "@prisma/client";

const WITH_CP_CHASE_DAYS = 5;

export type DigestItem = {
  contractId: string;
  contractNumber: string;
  title: string;
  counterparty: string;
  buDepartment: string;
  status: ContractStatus;
  reason: string;
  slaStatus?: SLAStatus;
};

export type DigestRecipient = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  items: DigestItem[];
};

export type DigestSnapshot = {
  users: Pick<User, "id" | "email" | "name" | "role" | "department">[];
  contracts: Array<
    Pick<
      Contract,
      | "id"
      | "contractNumber"
      | "title"
      | "counterparty"
      | "buDepartment"
      | "buOwnerId"
      | "status"
      | "currentRound"
      | "updatedAt"
    > & { reviews: Pick<Review, "round" | "slaStatus" | "assignedToId" | "returnedAt">[] }
  >;
};

// Pure: given a snapshot of users + contracts, returns the per-user digests.
// No DB calls — easy to seed and test.
export function computeDigestsFromSnapshot(
  now: Date,
  snapshot: DigestSnapshot,
): DigestRecipient[] {
  const result: DigestRecipient[] = [];
  const msPerDay = 24 * 60 * 60 * 1000;

  for (const user of snapshot.users) {
    const items: DigestItem[] = [];

    if (user.role === "BU_MEMBER" || user.role === "BU_MANAGER") {
      const owned = snapshot.contracts.filter((c) =>
        user.role === "BU_MANAGER"
          ? c.buDepartment === user.department
          : c.buOwnerId === user.id,
      );
      for (const c of owned) {
        if (c.status === "WITH_COUNTERPARTY") {
          const ageDays = Math.floor((now.getTime() - c.updatedAt.getTime()) / msPerDay);
          if (ageDays > WITH_CP_CHASE_DAYS) {
            items.push({
              contractId: c.id,
              contractNumber: c.contractNumber,
              title: c.title,
              counterparty: c.counterparty,
              buDepartment: c.buDepartment,
              status: c.status,
              reason: `Sent to counterparty ${ageDays} days ago — chase up`,
            });
          }
        } else if (c.status === "AWAITING_SIGNATURE") {
          items.push({
            contractId: c.id,
            contractNumber: c.contractNumber,
            title: c.title,
            counterparty: c.counterparty,
            buDepartment: c.buDepartment,
            status: c.status,
            reason: "Upload the signed PDF",
          });
        }
      }
    } else if (user.role === "LEGAL_REVIEWER" || user.role === "LEGAL_LEAD") {
      const inQueue = snapshot.contracts.filter((c) => c.status === "IN_LEGAL_REVIEW");
      for (const c of inQueue) {
        const review = c.reviews.find((r) => r.round === c.currentRound && !r.returnedAt);
        const sla = review?.slaStatus ?? "ON_TRACK";
        const isOwn = review?.assignedToId === user.id;
        if (
          user.role === "LEGAL_LEAD" ||
          isOwn ||
          sla === "WARNING" ||
          sla === "BREACHED"
        ) {
          items.push({
            contractId: c.id,
            contractNumber: c.contractNumber,
            title: c.title,
            counterparty: c.counterparty,
            buDepartment: c.buDepartment,
            status: c.status,
            reason: isOwn ? "Assigned to you" : `In queue (${labelFor(sla)})`,
            slaStatus: sla,
          });
        }
      }
    }

    if (items.length > 0) {
      result.push({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        items,
      });
    }
  }

  return result;
}

function labelFor(s: SLAStatus): string {
  switch (s) {
    case "ON_TRACK":
      return "on track";
    case "WARNING":
      return "≤2 BD remaining";
    case "BREACHED":
      return "breached";
    case "COMPLETED":
      return "completed";
    case "COMPLETED_LATE":
      return "completed late";
  }
}

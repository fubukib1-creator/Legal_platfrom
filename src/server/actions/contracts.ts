"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContractType, EventType, Prisma, Role, VersionStage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  evaluateTransition,
  nextRoundForAction,
  type TransitionAction,
} from "@/lib/state-machine";
import {
  PermissionDeniedError,
  assertPermission,
  canViewContract,
  type Permission,
  type SessionUser,
} from "@/lib/permissions";
import {
  formatContractNumber,
  formatNonRunningContractNumber,
  nextSequenceFromAll,
  randomHexSuffix,
} from "@/lib/contract-number";
import {
  contractTypeCode,
  contractTypeUsesSeparateSequence,
} from "@/lib/contract-types";
import { teamCodeFor } from "@/lib/departments";
import {
  addBusinessDays,
  getHolidays,
  slaDeadlineFor,
} from "@/lib/business-days";
import {
  ALLOWED_DOC_MIMES,
  PDF_ONLY_MIMES,
  uploadVersionFile,
  validateUpload,
} from "@/server/actions/upload-helper";

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

const SLA_DAYS = Number(process.env.SLA_BUSINESS_DAYS ?? 7);

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    throw new PermissionDeniedError("scope", "Not authenticated");
  }
  return {
    id: session.user.id,
    role: session.user.role,
    department: session.user.department,
  };
}

type ContractCore = {
  id: string;
  status: import("@prisma/client").ContractStatus;
  currentRound: number;
  buOwnerId: string;
  buDepartment: string;
};

async function loadContractForAction(
  user: SessionUser,
  contractId: string,
): Promise<ContractCore> {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      status: true,
      currentRound: true,
      buOwnerId: true,
      buDepartment: true,
    },
  });
  if (!c) throw new PermissionDeniedError("scope", "Contract not found");
  if (!canViewContract(user, c)) {
    throw new PermissionDeniedError("scope", "Contract not in scope");
  }
  return c;
}

function fail<T = void>(error: string, code?: string): ActionResult<T> {
  return { success: false, error, code };
}

function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

function transitionGuard(
  action: TransitionAction,
  role: Role,
  status: import("@prisma/client").ContractStatus | null,
): { nextStatus: import("@prisma/client").ContractStatus } | { error: string } {
  const r = evaluateTransition(action, role, status);
  if (!r.allowed) {
    if (r.reason === "role-not-permitted")
      return { error: "Your role cannot perform this action" };
    if (r.reason === "wrong-source-status")
      return { error: "This action is not allowed from the current status" };
    return { error: "Unknown action" };
  }
  return { nextStatus: r.nextStatus };
}

function permissionFor(action: TransitionAction): Permission {
  const map: Record<TransitionAction, Permission> = {
    registerContract: "contract:create",
    assignTemplate: "contract:assignTemplate",
    submitForReview: "contract:submitForReview",
    pickupReview: "contract:pickupReview",
    revise: "contract:revise",
    markAwaitingSignature: "contract:markAwaitingSignature",
    submitForSigning: "contract:submitForSigning",
    updateTracking: "contract:updateTracking",
    cancelContract: "contract:cancel",
  };
  return map[action];
}

function revalidateContract(id: string) {
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  revalidatePath("/legal-performance");
}

async function recordEvent(
  tx: Prisma.TransactionClient,
  params: {
    contractId: string;
    actorId: string;
    eventType: EventType;
    fromStatus?: import("@prisma/client").ContractStatus | null;
    toStatus?: import("@prisma/client").ContractStatus | null;
    round?: number;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.event.create({
    data: {
      contractId: params.contractId,
      actorId: params.actorId,
      eventType: params.eventType,
      fromStatus: params.fromStatus ?? null,
      toStatus: params.toStatus ?? null,
      round: params.round ?? null,
      metadata: params.metadata ?? undefined,
    },
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// 1. registerContract
// ───────────────────────────────────────────────────────────────────────────────

const optionalIsoDate = z
  .union([z.string().trim(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

const registerSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  type: z.enum([
    "MOU",
    "NDA",
    "PROCUREMENT",
    "OTHERS",
    "INQUIRY",
    "POA",
    "OFFICIAL_LETTER",
  ]),
  complexity: z
    .union([z.literal("LOW"), z.literal("MEDIUM"), z.literal("HIGH"), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v === "LOW" || v === "MEDIUM" || v === "HIGH" ? v : null)),
  counterparty: z.string().trim().min(1, "Counterparty is required").max(255),
  estimatedValue: z.number().nonnegative().optional().nullable(),
  currency: z.string().trim().length(3).default("THB").optional(),
  buDepartment: z.string().trim().min(1, "Select a BU team").max(64),
  startDate: optionalIsoDate,
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function registerContract(
  input: z.input<typeof registerSchema>,
): Promise<ActionResult<{ id: string; contractNumber: string }>> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:create");

    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join("; "), "validation");
    }
    const data = parsed.data;

    const guard = transitionGuard("registerContract", user.role, null);
    if ("error" in guard) return fail(guard.error, "transition");

    // Resolve the owning team to a concrete BU user for the buOwnerId FK.
    // Prefer the team's BU_MANAGER, then any active BU member. If the team
    // has no BU users at all, refuse — the contract would have nobody to
    // be visible to on the BU side.
    const owner = await prisma.user.findFirst({
      where: {
        active: true,
        department: data.buDepartment,
        role: { in: ["BU_MEMBER", "BU_MANAGER"] },
      },
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!owner) {
      return fail(
        `Team "${data.buDepartment}" has no active BU members yet — add one in /admin/users before assigning a contract.`,
        "validation",
      );
    }

    const startDate = data.startDate ?? new Date();

    const teamCode = teamCodeFor(data.buDepartment);
    const typeCode = contractTypeCode(data.type as ContractType);

    const created = await prisma.$transaction(async (tx) => {
      const year = startDate.getFullYear();
      // INQUIRY / POA / OFFICIAL_LETTER skip the running counter entirely —
      // they get an `INP_TTXXYYYY-HHHHHH` identifier with a random hex suffix.
      // Everything else (MOU/NDA/PROCUREMENT/OTHERS) shares one global
      // year-wide counter.
      const usesNonRunning = contractTypeUsesSeparateSequence(
        data.type as ContractType,
      );
      let contractNumber: string;
      if (usesNonRunning) {
        // Retry on the astronomically unlikely event of a 6-hex-char collision
        // within the same year. We bail after a handful of attempts to avoid
        // a runaway loop if the table is somehow saturated.
        let attempt = 0;
        const MAX_ATTEMPTS = 5;
        for (;;) {
          const candidate = formatNonRunningContractNumber({
            teamCode,
            typeCode,
            year,
            randomSuffix: randomHexSuffix(6),
          });
          const clash = await tx.contract.findUnique({
            where: { contractNumber: candidate },
            select: { id: true },
          });
          if (!clash) {
            contractNumber = candidate;
            break;
          }
          if (++attempt >= MAX_ATTEMPTS) {
            throw new Error("Could not allocate a unique contract number");
          }
        }
      } else {
        const yearRows = await tx.contract.findMany({
          where: { contractNumber: { contains: `${year}` } },
          select: { contractNumber: true },
        });
        const sequence = nextSequenceFromAll(
          yearRows.map((r) => r.contractNumber),
          year,
        );
        contractNumber = formatContractNumber({
          teamCode,
          typeCode,
          year,
          sequence,
        });
      }

      const contract = await tx.contract.create({
        data: {
          contractNumber,
          title: data.title,
          type: data.type as ContractType,
          complexity: data.complexity,
          counterparty: data.counterparty,
          estimatedValue: data.estimatedValue ?? null,
          currency: data.currency ?? "THB",
          buOwnerId: owner.id,
          buDepartment: data.buDepartment,
          status: guard.nextStatus,
          currentRound: 0,
          startDate,
          notes: data.notes ?? null,
        },
      });

      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: "CONTRACT_REGISTERED",
        toStatus: contract.status,
        metadata: { startDate: startDate.toISOString() },
      });

      return contract;
    });

    revalidateContract(created.id);
    return ok({ id: created.id, contractNumber: created.contractNumber });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Generic file-uploading transition (template / draft / reviewed / cp-return /
// final / signed)
// ───────────────────────────────────────────────────────────────────────────────

type FileTransitionInput = {
  contractId: string;
  formData: FormData;
};

// Pull a YYYY-MM-DD or ISO string from a "stageDate" form field and return it
// as a Date — or now() if it's missing/invalid. Used by every transition so
// Legal can backdate a stage change.
function parseStageDate(fd: FormData, fallback: Date = new Date()): Date {
  const raw = fd.get("stageDate");
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

async function fileTransition(opts: {
  action: TransitionAction;
  stage: VersionStage;
  pdfOnly?: boolean;
  eventType: EventType;
  buildContractUpdate?: (
    next: import("@prisma/client").ContractStatus,
    contract: ContractCore,
    stageDate: Date,
  ) => Prisma.ContractUpdateInput;
  notesField?: string;
  input: FileTransitionInput;
  metadataExtra?: Prisma.InputJsonObject;
  beforeTransaction?: (
    user: SessionUser,
    contract: ContractCore,
  ) => Promise<ActionResult | null>;
  afterCommitMessage?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user.role, permissionFor(opts.action));

    const contract = await loadContractForAction(user, opts.input.contractId);

    const guard = transitionGuard(opts.action, user.role, contract.status);
    if ("error" in guard) return fail(guard.error, "transition");

    if (opts.beforeTransaction) {
      const pre = await opts.beforeTransaction(user, contract);
      if (pre && !pre.success) return pre;
    }

    const file = opts.input.formData.get("file");
    const v = validateUpload(file, {
      allowedMimes: opts.pdfOnly ? PDF_ONLY_MIMES : ALLOWED_DOC_MIMES,
      optional: true,
    });
    if (!v.ok) {
      const e = v.error;
      if (e.code === "too-large")
        return fail(
          `File is too large (${e.actualBytes} bytes; max ${e.maxBytes})`,
          "validation",
        );
      if (e.code === "wrong-mime")
        return fail(
          `File type ${e.actual} not allowed. Allowed: ${e.allowed.join(", ")}`,
          "validation",
        );
      // missing-file is unreachable here because we pass `optional: true`,
      // but the exhaustive branch keeps the union narrowed for TypeScript.
      return fail("A file is required", "validation");
    }

    const round = nextRoundForAction(opts.action, contract.currentRound, contract.status);

    // The user can advance the stage without attaching a file. Only when one
    // is provided do we upload to S3 and record a Version row.
    const uploaded = v.file
      ? await uploadVersionFile({
          file: v.file,
          contractId: contract.id,
          round,
          stage: opts.stage,
        })
      : null;

    const notes = opts.notesField
      ? (opts.input.formData.get(opts.notesField) as string | null)?.trim() || null
      : null;

    // Legal can backdate a stage change via the dialog's date picker.
    const stageDate = parseStageDate(opts.input.formData);

    await prisma.$transaction(async (tx) => {
      if (uploaded) {
        await tx.version.create({
          data: {
            contractId: contract.id,
            versionLabel: uploaded.versionLabel,
            round,
            stage: uploaded.stage,
            fileName: uploaded.fileName,
            storageKey: uploaded.storageKey,
            fileSize: uploaded.fileSize,
            mimeType: uploaded.mimeType,
            uploadedById: user.id,
          },
        });
      }

      const baseUpdate: Prisma.ContractUpdateInput = {
        status: guard.nextStatus,
        currentRound: round,
      };
      const extraUpdate = opts.buildContractUpdate
        ? opts.buildContractUpdate(guard.nextStatus, contract, stageDate)
        : {};

      await tx.contract.update({
        where: { id: contract.id },
        data: { ...baseUpdate, ...extraUpdate },
      });

      // Per-action review-side bookkeeping. submittedAt / returnedAt use the
      // Legal-supplied stageDate so SLAs are computed from the real review
      // dates when entries are backfilled.
      if (opts.action === "submitForReview") {
        const holidays = await getHolidays();
        const slaDeadline = slaDeadlineFor(stageDate, SLA_DAYS, holidays);
        await tx.review.create({
          data: {
            contractId: contract.id,
            round,
            submittedAt: stageDate,
            slaDeadline,
            slaStatus: "ON_TRACK",
          },
        });
      }

      if (opts.action === "markAwaitingSignature") {
        const review = await tx.review.findFirst({
          where: { contractId: contract.id, round, returnedAt: null },
          orderBy: { submittedAt: "desc" },
        });
        if (review) {
          await tx.review.update({
            where: { id: review.id },
            data: {
              returnedAt: stageDate,
              legalNotes: notes,
              slaStatus: stageDate <= review.slaDeadline ? "COMPLETED" : "COMPLETED_LATE",
            },
          });
        }
      }

      const eventMetadata: Prisma.InputJsonObject = {
        ...(uploaded
          ? { fileName: uploaded.fileName, versionLabel: uploaded.versionLabel }
          : {}),
        ...(notes ? { notes } : {}),
        ...(opts.metadataExtra ?? {}),
        ...(uploaded ? {} : { stageOnly: true }),
        stageDate: stageDate.toISOString(),
      };

      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: opts.eventType,
        fromStatus: contract.status,
        toStatus: guard.nextStatus,
        round,
        metadata: eventMetadata,
      });
    });

    revalidateContract(contract.id);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}


// ───────────────────────────────────────────────────────────────────────────────
// 2. assignTemplate
// ───────────────────────────────────────────────────────────────────────────────

export async function assignTemplate(input: FileTransitionInput): Promise<ActionResult> {
  return fileTransition({
    action: "assignTemplate",
    stage: "TEMPLATE",
    eventType: "TEMPLATE_ASSIGNED",
    input,
    notesField: "templateName",
    buildContractUpdate: (_next, _c, stageDate) => ({ templateDate: stageDate }),
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// 3. submitForReview
// ───────────────────────────────────────────────────────────────────────────────

export async function submitForReview(input: FileTransitionInput): Promise<ActionResult> {
  return fileTransition({
    action: "submitForReview",
    stage: "BU_DRAFT",
    eventType: "DRAFT_SUBMITTED",
    input,
    notesField: "submitNotes",
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// 4. pickupReview (idempotent — sets pickedUpAt only if null)
// ───────────────────────────────────────────────────────────────────────────────

export async function pickupReview(
  input: { contractId: string },
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:pickupReview");

    const contract = await loadContractForAction(user, input.contractId);
    const guard = transitionGuard("pickupReview", user.role, contract.status);
    if ("error" in guard) return fail(guard.error, "transition");

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.review.updateMany({
        where: {
          contractId: contract.id,
          round: contract.currentRound,
          pickedUpAt: null,
          returnedAt: null,
        },
        data: { pickedUpAt: now, assignedToId: user.id },
      });
      if (updated.count > 0) {
        await recordEvent(tx, {
          contractId: contract.id,
          actorId: user.id,
          eventType: "REVIEW_PICKED_UP",
          fromStatus: contract.status,
          toStatus: contract.status,
          round: contract.currentRound,
        });
      }
    });

    revalidateContract(contract.id);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// Auto-pickup: invoked from /contracts/[id] when a legal user opens a contract
// in IN_LEGAL_REVIEW whose latest Review hasn't been picked up yet. Idempotent:
// the WHERE clause limits the update to reviews still un-picked, so concurrent
// page loads from multiple legal users only stamp once.
export async function autoPickupOnView(
  contractId: string,
): Promise<ActionResult<{ pickedUp: boolean }>> {
  try {
    const user = await requireUser();
    if (
      user.role !== "LEGAL_REVIEWER" &&
      user.role !== "LEGAL_LEAD" &&
      user.role !== "ADMIN"
    ) {
      return ok({ pickedUp: false });
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, currentRound: true },
    });
    if (!contract || contract.status !== "IN_LEGAL_REVIEW") {
      return ok({ pickedUp: false });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.review.updateMany({
        where: {
          contractId: contract.id,
          round: contract.currentRound,
          pickedUpAt: null,
          returnedAt: null,
        },
        data: { pickedUpAt: now, assignedToId: user.id },
      });
      if (updated.count > 0) {
        await recordEvent(tx, {
          contractId: contract.id,
          actorId: user.id,
          eventType: "REVIEW_PICKED_UP",
          fromStatus: contract.status,
          toStatus: contract.status,
          round: contract.currentRound,
        });
      }
      return updated.count;
    });

    return ok({ pickedUp: result > 0 });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 5b. reviseDraft — IN_LEGAL_REVIEW → DRAFTING. Legal asks the BU for another
//     draft iteration: the current Review is closed (returnedAt stamped, like
//     a normal review return), the contract goes back to DRAFTING, and the
//     round counter bumps so the new draft cycle has its own number.
// ───────────────────────────────────────────────────────────────────────────────

export async function reviseDraft(
  input: { contractId: string; formData: FormData },
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:revise");

    const contract = await loadContractForAction(user, input.contractId);

    // Same assignee guard as returnReview — if a reviewer claimed this review,
    // only they (or a lead/admin) may pivot it back to drafting.
    if (user.role !== "LEGAL_LEAD" && user.role !== "ADMIN") {
      const claim = await prisma.review.findFirst({
        where: {
          contractId: contract.id,
          round: contract.currentRound,
          returnedAt: null,
        },
        orderBy: { submittedAt: "desc" },
        select: { assignedToId: true },
      });
      if (claim?.assignedToId && claim.assignedToId !== user.id) {
        return fail("Only the assigned reviewer or a Legal Lead can revise this contract", "scope");
      }
    }

    const guard = transitionGuard("revise", user.role, contract.status);
    if ("error" in guard) return fail(guard.error, "transition");

    const stageDate = parseStageDate(input.formData);
    const notes =
      (input.formData.get("legalNotes") as string | null)?.trim() || null;
    const oldRound = contract.currentRound;
    const newRound = nextRoundForAction("revise", oldRound, contract.status);

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: guard.nextStatus, currentRound: newRound },
      });

      // Close the active review with the same SLA semantics as returnReview:
      // on-time vs late based on stageDate against the deadline.
      const openReview = await tx.review.findFirst({
        where: {
          contractId: contract.id,
          round: oldRound,
          returnedAt: null,
        },
        orderBy: { submittedAt: "desc" },
      });
      if (openReview) {
        await tx.review.update({
          where: { id: openReview.id },
          data: {
            returnedAt: stageDate,
            legalNotes: notes,
            slaStatus:
              stageDate <= openReview.slaDeadline ? "COMPLETED" : "COMPLETED_LATE",
          },
        });
      }

      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: "REVISE_REQUESTED",
        fromStatus: contract.status,
        toStatus: guard.nextStatus,
        round: newRound,
        metadata: {
          stageOnly: true,
          stageDate: stageDate.toISOString(),
          previousRound: oldRound,
          ...(notes ? { notes } : {}),
        },
      });
    });

    revalidateContract(contract.id);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 6. markAwaitingSignature — IN_LEGAL_REVIEW → AWAITING_SIGNATURE in one step.
//     Closes the open Review row (so SLA stats land in the right bucket) and
//     stamps finalizedDate. This replaces the old returnReview+markFinal pair.
// ───────────────────────────────────────────────────────────────────────────────

export async function markAwaitingSignature(
  input: FileTransitionInput,
): Promise<ActionResult> {
  return fileTransition({
    action: "markAwaitingSignature",
    stage: "FINAL",
    eventType: "MARKED_AWAITING_SIGNATURE",
    input,
    notesField: "legalNotes",
    buildContractUpdate: (_next, _c, stageDate) => ({ finalizedDate: stageDate }),
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// 7. submitForSigning — AWAITING_SIGNATURE → OUT_FOR_SIGNING. Terminal action:
//    legal marks the contract as signed and uploaded. Stamps signedDate so
//    monthly "signed" counters work. Event = SIGNED_UPLOADED (reusing the
//    existing enum value because it best matches the new semantics).
// ───────────────────────────────────────────────────────────────────────────────

export async function submitForSigning(input: FileTransitionInput): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:submitForSigning");

    const contract = await loadContractForAction(user, input.contractId);

    const guard = transitionGuard("submitForSigning", user.role, contract.status);
    if ("error" in guard) return fail(guard.error, "transition");

    const stageDate = parseStageDate(input.formData);

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: guard.nextStatus, signedDate: stageDate },
      });
      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: "SIGNED_UPLOADED",
        fromStatus: contract.status,
        toStatus: guard.nextStatus,
        round: contract.currentRound,
        metadata: { stageOnly: true, stageDate: stageDate.toISOString() },
      });
    });

    revalidateContract(contract.id);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 10. updateTracking — edit lifecycle tracking fields without changing status.
//     Used by the Edit button on the lifecycle card; allowed from any
//     non-cancelled status so the team can correct values at any point.
// ───────────────────────────────────────────────────────────────────────────────

const optionalDate = z
  .union([z.string().trim(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

const optionalDecimalString = z
  .union([z.string().trim(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return n.toFixed(2);
  });

const updateTrackingSchema = z.object({
  contractId: z.string(),
  paymentSide: z
    .union([z.literal("PAYER"), z.literal("RECEIVER"), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v === "PAYER" || v === "RECEIVER" ? v : null)),
  effectiveDate: optionalDate,
  expiryDate: optionalDate,
  renewalDecisionDeadline: optionalDate,
  contractValue: optionalDecimalString,
  revenueStamp: optionalDecimalString,
  depositAmount: optionalDecimalString,
  depositReturnDate: optionalDate,
  monitoringNotes: z
    .union([z.string().trim().max(2000), z.null(), z.undefined()])
    .transform((v) => (v === undefined || v === "" ? null : v)),
});

export async function updateTracking(
  input: z.input<typeof updateTrackingSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:updateTracking");

    const parsed = updateTrackingSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join("; "), "validation");
    }
    const data = parsed.data;

    const contract = await loadContractForAction(user, data.contractId);

    const guard = transitionGuard("updateTracking", user.role, contract.status);
    if ("error" in guard) return fail(guard.error, "transition");

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contract.id },
        data: {
          paymentSide: data.paymentSide,
          effectiveDate: data.effectiveDate,
          expiryDate: data.expiryDate,
          renewalDecisionDeadline: data.renewalDecisionDeadline,
          contractValue: data.contractValue,
          revenueStamp: data.revenueStamp,
          depositAmount: data.depositAmount,
          depositReturnDate: data.depositReturnDate,
          monitoringNotes: data.monitoringNotes,
        },
      });
      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: "TRACKING_UPDATED",
        fromStatus: contract.status,
        toStatus: contract.status,
        round: contract.currentRound,
        metadata: {
          paymentSide: data.paymentSide,
          effectiveDate: data.effectiveDate?.toISOString() ?? null,
          expiryDate: data.expiryDate?.toISOString() ?? null,
          renewalDecisionDeadline: data.renewalDecisionDeadline?.toISOString() ?? null,
          contractValue: data.contractValue,
          revenueStamp: data.revenueStamp,
          depositAmount: data.depositAmount,
          depositReturnDate: data.depositReturnDate?.toISOString() ?? null,
        },
      });
    });

    revalidateContract(contract.id);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 11. cancelContract
// ───────────────────────────────────────────────────────────────────────────────

const cancelSchema = z.object({
  contractId: z.string(),
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

export async function cancelContract(
  input: z.input<typeof cancelSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:cancel");

    const parsed = cancelSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join("; "), "validation");
    }

    const contract = await loadContractForAction(user, parsed.data.contractId);

    const guard = transitionGuard("cancelContract", user.role, contract.status);
    if ("error" in guard) return fail(guard.error, "transition");

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: guard.nextStatus, cancelReason: parsed.data.reason },
      });
      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: "CANCELLED",
        fromStatus: contract.status,
        toStatus: guard.nextStatus,
        round: contract.currentRound,
        metadata: { reason: parsed.data.reason },
      });
    });

    revalidateContract(contract.id);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 12. extendSLA — push the open review's slaDeadline by N business days. The
//     extension stacks on the existing deadline (re-extending stacks again).
//     Only available while a review is open (no returnedAt). Records the
//     extension on the Review row + an SLA_EXTENDED event.
// ───────────────────────────────────────────────────────────────────────────────

const extendSLASchema = z.object({
  contractId: z.string(),
  days: z.coerce.number().int().positive().max(60),
  reason: z
    .union([z.string().trim().max(500), z.null(), z.undefined()])
    .transform((v) => (v === undefined || v === null || v === "" ? null : v)),
});

export async function extendSLA(
  input: z.input<typeof extendSLASchema>,
): Promise<ActionResult<{ newDeadline: string }>> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:extendSLA");

    const parsed = extendSLASchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join("; "), "validation");
    }
    const data = parsed.data;

    const contract = await loadContractForAction(user, data.contractId);

    const review = await prisma.review.findFirst({
      where: {
        contractId: contract.id,
        round: contract.currentRound,
        returnedAt: null,
      },
      orderBy: { submittedAt: "desc" },
    });
    if (!review) {
      return fail("No open review to extend on this contract", "validation");
    }

    const holidays = await getHolidays();
    const newDeadline = addBusinessDays(review.slaDeadline, data.days, holidays);

    await prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: review.id },
        data: {
          slaDeadline: newDeadline,
          slaExtensionDays: review.slaExtensionDays + data.days,
          slaStatus: "ON_TRACK",
        },
      });
      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: "SLA_EXTENDED",
        fromStatus: contract.status,
        toStatus: contract.status,
        round: contract.currentRound,
        metadata: {
          extendedDays: data.days,
          totalExtensionDays: review.slaExtensionDays + data.days,
          previousDeadline: review.slaDeadline.toISOString(),
          newDeadline: newDeadline.toISOString(),
          ...(data.reason ? { reason: data.reason } : {}),
        },
      });
    });

    revalidateContract(contract.id);
    return ok({ newDeadline: newDeadline.toISOString() });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 13. editContract — Legal corrects contract metadata in-place (title, type,
//     complexity, BU reassignment, financial fields, notes). Records a single
//     CONTRACT_EDITED event with a diff of what changed; does not touch
//     status, round, dates, or attached versions.
// ───────────────────────────────────────────────────────────────────────────────

const editContractSchema = z.object({
  contractId: z.string(),
  title: z.string().trim().min(1, "Title is required").max(255).optional(),
  type: z
    .enum([
      "MOU",
      "NDA",
      "PROCUREMENT",
      "OTHERS",
      "INQUIRY",
      "POA",
      "OFFICIAL_LETTER",
    ])
    .optional(),
  complexity: z
    .union([
      z.literal("LOW"),
      z.literal("MEDIUM"),
      z.literal("HIGH"),
      z.literal(""),
      z.null(),
      z.undefined(),
    ])
    .transform((v) =>
      v === "LOW" || v === "MEDIUM" || v === "HIGH" ? v : null,
    )
    .optional(),
  counterparty: z.string().trim().min(1).max(255).optional(),
  estimatedValue: z
    .union([z.number(), z.string().trim(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      return n.toFixed(2);
    })
    .optional(),
  currency: z.string().trim().length(3).optional(),
  buDepartment: z.string().trim().min(1).max(64).optional(),
  notes: z
    .union([z.string().trim().max(2000), z.null(), z.undefined()])
    .transform((v) => (v === undefined || v === "" ? null : v))
    .optional(),
});

export async function editContract(
  input: z.input<typeof editContractSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:edit");

    const parsed = editContractSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join("; "), "validation");
    }
    const data = parsed.data;

    const contract = await prisma.contract.findUnique({
      where: { id: data.contractId },
      select: {
        id: true,
        status: true,
        buOwnerId: true,
        buDepartment: true,
        title: true,
        type: true,
        complexity: true,
        counterparty: true,
        estimatedValue: true,
        currency: true,
        notes: true,
      },
    });
    if (!contract) return fail("Contract not found", "scope");
    if (!canViewContract(user, contract)) {
      return fail("Contract not in scope", "scope");
    }

    // Reassigning to a different BU department needs a new buOwner to satisfy
    // the FK — pick the team's manager, falling back to any active member.
    let buOwnerId = contract.buOwnerId;
    if (data.buDepartment && data.buDepartment !== contract.buDepartment) {
      const newOwner = await prisma.user.findFirst({
        where: {
          active: true,
          department: data.buDepartment,
          role: { in: ["BU_MEMBER", "BU_MANAGER"] },
        },
        orderBy: [{ role: "desc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (!newOwner) {
        return fail(
          `Team "${data.buDepartment}" has no active BU members yet.`,
          "validation",
        );
      }
      buOwnerId = newOwner.id;
    }

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    function track(key: string, from: unknown, to: unknown): void {
      if (to === undefined) return;
      if (from === to) return;
      diff[key] = { from, to };
    }
    track("title", contract.title, data.title);
    track("type", contract.type, data.type);
    track("complexity", contract.complexity, data.complexity);
    track("counterparty", contract.counterparty, data.counterparty);
    track("currency", contract.currency, data.currency);
    track("notes", contract.notes, data.notes);
    if (data.estimatedValue !== undefined) {
      const prevStr = contract.estimatedValue?.toString() ?? null;
      if (prevStr !== data.estimatedValue) {
        diff.estimatedValue = { from: prevStr, to: data.estimatedValue };
      }
    }
    if (data.buDepartment && data.buDepartment !== contract.buDepartment) {
      diff.buDepartment = { from: contract.buDepartment, to: data.buDepartment };
    }

    if (Object.keys(diff).length === 0) {
      return ok(undefined);
    }

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contract.id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.type !== undefined
            ? { type: data.type as ContractType }
            : {}),
          ...(data.complexity !== undefined
            ? { complexity: data.complexity }
            : {}),
          ...(data.counterparty !== undefined
            ? { counterparty: data.counterparty }
            : {}),
          ...(data.estimatedValue !== undefined
            ? { estimatedValue: data.estimatedValue }
            : {}),
          ...(data.currency !== undefined ? { currency: data.currency } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.buDepartment ? { buDepartment: data.buDepartment } : {}),
          buOwnerId,
        },
      });
      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: "CONTRACT_EDITED",
        fromStatus: contract.status,
        toStatus: contract.status,
        metadata: { changes: diff as Prisma.InputJsonObject },
      });
    });

    revalidateContract(contract.id);
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 14. deleteContract — hard delete. Cascades to Review/Event/Version rows via
//     the schema's onDelete: Cascade. Blob storage is NOT cleaned up here —
//     orphaned blobs can be reaped in a follow-up sweep.
// ───────────────────────────────────────────────────────────────────────────────

export async function deleteContract(
  input: { contractId: string },
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:delete");

    const contract = await prisma.contract.findUnique({
      where: { id: input.contractId },
      select: { id: true, buDepartment: true, buOwnerId: true },
    });
    if (!contract) return fail("Contract not found", "scope");
    if (!canViewContract(user, contract)) {
      return fail("Contract not in scope", "scope");
    }

    await prisma.contract.delete({ where: { id: contract.id } });
    revalidatePath("/contracts");
    revalidatePath("/legal-performance");
    return ok(undefined);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// 15. undoLastStage — revert the most recent status transition. Looks up the
//     latest Event whose toStatus changed the contract, sets the contract
//     back to its fromStatus, and records an STAGE_UNDONE event linking to
//     the reverted event for the timeline. Side effects from the reverted
//     event (review row close, signedDate, etc.) are reset best-effort.
// ───────────────────────────────────────────────────────────────────────────────

export async function undoLastStage(
  input: { contractId: string },
): Promise<ActionResult<{ revertedTo: string }>> {
  try {
    const user = await requireUser();
    assertPermission(user.role, "contract:undoStage");

    const contract = await loadContractForAction(user, input.contractId);

    // The most recent event that actually moved the status. Skip events that
    // didn't change status (TRACKING_UPDATED, SLA_EXTENDED, CONTRACT_EDITED).
    const lastTransition = await prisma.event.findFirst({
      where: {
        contractId: contract.id,
        toStatus: contract.status,
        fromStatus: { not: contract.status },
        eventType: { not: "STAGE_UNDONE" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!lastTransition || !lastTransition.fromStatus) {
      return fail("Nothing to undo — no prior stage transition recorded.", "validation");
    }

    const previousStatus = lastTransition.fromStatus;
    const previousRound = lastTransition.round ?? contract.currentRound;

    await prisma.$transaction(async (tx) => {
      // Roll back side-effects of the reverted event. Best-effort — we wipe
      // the marker fields the original action stamped so the UI reflects the
      // earlier state, but we don't try to restore deleted versions etc.
      const sideEffectUpdate: Prisma.ContractUpdateInput = {
        status: previousStatus,
        currentRound: previousRound,
      };
      switch (lastTransition.eventType) {
        case "TEMPLATE_ASSIGNED":
          sideEffectUpdate.templateDate = null;
          break;
        case "MARKED_AWAITING_SIGNATURE":
          sideEffectUpdate.finalizedDate = null;
          break;
        case "SIGNED_UPLOADED":
          sideEffectUpdate.signedDate = null;
          break;
        case "CANCELLED":
          sideEffectUpdate.cancelReason = null;
          break;
        default:
          break;
      }
      await tx.contract.update({
        where: { id: contract.id },
        data: sideEffectUpdate,
      });

      // Re-open the review that markAwaitingSignature closed.
      if (lastTransition.eventType === "MARKED_AWAITING_SIGNATURE") {
        const review = await tx.review.findFirst({
          where: {
            contractId: contract.id,
            round: lastTransition.round ?? contract.currentRound,
            returnedAt: { not: null },
          },
          orderBy: { returnedAt: "desc" },
        });
        if (review) {
          await tx.review.update({
            where: { id: review.id },
            data: { returnedAt: null, slaStatus: "ON_TRACK" },
          });
        }
      }

      // Remove the Review row created by submitForReview.
      if (lastTransition.eventType === "DRAFT_SUBMITTED") {
        await tx.review.deleteMany({
          where: {
            contractId: contract.id,
            round: lastTransition.round ?? contract.currentRound,
            returnedAt: null,
          },
        });
      }

      await recordEvent(tx, {
        contractId: contract.id,
        actorId: user.id,
        eventType: "STAGE_UNDONE",
        fromStatus: contract.status,
        toStatus: previousStatus,
        round: previousRound,
        metadata: {
          revertedEventId: lastTransition.id,
          revertedEventType: lastTransition.eventType,
          revertedFromStatus: lastTransition.fromStatus,
          revertedToStatus: lastTransition.toStatus,
        },
      });
    });

    revalidateContract(contract.id);
    return ok({ revertedTo: previousStatus });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "exception");
  }
}

// (availableActionsFor + AvailableAction live in src/lib/contract-actions-registry
// — that module is callable from React components without a "use server" pragma.)

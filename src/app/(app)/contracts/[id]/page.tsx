import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { availableActionsFor } from "@/lib/contract-actions-registry";
import { getContractById } from "@/server/queries/contracts";
import { autoPickupOnView } from "@/server/actions/contracts";
import { contractTypeLabel } from "@/lib/contract-types";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/contract/status-badge";
import { EventTimeline } from "@/components/contract/event-timeline";
import { ContractActionPanel } from "@/components/contract/contract-action-panel";
import { ContractStageProgress } from "@/components/contract/stage-progress";
import { SLAExtensionButton } from "@/components/contract/sla-extension-button";
import { ContractEditButton } from "@/components/contract/contract-edit-button";
import { ContractDeleteButton } from "@/components/contract/contract-delete-button";
import { ContractUndoButton } from "@/components/contract/contract-undo-button";
import {
  SLACatAnimation,
  type SLAMood,
} from "@/components/contract/sla-cat-animation";
import { getHolidays, businessDaysBetween } from "@/lib/business-days";

const TZ = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

const DATE_TZ = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const sessionUser = {
    id: session.user.id,
    role: session.user.role,
    department: session.user.department,
  };
  let contract = await getContractById(sessionUser, id);
  if (!contract) notFound();

  // If a legal user is opening a contract waiting for review, claim the pickup
  // and refetch so the badge + assignee show up immediately.
  const pickup = await autoPickupOnView(id);
  if (pickup.success && pickup.data.pickedUp) {
    contract = (await getContractById(sessionUser, id))!;
  }

  const actions = availableActionsFor(sessionUser, contract);
  const lastReview = [...contract.reviews].sort(
    (a, b) => b.round - a.round,
  )[0];
  const canExtendSLA =
    hasPermission(sessionUser.role, "contract:extendSLA") &&
    lastReview != null &&
    lastReview.returnedAt == null;
  const canEdit = hasPermission(sessionUser.role, "contract:edit");
  const canDelete = hasPermission(sessionUser.role, "contract:delete");
  const canUndo = hasPermission(sessionUser.role, "contract:undoStage");

  const slaMood = await computeSLAMood(contract, lastReview);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-slate-500">{contract.contractNumber}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{contract.title}</h1>
          <p className="text-sm text-slate-600">
            {contract.counterparty} · {contract.buDepartment} · Round {contract.currentRound}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={contract.status} className="text-sm" />
          {canUndo ? <ContractUndoButton contractId={contract.id} /> : null}
          {canEdit ? (
            <ContractEditButton
              contractId={contract.id}
              initial={{
                title: contract.title,
                type: contract.type,
                complexity: contract.complexity ?? null,
                counterparty: contract.counterparty,
                estimatedValue: contract.estimatedValue?.toString() ?? null,
                currency: contract.currency,
                buDepartment: contract.buDepartment,
                notes: contract.notes ?? null,
              }}
            />
          ) : null}
          {canDelete ? (
            <ContractDeleteButton
              contractId={contract.id}
              contractNumber={contract.contractNumber}
            />
          ) : null}
        </div>
      </header>

      <ContractStageProgress
        status={contract.status}
        currentRound={contract.currentRound}
      />

      <SLACatAnimation
        mood={slaMood.mood}
        caption={slaMood.caption}
        detail={slaMood.detail}
      />

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-6 text-sm md:grid-cols-4">
          <DateField label="Started" value={contract.startDate} />
          <DateField label="Template" value={contract.templateDate} />
          <DateField label="Finalized" value={contract.finalizedDate} />
          <DateField label="Signed" value={contract.signedDate} />
          <div className="col-span-2 md:col-span-2">
            <div className="text-xs text-slate-500">BU owner</div>
            <div className="font-medium">{contract.buOwner.name}</div>
          </div>
          <div className="col-span-2 md:col-span-2">
            <div className="text-xs text-slate-500">Type</div>
            <div className="font-medium">{contractTypeLabel(contract.type)}</div>
          </div>
          {contract.notes ? (
            <div className="col-span-2 md:col-span-4">
              <div className="text-xs text-slate-500">Notes</div>
              <div>{contract.notes}</div>
            </div>
          ) : null}
          {contract.cancelReason ? (
            <div className="col-span-2 md:col-span-4">
              <div className="text-xs text-red-600">Cancel reason</div>
              <div>{contract.cancelReason}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <ContractActionPanel contractId={contract.id} actions={actions}>
            {canExtendSLA ? <SLAExtensionButton contractId={contract.id} /> : null}
          </ContractActionPanel>
        </CardContent>
      </Card>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versions ({contract.versions.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({contract.events.length})</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({contract.reviews.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="versions">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contract.versions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                      No files yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  contract.versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.versionLabel}</TableCell>
                      <TableCell>{v.round}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{v.fileName}</TableCell>
                      <TableCell>{bytes(v.fileSize)}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {TZ.format(v.uploadedAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/api/versions/${v.id}/download`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Download
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <EventTimeline events={contract.events} />
        </TabsContent>

        <TabsContent value="reviews">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Picked up</TableHead>
                  <TableHead>Returned</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contract.reviews.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                      No reviews recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  contract.reviews.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>R{r.round}</TableCell>
                      <TableCell className="text-xs">{TZ.format(r.submittedAt)}</TableCell>
                      <TableCell className="text-xs">
                        {r.pickedUpAt ? TZ.format(r.pickedUpAt) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.returnedAt ? TZ.format(r.returnedAt) : "—"}
                      </TableCell>
                      <TableCell>{r.assignedTo?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.slaStatus}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {lastReview ? (
            <p className="mt-2 text-xs text-slate-500">
              Latest deadline: {TZ.format(lastReview.slaDeadline)}
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DateField({ label, value }: { label: string; value: Date | null }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value ? DATE_TZ.format(value) : "—"}</div>
    </div>
  );
}

type SLAMoodResult = { mood: SLAMood; caption: string; detail?: string };

// Picks the right cat scene for the current deadline situation:
//   - lavender field (>2 business days left or no active deadline)
//   - working on fire (≤2 business days left)
//   - burnt cat (past deadline or cancelled)
//
// Source of truth is the most recent open review (i.e. not returned yet).
async function computeSLAMood(
  contract: { status: string },
  lastReview:
    | {
        submittedAt: Date;
        pickedUpAt: Date | null;
        returnedAt: Date | null;
        slaDeadline: Date;
      }
    | undefined,
): Promise<SLAMoodResult> {
  if (contract.status === "CANCELLED") {
    return {
      mood: "burnt",
      caption: "Cancelled",
      detail: "This contract was cancelled.",
    };
  }

  const openReview = lastReview && !lastReview.returnedAt ? lastReview : null;

  if (openReview) {
    const now = new Date();
    const holidays = await getHolidays();
    if (now > openReview.slaDeadline) {
      const daysOver = Math.max(
        1,
        Math.abs(businessDaysBetween(now, openReview.slaDeadline, holidays)),
      );
      return {
        mood: "burnt",
        caption: "Past deadline",
        detail: `Legal review is ${daysOver} business day${daysOver === 1 ? "" : "s"} late.`,
      };
    }
    const remaining = businessDaysBetween(now, openReview.slaDeadline, holidays);
    if (remaining <= 2) {
      return {
        mood: "fire",
        caption: "Crunch time",
        detail: `${Math.max(0, remaining)} business day${remaining === 1 ? "" : "s"} left to finish the review.`,
      };
    }
    return {
      mood: "lavender",
      caption: "All calm",
      detail: `${remaining} business days left on the review deadline.`,
    };
  }

  return {
    mood: "lavender",
    caption: "All calm",
    detail: "No active deadline. Cat is enjoying the breeze.",
  };
}

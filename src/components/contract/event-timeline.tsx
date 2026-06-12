import type { Event, EventType, Role } from "@prisma/client";

const EVENT_LABEL: Record<EventType, string> = {
  CONTRACT_REGISTERED: "Contract registered",
  TEMPLATE_ASSIGNED: "Template assigned",
  DRAFT_SUBMITTED: "Draft submitted",
  SUBMITTED_FOR_REVIEW: "Submitted for review",
  REVIEW_PICKED_UP: "Review picked up",
  REVISE_REQUESTED: "Sent back to BU owner",
  SENT_TO_COUNTERPARTY: "Sent to counterparty (legacy)",
  CP_REPLIED: "Counterparty replied (legacy)",
  RESUBMITTED_TO_LEGAL: "Resubmitted to legal",
  SUBMITTED_FOR_SIGNING: "Submitted for signing (legacy)",
  SIGNED_UPLOADED: "Uploaded",
  TRACKING_UPDATED: "Tracking updated",
  MARKED_AWAITING_SIGNATURE: "Marked as signed",
  CANCELLED: "Cancelled",
  COMMENT_ADDED: "Comment added",
  SLA_EXTENDED: "SLA extended",
  STAGE_UNDONE: "Stage undone",
  CONTRACT_EDITED: "Contract edited",
};

type EventWithActor = Event & { actor: { id: string; name: string; role: Role } };

const TZ_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

function describeMetadata(
  eventType: EventType,
  meta: Event["metadata"],
): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const obj = meta as Record<string, unknown>;
  const parts: string[] = [];

  const fileName = typeof obj.fileName === "string" ? obj.fileName : null;
  const versionLabel = typeof obj.versionLabel === "string" ? obj.versionLabel : null;
  const notes = typeof obj.notes === "string" && obj.notes.length > 0 ? obj.notes : null;
  const reason = typeof obj.reason === "string" ? obj.reason : null;
  const stageOnly = obj.stageOnly === true;

  // File-related events: show the file in a verb-shaped phrase per plan §11
  // Sprint 3 task 7 ("Assigned template: NDA-template-v3.docx by …").
  switch (eventType) {
    case "TEMPLATE_ASSIGNED":
      if (fileName) parts.push(`Template: ${fileName}`);
      break;
    case "DRAFT_SUBMITTED":
      if (fileName) parts.push(`Draft: ${fileName}`);
      if (versionLabel) parts.push(`(${versionLabel})`);
      break;
    case "CP_REPLIED":
      if (fileName) parts.push(`From counterparty: ${fileName}`);
      break;
    case "MARKED_AWAITING_SIGNATURE":
      if (fileName) parts.push(`Final draft: ${fileName}`);
      break;
    case "SIGNED_UPLOADED":
      if (fileName) parts.push(`Signed PDF: ${fileName}`);
      break;
    default:
      if (fileName) parts.push(fileName);
  }

  if (notes) parts.push(`"${notes}"`);
  if (reason) parts.push(`Reason: ${reason}`);
  if (stageOnly && parts.length === 0) parts.push("Stage advanced (no file attached)");
  return parts.length ? parts.join(" · ") : null;
}

export function EventTimeline({ events }: { events: EventWithActor[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No events yet.</p>;
  }
  return (
    <ol className="border-l border-slate-200 pl-4">
      {events.map((e) => {
        const meta = describeMetadata(e.eventType, e.metadata);
        return (
          <li key={e.id} className="relative pb-4">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{EVENT_LABEL[e.eventType]}</span>
              <span className="text-xs text-slate-500">
                {TZ_FORMATTER.format(e.createdAt)} · by {e.actor.name}
                {e.round != null ? ` · R${e.round}` : ""}
              </span>
            </div>
            {meta ? <p className="mt-0.5 text-sm text-slate-600">{meta}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

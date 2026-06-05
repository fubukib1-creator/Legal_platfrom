-- Drop the deprecated REVIEW_RETURNED contract status and its companion
-- events (REVIEW_RETURNED + MARKED_FINAL). Postgres can't remove enum values
-- in place, so we recreate each enum, swap the column types over, and drop
-- the old enums. This requires no rows currently reference the removed
-- values (verified by the application code paths that produce them being
-- gone before this migration runs).

-- ── ContractStatus ─────────────────────────────────────────────────────────
CREATE TYPE "ContractStatus_new" AS ENUM (
  'REGISTERED',
  'AWAITING_TEMPLATE',
  'DRAFTING',
  'IN_LEGAL_REVIEW',
  'WITH_COUNTERPARTY',
  'CP_RESPONDED',
  'AWAITING_SIGNATURE',
  'OUT_FOR_SIGNING',
  'MONITORING',
  'CANCELLED'
);

ALTER TABLE "Contract"
  ALTER COLUMN "status" TYPE "ContractStatus_new"
  USING ("status"::text::"ContractStatus_new");

ALTER TABLE "Event"
  ALTER COLUMN "fromStatus" TYPE "ContractStatus_new"
  USING ("fromStatus"::text::"ContractStatus_new");

ALTER TABLE "Event"
  ALTER COLUMN "toStatus" TYPE "ContractStatus_new"
  USING ("toStatus"::text::"ContractStatus_new");

DROP TYPE "ContractStatus";
ALTER TYPE "ContractStatus_new" RENAME TO "ContractStatus";

-- ── EventType ──────────────────────────────────────────────────────────────
CREATE TYPE "EventType_new" AS ENUM (
  'CONTRACT_REGISTERED',
  'TEMPLATE_ASSIGNED',
  'DRAFT_SUBMITTED',
  'REVIEW_PICKED_UP',
  'REVISE_REQUESTED',
  'SENT_TO_COUNTERPARTY',
  'CP_REPLIED',
  'RESUBMITTED_TO_LEGAL',
  'MARKED_AWAITING_SIGNATURE',
  'SUBMITTED_FOR_SIGNING',
  'SIGNED_UPLOADED',
  'TRACKING_UPDATED',
  'CANCELLED',
  'COMMENT_ADDED',
  'SLA_EXTENDED',
  'STAGE_UNDONE',
  'CONTRACT_EDITED'
);

ALTER TABLE "Event"
  ALTER COLUMN "eventType" TYPE "EventType_new"
  USING ("eventType"::text::"EventType_new");

DROP TYPE "EventType";
ALTER TYPE "EventType_new" RENAME TO "EventType";

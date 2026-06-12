-- Migration: remove DRAFTING status, add PENDING_BU_REVISION and SUBMITTED_FOR_REVIEW

-- Step 1: migrate existing DRAFTING records back to REGISTERED
UPDATE "Contract" SET "status" = 'REGISTERED' WHERE "status" = 'DRAFTING';
UPDATE "Event" SET "fromStatus" = 'REGISTERED' WHERE "fromStatus" = 'DRAFTING';
UPDATE "Event" SET "toStatus" = 'REGISTERED' WHERE "toStatus" = 'DRAFTING';

-- Step 2: add SUBMITTED_FOR_REVIEW to EventType (ADD VALUE is safe in PG 12+)
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SUBMITTED_FOR_REVIEW';

-- Step 3: recreate ContractStatus without DRAFTING, with PENDING_BU_REVISION
CREATE TYPE "ContractStatus_new" AS ENUM (
  'REGISTERED',
  'AWAITING_TEMPLATE',
  'PENDING_BU_REVISION',
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
  USING "status"::text::"ContractStatus_new";

ALTER TABLE "Event"
  ALTER COLUMN "fromStatus" TYPE "ContractStatus_new"
  USING "fromStatus"::text::"ContractStatus_new";

ALTER TABLE "Event"
  ALTER COLUMN "toStatus" TYPE "ContractStatus_new"
  USING "toStatus"::text::"ContractStatus_new";

DROP TYPE "ContractStatus";
ALTER TYPE "ContractStatus_new" RENAME TO "ContractStatus";

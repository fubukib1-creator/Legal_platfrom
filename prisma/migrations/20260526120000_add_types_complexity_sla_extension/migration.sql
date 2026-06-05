-- New contract types (running numbers are tracked separately for these in app code)
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'INQUIRY';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'POA';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'OFFICIAL_LETTER';

-- New event type for SLA extension
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SLA_EXTENDED';

-- Contract complexity
CREATE TYPE "ContractComplexity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

ALTER TABLE "Contract" ADD COLUMN "complexity" "ContractComplexity";

-- SLA extension tracking on Review
ALTER TABLE "Review" ADD COLUMN "slaExtensionDays" INTEGER NOT NULL DEFAULT 0;

-- Step 1: add new values to existing enum so UPDATE below can reference them
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'SALE_PURCHASE';
ALTER TYPE "ContractType" ADD VALUE IF NOT EXISTS 'SERVICE_HIRE_OF_WORK';

-- Step 2: migrate existing PROCUREMENT records → SALE_PURCHASE
UPDATE "Contract" SET "type" = 'SALE_PURCHASE' WHERE "type" = 'PROCUREMENT';

-- Step 3: recreate enum without PROCUREMENT
CREATE TYPE "ContractType_new" AS ENUM (
  'MOU',
  'NDA',
  'OTHERS',
  'INQUIRY',
  'POA',
  'OFFICIAL_LETTER',
  'SALE_PURCHASE',
  'SERVICE_HIRE_OF_WORK'
);

-- Step 4: swap column to new enum
ALTER TABLE "Contract"
  ALTER COLUMN "type" TYPE "ContractType_new"
  USING "type"::text::"ContractType_new";

-- Step 5: drop old, rename new
DROP TYPE "ContractType";
ALTER TYPE "ContractType_new" RENAME TO "ContractType";

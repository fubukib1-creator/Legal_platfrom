-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BU_MEMBER', 'BU_MANAGER', 'LEGAL_REVIEWER', 'LEGAL_LEAD', 'ADMIN');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('MOU', 'NDA', 'PROCUREMENT', 'OTHERS');

-- CreateEnum
CREATE TYPE "PaymentSide" AS ENUM ('PAYER', 'RECEIVER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('REGISTERED', 'AWAITING_TEMPLATE', 'DRAFTING', 'IN_LEGAL_REVIEW', 'REVIEW_RETURNED', 'WITH_COUNTERPARTY', 'CP_RESPONDED', 'AWAITING_SIGNATURE', 'OUT_FOR_SIGNING', 'MONITORING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VersionStage" AS ENUM ('TEMPLATE', 'BU_DRAFT', 'LEGAL_REVIEWED', 'CP_RETURNED', 'FINAL', 'SIGNED');

-- CreateEnum
CREATE TYPE "SLAStatus" AS ENUM ('ON_TRACK', 'WARNING', 'BREACHED', 'COMPLETED', 'COMPLETED_LATE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CONTRACT_REGISTERED', 'TEMPLATE_ASSIGNED', 'DRAFT_SUBMITTED', 'REVIEW_PICKED_UP', 'REVIEW_RETURNED', 'SENT_TO_COUNTERPARTY', 'CP_REPLIED', 'RESUBMITTED_TO_LEGAL', 'MARKED_FINAL', 'SUBMITTED_FOR_SIGNING', 'SIGNED_UPLOADED', 'TRACKING_UPDATED', 'CANCELLED', 'COMMENT_ADDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL,
    "department" TEXT NOT NULL,
    "lineUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "counterparty" TEXT NOT NULL,
    "estimatedValue" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "buOwnerId" TEXT NOT NULL,
    "buDepartment" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "templateDate" TIMESTAMP(3),
    "finalizedDate" TIMESTAMP(3),
    "signedDate" TIMESTAMP(3),
    "paymentSide" "PaymentSide",
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "renewalDecisionDeadline" TIMESTAMP(3),
    "contractValue" DECIMAL(18,2),
    "revenueStamp" DECIMAL(18,2),
    "depositAmount" DECIMAL(18,2),
    "depositReturnDate" TIMESTAMP(3),
    "monitoringNotes" TEXT,
    "notes" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Version" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "stage" "VersionStage" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "pickedUpAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "slaStatus" "SLAStatus" NOT NULL DEFAULT 'ON_TRACK',
    "legalNotes" TEXT,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "fromStatus" "ContractStatus",
    "toStatus" "ContractStatus",
    "round" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "contractId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNumber_key" ON "Contract"("contractNumber");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Contract_buDepartment_idx" ON "Contract"("buDepartment");

-- CreateIndex
CREATE INDEX "Contract_buOwnerId_idx" ON "Contract"("buOwnerId");

-- CreateIndex
CREATE INDEX "Version_contractId_round_idx" ON "Version"("contractId", "round");

-- CreateIndex
CREATE INDEX "Review_contractId_round_idx" ON "Review"("contractId", "round");

-- CreateIndex
CREATE INDEX "Review_slaStatus_idx" ON "Review"("slaStatus");

-- CreateIndex
CREATE INDEX "Event_contractId_createdAt_idx" ON "Event"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "Holiday_year_idx" ON "Holiday"("year");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_buOwnerId_fkey" FOREIGN KEY ("buOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

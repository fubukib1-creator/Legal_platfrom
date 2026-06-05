import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.join(process.cwd(), ".env.local"), override: false });
loadEnv({ path: path.join(process.cwd(), ".env"), override: false });

import {
  PrismaClient,
  type ContractComplexity,
  type ContractStatus,
  type ContractType,
  type EventType,
  type Role,
  type SLAStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { addBusinessDays, slaDeadlineFor } from "../src/lib/business-days";
import {
  formatContractNumber,
  formatNonRunningContractNumber,
  nextSequenceFromAll,
  randomHexSuffix,
} from "../src/lib/contract-number";
import {
  contractTypeCode,
  contractTypeUsesSeparateSequence,
} from "../src/lib/contract-types";
import { teamCodeFor } from "../src/lib/departments";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DEFAULT_PASSWORD = "Password123!";

const seedUsers: Array<{
  email: string;
  name: string;
  role: Role;
  department: string;
}> = [
  { email: "admin@innopower.co.th", name: "System Admin", role: "ADMIN", department: "IT" },
  { email: "lead.legal@innopower.co.th", name: "Juthamas Barlee", role: "LEGAL_LEAD", department: "Legal" },
  { email: "reviewer.legal@innopower.co.th", name: "A-chiraya Chantana", role: "LEGAL_REVIEWER", department: "Legal" },
  { email: "manager.vb@innopower.co.th", name: "Suchada Ittipol", role: "BU_MANAGER", department: "VB" },
  { email: "member.vb@innopower.co.th", name: "Niran Boonsri", role: "BU_MEMBER", department: "VB" },
  { email: "member.ce@innopower.co.th", name: "Pranee Chaiwong", role: "BU_MEMBER", department: "CE" },
  { email: "member.fm@innopower.co.th", name: "Kanchana Phromma", role: "BU_MEMBER", department: "FM" },
  { email: "member.dp@innopower.co.th", name: "Wirot Boonchu", role: "BU_MEMBER", department: "DP" },
  { email: "member.fp@innopower.co.th", name: "Somsak Tanapong", role: "BU_MEMBER", department: "FP" },
  { email: "member.sp@innopower.co.th", name: "Malee Sirikul", role: "BU_MEMBER", department: "SP" },
  { email: "member.vc@innopower.co.th", name: "Anurak Wattana", role: "BU_MEMBER", department: "VC" },
];

// Thai public holidays for 2026 (from Bank of Thailand calendar — substitution
// dates included where the actual holiday falls on a weekend).
const holidays2026: Array<{ date: string; name: string }> = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-02", name: "Substitution for New Year's Eve 2025" },
  { date: "2026-03-03", name: "Makha Bucha Day" },
  { date: "2026-04-06", name: "Chakri Memorial Day" },
  { date: "2026-04-13", name: "Songkran Festival" },
  { date: "2026-04-14", name: "Songkran Festival" },
  { date: "2026-04-15", name: "Songkran Festival" },
  { date: "2026-05-01", name: "Labour Day" },
  { date: "2026-05-04", name: "Coronation Day" },
  { date: "2026-05-05", name: "Substitution for Coronation Day" },
  { date: "2026-06-01", name: "Substitution for Visakha Bucha (31 May)" },
  { date: "2026-06-03", name: "HM Queen's Birthday" },
  { date: "2026-07-30", name: "Asalha Bucha Day" },
  { date: "2026-07-31", name: "Khao Phansa Day" },
  { date: "2026-08-12", name: "HM Queen Mother's Birthday / Mother's Day" },
  { date: "2026-10-13", name: "King Bhumibol Memorial Day" },
  { date: "2026-10-23", name: "Chulalongkorn Day" },
  { date: "2026-12-07", name: "Substitution for HM King's Birthday (5 Dec)" },
  { date: "2026-12-10", name: "Constitution Day" },
  { date: "2026-12-31", name: "New Year's Eve" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Demo dataset: one contract per stage × SLA state combination so every UI
// surface (dashboard tiles, pipeline, SLA cat, legal performance) has data to
// render. Each contract carries a full event trail reflecting the stages it
// has already passed through.
// ─────────────────────────────────────────────────────────────────────────────

type DemoContract = {
  title: string;
  type: ContractType;
  complexity?: ContractComplexity; // unset = "Unset" bucket on the complexity chart
  counterparty: string;
  ownerEmail: string;
  status: ContractStatus;
  daysAgoStarted: number;
  daysAgoTemplate?: number;
  daysAgoSubmitted?: number;
  daysAgoFinalized?: number;
  daysAgoSigned?: number;
  pickedUp?: boolean;
  returnedAfterDays?: number;
  cancelReason?: string;
  daysAgoCancelled?: number;
  notes?: string;
  desiredSLA?: SLAStatus; // intent for OPEN reviews — actual is recomputed on cron
  round?: number;
  // SLA extension applied to the most recent review (open or closed). The
  // deadline is pushed by this many business days and an SLA_EXTENDED event
  // is added at submittedAt + 1 day.
  slaExtensionDays?: number;
};

const VB_OWNER = "member.vb@innopower.co.th";
const CE_OWNER = "member.ce@innopower.co.th";
const FM_OWNER = "member.fm@innopower.co.th";
const DP_OWNER = "member.dp@innopower.co.th";
const FP_OWNER = "member.fp@innopower.co.th";
const SP_OWNER = "member.sp@innopower.co.th";
const VC_OWNER = "member.vc@innopower.co.th";

// Demo dataset: covers every (status × SLA × complexity × type) combination
// the UI exposes, plus historical OUT_FOR_SIGNING contracts spread across the
// past 12 months so the yearly performance view has bars for every month.
const demo: DemoContract[] = [
  // ── REGISTERED ────────────────────────────────────────────────────────────
  {
    title: "VB / Sunpower — solar substation MOU",
    type: "MOU",
    complexity: "LOW",
    counterparty: "Sunpower Co.",
    ownerEmail: VB_OWNER,
    status: "REGISTERED",
    daysAgoStarted: 1,
    round: 0,
    notes: "Pending template assignment — Legal to choose standard MOU form.",
  },
  {
    title: "POA / VB — bank signatory authorisation",
    type: "POA",
    complexity: "MEDIUM",
    counterparty: "Bangkok Bank",
    ownerEmail: VB_OWNER,
    status: "REGISTERED",
    daysAgoStarted: 2,
    round: 0,
  },

  // ── DRAFTING ──────────────────────────────────────────────────────────────
  {
    title: "PEA grid interconnect MOU",
    type: "MOU",
    complexity: "MEDIUM",
    counterparty: "PEA Region 3",
    ownerEmail: CE_OWNER,
    status: "DRAFTING",
    daysAgoStarted: 5,
    daysAgoTemplate: 3,
    round: 0,
  },
  {
    title: "FP / Krungsri — leasing facility NDA",
    type: "NDA",
    complexity: "LOW",
    counterparty: "Krungsri Auto",
    ownerEmail: FP_OWNER,
    status: "DRAFTING",
    daysAgoStarted: 4,
    daysAgoTemplate: 2,
    round: 0,
  },
  {
    title: "Official letter — Ministry of Energy enquiry response",
    type: "OFFICIAL_LETTER",
    // Intentionally unset complexity to exercise the "Unset" bucket
    counterparty: "Ministry of Energy",
    ownerEmail: CE_OWNER,
    status: "DRAFTING",
    daysAgoStarted: 3,
    daysAgoTemplate: 2,
    round: 0,
  },

  // ── IN_LEGAL_REVIEW (open reviews — SLA variants) ─────────────────────────
  {
    title: "Doosan Heavy — turbine supplier NDA",
    type: "NDA",
    complexity: "MEDIUM",
    counterparty: "Doosan Heavy",
    ownerEmail: CE_OWNER,
    status: "IN_LEGAL_REVIEW",
    daysAgoStarted: 8,
    daysAgoTemplate: 7,
    daysAgoSubmitted: 2,
    pickedUp: true,
    desiredSLA: "ON_TRACK",
    round: 1,
  },
  {
    title: "PTT — diesel byproduct procurement H2 2026",
    type: "PROCUREMENT",
    complexity: "HIGH",
    counterparty: "PTT Group",
    ownerEmail: VB_OWNER,
    status: "IN_LEGAL_REVIEW",
    daysAgoStarted: 18,
    daysAgoTemplate: 16,
    daysAgoSubmitted: 10,
    pickedUp: true,
    desiredSLA: "WARNING",
    round: 1,
  },
  {
    title: "AquaSol — Hua Hin floating solar procurement",
    type: "PROCUREMENT",
    complexity: "HIGH",
    counterparty: "AquaSol Asia",
    ownerEmail: VB_OWNER,
    status: "IN_LEGAL_REVIEW",
    daysAgoStarted: 22,
    daysAgoTemplate: 20,
    daysAgoSubmitted: 13,
    pickedUp: true,
    desiredSLA: "BREACHED",
    round: 1,
  },
  // IN_LEGAL_REVIEW with SLA already extended — deadline pushed by 5 BD so
  // the legal-performance "SLA extension proportion" card has a non-zero
  // share for the current period.
  {
    title: "EGAT — peaking plant supply (extended SLA)",
    type: "PROCUREMENT",
    complexity: "HIGH",
    counterparty: "EGAT",
    ownerEmail: SP_OWNER,
    status: "IN_LEGAL_REVIEW",
    daysAgoStarted: 14,
    daysAgoTemplate: 12,
    daysAgoSubmitted: 8,
    pickedUp: true,
    desiredSLA: "ON_TRACK",
    round: 1,
    slaExtensionDays: 5,
    notes: "SLA extended by 5 BD on request from the deal team.",
  },
  {
    title: "Inquiry — interconnect technical question (in review)",
    type: "INQUIRY",
    complexity: "LOW",
    counterparty: "ECC Sub-contractor",
    ownerEmail: CE_OWNER,
    status: "IN_LEGAL_REVIEW",
    daysAgoStarted: 6,
    daysAgoTemplate: 5,
    daysAgoSubmitted: 1,
    pickedUp: true,
    desiredSLA: "ON_TRACK",
    round: 1,
  },

  // ── AWAITING_SIGNATURE (post-IN_LEGAL_REVIEW via markAwaitingSignature) ────
  {
    title: "G4S — site security service",
    type: "OTHERS",
    complexity: "LOW",
    counterparty: "G4S Thailand",
    ownerEmail: FM_OWNER,
    status: "AWAITING_SIGNATURE",
    daysAgoStarted: 15,
    daysAgoTemplate: 13,
    daysAgoSubmitted: 9,
    pickedUp: true,
    returnedAfterDays: 4,
    daysAgoFinalized: 5,
    round: 1,
  },
  {
    title: "Trina Solar — Tier-1 panels procurement",
    type: "PROCUREMENT",
    complexity: "MEDIUM",
    counterparty: "Trina Solar",
    ownerEmail: VB_OWNER,
    status: "AWAITING_SIGNATURE",
    daysAgoStarted: 25,
    daysAgoTemplate: 23,
    daysAgoSubmitted: 18,
    pickedUp: true,
    returnedAfterDays: 12,
    daysAgoFinalized: 6,
    round: 1,
  },
  {
    title: "VC / Sequoia — venture co-investment MOU",
    type: "MOU",
    complexity: "HIGH",
    counterparty: "Sequoia Capital SEA",
    ownerEmail: VC_OWNER,
    status: "AWAITING_SIGNATURE",
    daysAgoStarted: 18,
    daysAgoTemplate: 16,
    daysAgoSubmitted: 12,
    pickedUp: true,
    returnedAfterDays: 5,
    daysAgoFinalized: 7,
    round: 1,
  },

  // ── AWAITING_SIGNATURE (additional) ───────────────────────────────────────
  {
    title: "GULF — Khon Kaen 8MW solar procurement",
    type: "PROCUREMENT",
    complexity: "HIGH",
    counterparty: "GULF Energy",
    ownerEmail: VB_OWNER,
    status: "AWAITING_SIGNATURE",
    daysAgoStarted: 30,
    daysAgoTemplate: 28,
    daysAgoSubmitted: 24,
    pickedUp: true,
    returnedAfterDays: 8,
    daysAgoFinalized: 2,
    round: 1,
  },
  {
    title: "FM / GreenLine — annual vegetation MOU",
    type: "MOU",
    complexity: "LOW",
    counterparty: "GreenLine Co.",
    ownerEmail: FM_OWNER,
    status: "AWAITING_SIGNATURE",
    daysAgoStarted: 24,
    daysAgoTemplate: 22,
    daysAgoSubmitted: 17,
    pickedUp: true,
    returnedAfterDays: 6,
    daysAgoFinalized: 3,
    round: 1,
  },

  // ── OUT_FOR_SIGNING (recent — current period) ─────────────────────────────
  {
    title: "GreenLine — vegetation management service",
    type: "OTHERS",
    complexity: "LOW",
    counterparty: "GreenLine Co.",
    ownerEmail: DP_OWNER,
    status: "OUT_FOR_SIGNING",
    daysAgoStarted: 38,
    daysAgoTemplate: 36,
    daysAgoSubmitted: 30,
    pickedUp: true,
    returnedAfterDays: 7,
    daysAgoFinalized: 8,
    daysAgoSigned: 3,
    round: 1,
  },
  {
    title: "CATL — battery cells 50MWh procurement",
    type: "PROCUREMENT",
    complexity: "HIGH",
    counterparty: "CATL",
    ownerEmail: VB_OWNER,
    status: "OUT_FOR_SIGNING",
    daysAgoStarted: 50,
    daysAgoTemplate: 48,
    daysAgoSubmitted: 42,
    pickedUp: true,
    returnedAfterDays: 8,
    daysAgoFinalized: 14,
    daysAgoSigned: 5,
    round: 1,
  },
  {
    title: "Inquiry response — rooftop interconnect tariff",
    type: "INQUIRY",
    complexity: "LOW",
    counterparty: "MEA District 5",
    ownerEmail: CE_OWNER,
    status: "OUT_FOR_SIGNING",
    daysAgoStarted: 28,
    daysAgoTemplate: 26,
    daysAgoSubmitted: 22,
    pickedUp: true,
    returnedAfterDays: 5,
    daysAgoFinalized: 9,
    daysAgoSigned: 2,
    round: 1,
  },
  {
    title: "POA — site visit authorisation (signed)",
    type: "POA",
    complexity: "MEDIUM",
    counterparty: "DEDE",
    ownerEmail: DP_OWNER,
    status: "OUT_FOR_SIGNING",
    daysAgoStarted: 35,
    daysAgoTemplate: 33,
    daysAgoSubmitted: 28,
    pickedUp: true,
    returnedAfterDays: 6,
    daysAgoFinalized: 12,
    daysAgoSigned: 4,
    round: 1,
  },
  {
    title: "Official letter — DEDE compliance acknowledgement",
    type: "OFFICIAL_LETTER",
    complexity: "LOW",
    counterparty: "DEDE",
    ownerEmail: SP_OWNER,
    status: "OUT_FOR_SIGNING",
    daysAgoStarted: 33,
    daysAgoTemplate: 31,
    daysAgoSubmitted: 26,
    pickedUp: true,
    returnedAfterDays: 4,
    daysAgoFinalized: 10,
    daysAgoSigned: 3,
    round: 1,
  },

  // ── CANCELLED ─────────────────────────────────────────────────────────────
  {
    title: "MaeSotPower — mini-grid procurement (cancelled)",
    type: "PROCUREMENT",
    complexity: "MEDIUM",
    counterparty: "MaeSotPower Co.",
    ownerEmail: VB_OWNER,
    status: "CANCELLED",
    daysAgoStarted: 20,
    daysAgoTemplate: 18,
    daysAgoSubmitted: 14,
    pickedUp: true,
    daysAgoCancelled: 2,
    cancelReason: "Counterparty backed out after technical review.",
    round: 1,
  },

  // ── Pending-by-BU diversity ───────────────────────────────────────────────
  {
    title: "SP / SCG — strategic materials procurement",
    type: "PROCUREMENT",
    complexity: "MEDIUM",
    counterparty: "Siam Cement Group",
    ownerEmail: SP_OWNER,
    status: "IN_LEGAL_REVIEW",
    daysAgoStarted: 6,
    daysAgoTemplate: 5,
    daysAgoSubmitted: 1,
    pickedUp: true,
    desiredSLA: "ON_TRACK",
    round: 1,
  },

  // ── Historical OUT_FOR_SIGNING — one per recent month for the yearly chart.
  // Spaced ~30 days apart starting ~30 days ago so each of the last 12 months
  // gets at least one Finalized/Signed bar on the legal-performance table.
  ...buildHistoricalSignedContracts(),
];

// 12 historical signed contracts walking back month-by-month so the yearly
// performance view (and the SLA-extension proportion when looking at a year)
// has data in every bucket.
function buildHistoricalSignedContracts(): DemoContract[] {
  const types: ContractType[] = [
    "MOU",
    "NDA",
    "PROCUREMENT",
    "OTHERS",
    "INQUIRY",
    "POA",
    "OFFICIAL_LETTER",
    "MOU",
    "NDA",
    "PROCUREMENT",
    "OTHERS",
    "INQUIRY",
  ];
  const owners = [
    VB_OWNER,
    CE_OWNER,
    FM_OWNER,
    DP_OWNER,
    FP_OWNER,
    SP_OWNER,
    VC_OWNER,
  ];
  const complexities: Array<ContractComplexity | undefined> = [
    "LOW",
    "MEDIUM",
    "HIGH",
    "MEDIUM",
    "LOW",
    "HIGH",
    undefined,
  ];

  return types.map((type, i) => {
    const ownerEmail = owners[i % owners.length];
    const complexity = complexities[i % complexities.length];
    const monthsAgo = i + 1; // 1..12 months ago
    const daysAgoSigned = 30 * monthsAgo;
    const daysAgoFinalized = daysAgoSigned + 7;
    const daysAgoSubmitted = daysAgoSigned + 25;
    const daysAgoTemplate = daysAgoSigned + 30;
    const daysAgoStarted = daysAgoSigned + 33;
    // Sprinkle SLA extensions on every 4th historical contract so the
    // "extended" share is visible in the proportion card.
    const slaExtensionDays = i % 4 === 0 ? 3 : undefined;
    return {
      title: `Historical ${type} contract (signed ${monthsAgo}mo ago)`,
      type,
      complexity,
      counterparty: `Demo Counterparty ${i + 1}`,
      ownerEmail,
      status: "OUT_FOR_SIGNING",
      daysAgoStarted,
      daysAgoTemplate,
      daysAgoSubmitted,
      returnedAfterDays: 4 + (i % 3),
      pickedUp: true,
      daysAgoFinalized,
      daysAgoSigned,
      round: 1,
      slaExtensionDays,
    };
  });
}

const NOW_HOLD: { value: Date } = { value: new Date() };
function daysAgo(n: number): Date {
  const d = new Date(NOW_HOLD.value);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

type StageEvent = {
  eventType: EventType;
  at: Date;
  actorEmail: string;
  fromStatus?: ContractStatus | null;
  toStatus?: ContractStatus | null;
  round?: number | null;
  metadata?: Record<string, unknown>;
};

// Builds the timeline of events a contract should have given its current
// status. Each downstream stage implies all the prior transitions happened.
function buildEventTrail(
  c: DemoContract,
  legalEmail: string,
): StageEvent[] {
  const events: StageEvent[] = [];
  const startDate = daysAgo(c.daysAgoStarted);

  // CONTRACT_REGISTERED is always present.
  events.push({
    eventType: "CONTRACT_REGISTERED",
    at: startDate,
    actorEmail: legalEmail,
    toStatus: "REGISTERED",
    round: 0,
  });

  // TEMPLATE_ASSIGNED — fired for any stage past REGISTERED.
  if (c.daysAgoTemplate != null) {
    events.push({
      eventType: "TEMPLATE_ASSIGNED",
      at: daysAgo(c.daysAgoTemplate),
      actorEmail: legalEmail,
      fromStatus: "REGISTERED",
      toStatus: "DRAFTING",
      round: 0,
    });
  }

  // DRAFT_SUBMITTED — fired for any stage past DRAFTING that has a review.
  if (c.daysAgoSubmitted != null) {
    events.push({
      eventType: "DRAFT_SUBMITTED",
      at: daysAgo(c.daysAgoSubmitted),
      actorEmail: legalEmail,
      fromStatus: "DRAFTING",
      toStatus: "IN_LEGAL_REVIEW",
      round: c.round ?? 1,
    });
  }

  // REVIEW_PICKED_UP — when legal claimed the review.
  if (c.daysAgoSubmitted != null && c.pickedUp) {
    const submittedAt = daysAgo(c.daysAgoSubmitted);
    events.push({
      eventType: "REVIEW_PICKED_UP",
      at: new Date(submittedAt.getTime() + 60 * 60 * 1000),
      actorEmail: legalEmail,
      fromStatus: "IN_LEGAL_REVIEW",
      toStatus: "IN_LEGAL_REVIEW",
      round: c.round ?? 1,
    });
  }

  // SLA_EXTENDED — fired one day after submission for demo realism.
  if (c.slaExtensionDays && c.daysAgoSubmitted != null) {
    const submittedAt = daysAgo(c.daysAgoSubmitted);
    events.push({
      eventType: "SLA_EXTENDED",
      at: new Date(submittedAt.getTime() + 24 * 60 * 60 * 1000),
      actorEmail: legalEmail,
      fromStatus: "IN_LEGAL_REVIEW",
      toStatus: "IN_LEGAL_REVIEW",
      round: c.round ?? 1,
      metadata: { extendedDays: c.slaExtensionDays },
    });
  }

  // MARKED_AWAITING_SIGNATURE — IN_LEGAL_REVIEW → AWAITING_SIGNATURE in one step.
  // We emit this whenever the contract has a finalizedDate (the new collapsed
  // transition replaces the old return-then-final two-step).
  if (c.daysAgoFinalized != null) {
    events.push({
      eventType: "MARKED_AWAITING_SIGNATURE",
      at: daysAgo(c.daysAgoFinalized),
      actorEmail: legalEmail,
      fromStatus: "IN_LEGAL_REVIEW",
      toStatus: "AWAITING_SIGNATURE",
      round: c.round ?? 1,
    });
  }

  // SIGNED_UPLOADED — terminal "Signed and Uploaded" event.
  if (c.daysAgoSigned != null) {
    events.push({
      eventType: "SIGNED_UPLOADED",
      at: daysAgo(c.daysAgoSigned),
      actorEmail: legalEmail,
      fromStatus: "AWAITING_SIGNATURE",
      toStatus: "OUT_FOR_SIGNING",
      round: c.round ?? 1,
    });
  }

  // CANCELLED
  if (c.daysAgoCancelled != null) {
    events.push({
      eventType: "CANCELLED",
      at: daysAgo(c.daysAgoCancelled),
      actorEmail: legalEmail,
      toStatus: "CANCELLED",
      round: c.round ?? 0,
      metadata: c.cancelReason ? { reason: c.cancelReason } : undefined,
    });
  }

  return events;
}

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // Users
  for (const u of seedUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        department: u.department,
        passwordHash,
        active: true,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        department: u.department,
        passwordHash,
      },
    });
  }
  console.log(`Seeded ${seedUsers.length} users (default password: ${DEFAULT_PASSWORD})`);

  // Holidays
  const holidayDates: Date[] = [];
  for (const h of holidays2026) {
    const date = new Date(`${h.date}T00:00:00.000Z`);
    holidayDates.push(date);
    await prisma.holiday.upsert({
      where: { date },
      update: { name: h.name, year: 2026 },
      create: { date, name: h.name, year: 2026 },
    });
  }
  console.log(`Seeded ${holidays2026.length} Thai 2026 holidays`);

  // Build email→user map
  const users = await prisma.user.findMany({
    select: { id: true, email: true, department: true },
  });
  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const legalReviewer = users.find((u) => u.email === "reviewer.legal@innopower.co.th");
  if (!legalReviewer) throw new Error("Seed user reviewer.legal not found");
  const legalReviewerEmail = legalReviewer.email;

  // Dedup by title (a stable identifier in the demo data) so re-running the
  // seed doesn't generate duplicate contracts. Numbers themselves are minted
  // on the fly, so they can't be used as the dedup key.
  const existing = await prisma.contract.findMany({
    select: { contractNumber: true, title: true },
  });
  const existingByTitle = new Set(existing.map((r) => r.title));
  // Running-number counter is shared per year. Seed minted numbers with what's
  // already in the DB so newly-added demo rows pick up sequence = max + 1.
  const mintedNumbers: string[] = existing.map((r) => r.contractNumber);

  let inserted = 0;
  let skipped = 0;
  for (const c of demo) {
    const owner = userByEmail.get(c.ownerEmail);
    if (!owner) throw new Error(`Demo owner ${c.ownerEmail} not found`);

    if (existingByTitle.has(c.title)) {
      skipped += 1;
      continue;
    }

    const startDate = daysAgo(c.daysAgoStarted);
    const year = startDate.getUTCFullYear();
    const teamCode = teamCodeFor(owner.department);
    const typeCode = contractTypeCode(c.type);
    // INQUIRY / POA / OFFICIAL_LETTER use the non-running format with a random
    // hex suffix; everything else shares one year-wide global counter.
    let contractNumber: string;
    if (contractTypeUsesSeparateSequence(c.type)) {
      contractNumber = formatNonRunningContractNumber({
        teamCode,
        typeCode,
        year,
        randomSuffix: randomHexSuffix(6),
      });
    } else {
      const sequence = nextSequenceFromAll(mintedNumbers, year);
      contractNumber = formatContractNumber({
        teamCode,
        typeCode,
        year,
        sequence,
      });
    }
    mintedNumbers.push(contractNumber);
    existingByTitle.add(c.title);

    const templateDate = c.daysAgoTemplate != null ? daysAgo(c.daysAgoTemplate) : null;
    const submittedAt = c.daysAgoSubmitted != null ? daysAgo(c.daysAgoSubmitted) : null;
    const returnedAt =
      submittedAt && c.returnedAfterDays != null
        ? new Date(submittedAt.getTime() + c.returnedAfterDays * 86400_000)
        : null;
    const finalizedDate = c.daysAgoFinalized != null ? daysAgo(c.daysAgoFinalized) : null;
    const signedDate = c.daysAgoSigned != null ? daysAgo(c.daysAgoSigned) : null;
    const round = c.round ?? 0;

    const contract = await prisma.contract.create({
      data: {
        contractNumber,
        title: c.title,
        type: c.type,
        complexity: c.complexity ?? null,
        counterparty: c.counterparty,
        currency: "THB",
        buOwnerId: owner.id,
        buDepartment: owner.department,
        status: c.status,
        currentRound: round,
        startDate,
        templateDate,
        finalizedDate,
        signedDate,
        notes: c.notes ?? null,
        cancelReason: c.cancelReason ?? null,
      },
    });

    if (submittedAt) {
      const baseDeadline = slaDeadlineFor(submittedAt, 7, holidayDates);
      const extDays = c.slaExtensionDays ?? 0;
      const slaDeadline =
        extDays > 0
          ? addBusinessDays(baseDeadline, extDays, holidayDates)
          : baseDeadline;
      const isReturned = returnedAt != null;
      let slaStatus: SLAStatus;
      if (isReturned && returnedAt) {
        slaStatus = returnedAt <= slaDeadline ? "COMPLETED" : "COMPLETED_LATE";
      } else {
        slaStatus = c.desiredSLA ?? "ON_TRACK";
      }
      await prisma.review.create({
        data: {
          contractId: contract.id,
          round,
          submittedAt,
          pickedUpAt: c.pickedUp ? new Date(submittedAt.getTime() + 60 * 60 * 1000) : null,
          assignedToId: c.pickedUp ? legalReviewer.id : null,
          returnedAt,
          slaDeadline,
          slaStatus,
          slaExtensionDays: extDays,
          legalNotes: isReturned ? "See attached reviewed draft" : null,
        },
      });
    }

    // Full event trail so the Timeline tab tells the contract's whole story.
    for (const e of buildEventTrail(c, legalReviewerEmail)) {
      const actor = userByEmail.get(e.actorEmail);
      if (!actor) continue;
      await prisma.event.create({
        data: {
          contractId: contract.id,
          actorId: actor.id,
          eventType: e.eventType,
          fromStatus: e.fromStatus ?? null,
          toStatus: e.toStatus ?? null,
          round: e.round ?? null,
          metadata: e.metadata
            ? (e.metadata as import("@prisma/client").Prisma.InputJsonValue)
            : undefined,
          createdAt: e.at,
        },
      });
    }

    inserted += 1;
  }

  console.log(`Seeded demo dataset: ${inserted} new contracts (${skipped} already existed)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

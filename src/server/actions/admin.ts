"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/permissions";
import { recomputeOpenSLA } from "@/lib/sla-recompute";

export type AdminResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  assertPermission(session.user.role, "admin:manage-users");
  return session.user;
}

// ───────────────────────────────────────────────────────────────────────────────
// Users
// ───────────────────────────────────────────────────────────────────────────────

// Passwords must be at least 10 characters and include both a letter and a
// digit. Catches the most common weak choices (all-numeric birthdays, single
// dictionary words) without being so strict that operators reach for sticky
// notes. Cap is 128 chars so bcrypt won't silently truncate.
const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password too long")
  .refine((p) => /[A-Za-z]/.test(p), "Password must contain a letter")
  .refine((p) => /\d/.test(p), "Password must contain a number");

const createUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["BU_MEMBER", "BU_MANAGER", "LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"]),
  department: z.string().trim().min(1).max(64),
  password: passwordSchema,
});

export async function createUser(
  input: z.input<typeof createUserSchema>,
): Promise<AdminResult<{ id: string }>> {
  try {
    await requireAdmin();
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const { email, name, role, department, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { success: false, error: "A user with this email already exists" };
    }
    const created = await prisma.user.create({
      data: { email, name, role, department, passwordHash, active: true },
      select: { id: true },
    });
    revalidatePath("/admin/users");
    return { success: true, data: { id: created.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setUserActive(input: {
  userId: string;
  active: boolean;
}): Promise<AdminResult> {
  try {
    const me = await requireAdmin();
    if (input.userId === me.id && !input.active) {
      return { success: false, error: "You cannot deactivate your own account" };
    }
    await prisma.user.update({
      where: { id: input.userId },
      data: { active: input.active },
    });
    revalidatePath("/admin/users");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["BU_MEMBER", "BU_MANAGER", "LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"]),
  department: z.string().trim().min(1).max(64),
  newPassword: passwordSchema.optional(),
});

export async function updateUser(
  input: z.input<typeof updateUserSchema>,
): Promise<AdminResult> {
  try {
    const me = await requireAdmin();
    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const { userId, name, role, department, newPassword } = parsed.data;

    // Prevent admins from accidentally locking themselves out by demoting
    // their own account.
    if (userId === me.id && role !== "ADMIN") {
      return { success: false, error: "You cannot remove your own admin role" };
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) {
      return { success: false, error: "User not found" };
    }

    const data: Record<string, unknown> = { name, role, department };
    if (newPassword) {
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    await prisma.user.update({ where: { id: userId }, data });
    revalidatePath("/admin/users");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Contract owner reassignment
// ───────────────────────────────────────────────────────────────────────────────

export type ContractForReassign = {
  id: string;
  contractNumber: string;
  title: string;
  status: string;
  currentOwner: { id: string; name: string } | null;
};

export async function getContractsForDepartment(
  department: string,
): Promise<AdminResult<ContractForReassign[]>> {
  try {
    await requireAdmin();
    const rows = await prisma.contract.findMany({
      where: { buDepartment: department, status: { not: "CANCELLED" } },
      select: {
        id: true,
        contractNumber: true,
        title: true,
        status: true,
        buOwner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        contractNumber: r.contractNumber,
        title: r.title,
        status: r.status,
        currentOwner: r.buOwner,
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reassignContractOwner(input: {
  contractId: string;
  newOwnerId: string;
}): Promise<AdminResult> {
  try {
    await requireAdmin();
    const [contract, newOwner] = await Promise.all([
      prisma.contract.findUnique({
        where: { id: input.contractId },
        select: { id: true, buDepartment: true },
      }),
      prisma.user.findUnique({
        where: { id: input.newOwnerId },
        select: { id: true, department: true, role: true, active: true },
      }),
    ]);
    if (!contract) return { success: false, error: "Contract not found" };
    if (!newOwner) return { success: false, error: "User not found" };
    if (!newOwner.active) return { success: false, error: "User is inactive" };
    if (newOwner.department !== contract.buDepartment) {
      return { success: false, error: "User is not in the same department as the contract" };
    }
    if (newOwner.role !== "BU_MEMBER" && newOwner.role !== "BU_MANAGER") {
      return { success: false, error: "User must be a BU member or manager" };
    }
    await prisma.contract.update({
      where: { id: input.contractId },
      data: { buOwnerId: input.newOwnerId },
    });
    revalidatePath("/admin/users");
    revalidatePath("/contracts");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Holidays
// ───────────────────────────────────────────────────────────────────────────────

const addHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  name: z.string().trim().min(1).max(120),
});

export async function addHoliday(
  input: z.input<typeof addHolidaySchema>,
): Promise<AdminResult> {
  try {
    await requireAdmin();
    const parsed = addHolidaySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const date = new Date(`${parsed.data.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      return { success: false, error: "Invalid date" };
    }
    const year = Number(parsed.data.date.slice(0, 4));
    await prisma.holiday.upsert({
      where: { date },
      update: { name: parsed.data.name, year },
      create: { date, name: parsed.data.name, year },
    });
    // Holiday change can shift any open review's deadline — propagate now so
    // the contracts list and legal-performance page reflect the new calendar
    // immediately.
    await recomputeOpenSLA();
    revalidatePath("/admin/holidays");
    revalidatePath("/contracts");
    revalidatePath("/legal-performance");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeHoliday(input: { date: string }): Promise<AdminResult> {
  try {
    await requireAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { success: false, error: "Date must be YYYY-MM-DD" };
    }
    const date = new Date(`${input.date}T00:00:00.000Z`);
    await prisma.holiday.delete({ where: { date } });
    await recomputeOpenSLA();
    revalidatePath("/admin/holidays");
    revalidatePath("/contracts");
    revalidatePath("/legal-performance");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const loadHolidaysSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

// Loads Thai public holidays from the bundled `date-holidays` library into
// the Holiday table for the given year. The library covers the fixed-date
// official holidays plus Buddhist lunar holidays (Makha Bucha, Vesak,
// Asalha Puja, Buddhist Lent) where its data tables have been pre-computed.
// It does NOT auto-generate substitution Mondays for holidays falling on
// weekends — the Thai cabinet announces those year-by-year, so admins should
// review the loaded list and add substitutions manually. Existing rows are
// left untouched so prior manual edits survive.
export async function loadHolidaysFromExternal(
  input: z.input<typeof loadHolidaysSchema>,
): Promise<
  AdminResult<{
    year: number;
    fetched: number;
    inserted: number;
    existing: number;
  }>
> {
  try {
    await requireAdmin();
    const parsed = loadHolidaysSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join("; "),
      };
    }
    const year = parsed.data.year;

    type HolidayLib = new (country: string) => {
      getHolidays(year: number): Array<{
        date: string | Date;
        name: string;
        type?: string;
      }>;
    };
    let entries: Array<{ date: string; name: string }> = [];
    try {
      const mod = await import("date-holidays");
      const Ctor = (mod.default ?? mod) as unknown as HolidayLib;
      const hd = new Ctor("TH");
      const list = hd.getHolidays(year);
      entries = list
        .filter((h) => h.type === "public" || h.type === "bank")
        .map((h) => {
          // Library returns either an ISO string ("YYYY-MM-DD HH:mm:ss") or
          // a Date — normalise to a YYYY-MM-DD key.
          const raw = typeof h.date === "string" ? h.date : h.date.toISOString();
          return { date: raw.slice(0, 10), name: h.name };
        })
        .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date));
    } catch (e) {
      return {
        success: false,
        error: `Failed to load holiday data (${
          e instanceof Error ? e.message : String(e)
        })`,
      };
    }

    let inserted = 0;
    let existing = 0;
    for (const h of entries) {
      const date = new Date(`${h.date}T00:00:00.000Z`);
      const found = await prisma.holiday.findUnique({
        where: { date },
        select: { date: true },
      });
      if (found) {
        existing += 1;
        continue;
      }
      await prisma.holiday.create({
        data: {
          date,
          name: h.name,
          year,
        },
      });
      inserted += 1;
    }

    revalidatePath("/admin/holidays");
    return {
      success: true,
      data: {
        year,
        fetched: entries.length,
        inserted,
        existing,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewContract } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const version = await prisma.version.findUnique({
    where: { id },
    include: {
      contract: { select: { buOwnerId: true, buDepartment: true } },
    },
  });
  if (!version) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = canViewContract(
    {
      id: session.user.id,
      role: session.user.role,
      department: session.user.department,
    },
    version.contract,
  );
  if (!allowed) {
    // 404 not 403 to avoid leaking existence.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await getStorage().getDownloadUrl(version.storageKey);
  return NextResponse.redirect(url, 302);
}

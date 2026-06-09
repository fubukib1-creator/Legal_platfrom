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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await getStorage().download(version.storageKey);

  if (result.type === "redirect") {
    return NextResponse.redirect(result.url, 302);
  }

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(version.fileName)}"`,
    },
  });
}

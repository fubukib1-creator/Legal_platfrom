import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { recomputeOpenSLA } from "@/lib/sla-recompute";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const summary = await recomputeOpenSLA(now);

  return NextResponse.json({
    ok: true,
    ...summary,
    ranAt: now.toISOString(),
  });
}

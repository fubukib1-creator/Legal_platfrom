import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { buildDailyDigests, renderDigestEmail } from "@/lib/notifications/digest";
import { sendEmail } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const digests = await buildDailyDigests(now);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const d of digests) {
    const { subject, html, text } = renderDigestEmail(d);
    const r = await sendEmail({ to: d.email, subject, html, text });
    if (r.skipped) skipped += 1;
    else if (r.ok) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    recipients: digests.length,
    sent,
    skipped,
    failed,
    ranAt: now.toISOString(),
  });
}

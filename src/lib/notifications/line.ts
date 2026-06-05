import "server-only";
import { prisma } from "@/lib/db";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

async function logLine(params: {
  recipient: string;
  body: string;
  contractId?: string;
  status: "sent" | "skipped" | "failed";
  errorMessage?: string;
}) {
  try {
    await prisma.notificationLog.create({
      data: {
        channel: "line",
        recipient: params.recipient,
        subject: null,
        body: params.body,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
        contractId: params.contractId ?? null,
      },
    });
  } catch {
    // best-effort
  }
}

// Push a text message via LINE Messaging API. No-op if LINE_CHANNEL_TOKEN is
// missing — production deployments without LINE configured won't error.
export async function sendLineMessage(
  lineUserId: string | null | undefined,
  text: string,
  contractId?: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!lineUserId) {
    await logLine({
      recipient: "(unset)",
      body: text,
      contractId,
      status: "skipped",
      errorMessage: "User has no lineUserId",
    });
    return { ok: true, skipped: true };
  }
  const token = process.env.LINE_CHANNEL_TOKEN;
  if (!token) {
    await logLine({
      recipient: lineUserId,
      body: text,
      contractId,
      status: "skipped",
      errorMessage: "LINE_CHANNEL_TOKEN not set",
    });
    return { ok: true, skipped: true };
  }

  try {
    const r = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text }],
      }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      await logLine({
        recipient: lineUserId,
        body: text,
        contractId,
        status: "failed",
        errorMessage: `LINE HTTP ${r.status}: ${errBody.slice(0, 500)}`,
      });
      return { ok: false, error: `HTTP ${r.status}` };
    }
    await logLine({ recipient: lineUserId, body: text, contractId, status: "sent" });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logLine({
      recipient: lineUserId,
      body: text,
      contractId,
      status: "failed",
      errorMessage: msg,
    });
    return { ok: false, error: msg };
  }
}

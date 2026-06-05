import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  contractId?: string;
};

let cached: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (cached !== undefined) return cached;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port) {
    cached = null;
    return null;
  }
  cached = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cached;
}

async function logResult(params: {
  recipients: string[];
  subject: string;
  body: string;
  contractId?: string;
  status: "sent" | "skipped" | "failed";
  errorMessage?: string;
}) {
  try {
    await prisma.notificationLog.createMany({
      data: params.recipients.map((r) => ({
        channel: "email",
        recipient: r,
        subject: params.subject,
        body: params.body,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
        contractId: params.contractId ?? null,
      })),
    });
  } catch {
    // Logging must never break the caller — swallow.
  }
}

// Sends an email via SMTP if configured. When SMTP is not configured (typical
// in dev), records the would-be send to NotificationLog with status="skipped"
// and returns success — callers don't need to special-case the dev environment.
export async function sendEmail(msg: EmailMessage): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
  if (recipients.length === 0) return { ok: true };

  const transport = getTransport();
  const from = process.env.SMTP_FROM ?? "innopower-legal@example.com";

  if (!transport) {
    await logResult({
      recipients,
      subject: msg.subject,
      body: msg.text ?? msg.html,
      contractId: msg.contractId,
      status: "skipped",
      errorMessage: "SMTP not configured",
    });
    return { ok: true, skipped: true };
  }

  try {
    await transport.sendMail({
      from,
      to: recipients,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    await logResult({
      recipients,
      subject: msg.subject,
      body: msg.text ?? msg.html,
      contractId: msg.contractId,
      status: "sent",
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await logResult({
      recipients,
      subject: msg.subject,
      body: msg.text ?? msg.html,
      contractId: msg.contractId,
      status: "failed",
      errorMessage: error,
    });
    return { ok: false, error };
  }
}

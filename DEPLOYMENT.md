# Deployment guide

This document covers the operational pieces of taking contractflow from a developer laptop to a production deployment. The app itself is platform-agnostic Next.js — it runs on Vercel, Render, Fly, a Hetzner box, or anywhere else that hosts Node 20+.

---

## 1. Pick a hosting target

| Target | Notes |
|---|---|
| **Vercel** | Easiest. Use Vercel Cron for the recalc + digest endpoints. Use a managed Postgres (Vercel Marketplace / Neon). |
| **Self-hosted (single VM)** | Run with `pnpm build && pnpm start` behind nginx. Use `node-cron` worker for cron jobs. Bring your own Postgres + R2/MinIO. |
| **Container** | A `Dockerfile` is not yet provided — the standard Next.js production build (`pnpm build` → `.next/`) plus `node_modules` is enough. |

**Node version:** 20.9+. We test on 24.x.

---

## 2. PostgreSQL

Any Postgres 14+ works. The schema is small and the workload is read-heavy.

- **Managed**: Neon, Supabase, RDS, Vercel Postgres replacement (Neon under the hood). Pick one in the same region as the app.
- **Self-hosted**: Postgres 16 in Docker is what `docker-compose.yml` does for dev. For prod use a managed daily-backup setup or run pgBackRest.

Set `DATABASE_URL` to the connection string. Run migrations on deploy:
```
pnpm prisma migrate deploy
```

The seed script is dev-only — don't run it in production.

---

## 3. Object storage (Cloudflare R2)

The app writes and reads contract files via the `S3StorageService` (`src/lib/storage.ts`). Production target is **Cloudflare R2** because it's S3-compatible and has zero egress fees.

### One-time R2 setup

1. Create an R2 bucket (e.g. `contractflow-prod`)
2. Create an R2 API token with **Object Read & Write** for that bucket
3. Note the account ID — endpoint will be `https://<account_id>.r2.cloudflarestorage.com`
4. Set the env vars:
   ```
   S3_ENDPOINT="https://<account_id>.r2.cloudflarestorage.com"
   S3_REGION="auto"
   S3_BUCKET="contractflow-prod"
   S3_ACCESS_KEY="<token access key>"
   S3_SECRET_KEY="<token secret key>"
   S3_FORCE_PATH_STYLE="false"
   ```
5. Lifecycle: enable "Move noncurrent versions to Infrequent Access after 30 days" if you want cost optimization. Do **not** auto-delete — contract files are records of record.

The app does not need a public bucket. Downloads go through `/api/versions/[id]/download`, which issues short-lived (15 min) presigned GETs.

---

## 4. Email — Microsoft 365 SMTP relay

The plan calls for outbound email via the corporate M365 tenant. Set up a dedicated mailbox (e.g. `contractflow@innopower.co.th`) and either:

**Option A — direct SMTP submission (preferred):**
```
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="contractflow@innopower.co.th"
SMTP_PASS="<app password>"   # see https://aka.ms/CreateAppPassword (requires modern auth + MFA)
SMTP_FROM="contractflow@innopower.co.th"
```

**Option B — connector-based relay**: configure an unauthenticated SMTP relay connector in M365 Exchange Admin Center, restrict to the app server's static IP, then leave `SMTP_USER`/`SMTP_PASS` empty.

**Failure mode**: if SMTP is misconfigured or unreachable, the email module logs `status="failed"` to `NotificationLog` and returns `{ ok: false, error }`. The app never throws on a notification failure.

---

## 5. LINE Messaging API (optional)

Plan §9.2 — LINE Notify is deprecated; use the Messaging API.

1. In the LINE Developers Console, create a Messaging API channel for the workspace
2. Get the channel access token (long-lived) and set `LINE_CHANNEL_TOKEN`
3. Each user who wants LINE notifications must link their account — for v1 this is manual: an admin updates `User.lineUserId` to the user's LINE userId, obtained when they first message the bot

If `LINE_CHANNEL_TOKEN` is empty, LINE pushes are no-op and logged with `status="skipped"`.

---

## 6. NextAuth secrets

```
AUTH_SECRET="<32 bytes base64>"
NEXTAUTH_SECRET="<same value as AUTH_SECRET>"   # back-compat with v4-style env name
NEXTAUTH_URL="https://contractflow.example.com"
AUTH_TRUST_HOST="true"
```

When ready for SSO, swap the `Credentials` provider in `src/lib/auth.ts` for an Entra ID OIDC provider — the `Session.user` shape (`id`, `role`, `department`) is what the rest of the app reads, so the swap is local.

---

## 7. Cron jobs

Two endpoints, both gated by `CRON_SECRET`:

| Endpoint | Recommended schedule | Header |
|---|---|---|
| `/api/cron/sla-recalc` | `0 8-18 * * 1-5` (every hour business hours) + `0 0 * * *` (nightly catch-up) | `authorization: Bearer ${CRON_SECRET}` |
| `/api/cron/digest` | `30 1 * * 1-5` (08:30 Bangkok = 01:30 UTC) | same |

### Vercel
Drop a `vercel.json` (or `vercel.ts`):
```jsonc
{
  "crons": [
    { "path": "/api/cron/sla-recalc", "schedule": "0 8-18 * * 1-5" },
    { "path": "/api/cron/digest",     "schedule": "30 1 * * 1-5" }
  ]
}
```
Vercel Cron sends the request without your `CRON_SECRET` header — set the secret as `CRON_SECRET` in project env vars and use Vercel's `x-vercel-cron-signature` instead, or front the cron with a small wrapper that injects the bearer token.

### Self-hosted
Use the OS scheduler (cron, systemd timer) or `node-cron` (already in `package.json`):
```bash
curl -fsSL -H "authorization: Bearer $CRON_SECRET" https://contractflow.example.com/api/cron/sla-recalc
```

### Secret rotation
1. Generate new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Update `CRON_SECRET` in your hosting env (and the cron scheduler's header)
3. Redeploy
4. Old secret instantly stops working — no grace period needed since cron is idempotent

---

## 8. Backup strategy

**Database (PostgreSQL):**
- Managed providers (Neon/RDS/Supabase) include daily snapshots — ensure 7+ days retention
- Self-hosted: `pg_dump` daily to S3/R2 with at least 30 days retention
- Test restore quarterly (the contract dataset is small enough for a full restore drill)

**Object storage (R2):**
- R2 supports **Object Versioning** — enable it. Stores prior versions of every key, recoverable for 30 days
- Storage keys are deterministic (`contracts/{contractId}/r{round}/{stage}-{ts}-{filename}`) so you can correlate DB + bucket easily during recovery

**App secrets:**
- Store env vars in your hosting platform's secrets store (Vercel Env, AWS SM, 1Password Secrets Automation)
- Keep an offline copy of `AUTH_SECRET` and `CRON_SECRET` somewhere recoverable — losing `AUTH_SECRET` invalidates every active session

---

## 9. Operational checks

**Daily:**
- Check `/api/cron/sla-recalc` and `/api/cron/digest` ran successfully (responses logged in your platform's cron log)

**Weekly:**
- Query `NotificationLog` for `status='failed'` to spot SMTP/LINE outages:
  ```sql
  SELECT channel, COUNT(*), MIN(\"sentAt\"), MAX(\"sentAt\")
  FROM \"NotificationLog\" WHERE status='failed' AND \"sentAt\" > NOW() - INTERVAL '7 days'
  GROUP BY channel;
  ```

**Monthly:**
- Verify the holiday calendar (`/admin/holidays`) covers the next 12 months
- Audit `User` table for stale accounts: `SELECT * FROM "User" WHERE "active"=true AND "createdAt" < NOW() - INTERVAL '1 year' AND id NOT IN (SELECT DISTINCT "actorId" FROM "Event" WHERE "createdAt" > NOW() - INTERVAL '90 days');`

**Yearly:**
- Add the next year's Thai public holidays via `/admin/holidays` before 1 December

---

## 10. Observability

The app does no special instrumentation in v1 — rely on:
- **Platform logs** (Vercel Functions logs, journalctl, etc.) for HTTP request and error logs
- **NotificationLog table** for outbound message audit trail
- **Event table** for the user-facing audit timeline (already shown in the contract detail Timeline tab)

If you want APM, OpenTelemetry plays nicely with Next.js — instrument later if needed.

---

## End of guide

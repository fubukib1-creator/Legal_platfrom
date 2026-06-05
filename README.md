# contractflow

Contract management webapp for INNOPOWER Digital. Built per `Contract Management System — Claude Code Build Plan`.

**Stack:** Next.js 16 (App Router) · TypeScript · Prisma 7 (with `@prisma/adapter-pg`) · PostgreSQL 16 · MinIO/R2 · NextAuth.js v5 · Tailwind CSS v4 · shadcn/ui · Vitest · Playwright

---

## Quick start (5 minutes)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env and start local services
cp .env.example .env.local                         # already present in this repo
docker compose up -d                               # postgres on :5433, MinIO on :9100/9101

# 3. Migrate + seed
pnpm db:migrate                                    # creates schema
pnpm db:seed                                       # users, holidays, 34 demo contracts

# 4. Run
pnpm dev                                           # http://localhost:3001
                                                   # (port pinned in package.json — change here if 3001 is taken)
```

Sign in at `/login` with any seeded user (default password `Password123!`):

| Email                                  | Role            | What they see                  |
|----------------------------------------|-----------------|--------------------------------|
| admin@innopower.co.th                  | ADMIN           | Everything + Admin pages       |
| lead.legal@innopower.co.th             | LEGAL_LEAD      | All contracts + dashboard      |
| reviewer.legal@innopower.co.th         | LEGAL_REVIEWER  | All contracts + dashboard      |
| manager.epc@innopower.co.th            | BU_MANAGER      | All EPC dept contracts         |
| member.epc@innopower.co.th             | BU_MEMBER       | Only own EPC contracts         |
| member.commercial@innopower.co.th      | BU_MEMBER       | Only own Commercial contracts  |

---

## Architecture overview

### Repo layout
```
src/
├── app/
│   ├── (auth)/login/                   # unauthenticated routes
│   ├── (app)/                          # authed shell with role-aware nav
│   │   ├── dashboard/                  # KPIs, stage pipeline, queue
│   │   ├── contracts/                  # list + new + [id]
│   │   └── admin/                      # users + holidays (ADMIN only)
│   └── api/
│       ├── auth/[...nextauth]/         # NextAuth handler
│       ├── versions/[id]/download/     # presigned-URL redirect
│       ├── export/contracts.csv/       # CSV export (LEGAL_LEAD/ADMIN)
│       └── cron/{sla-recalc,digest}/   # cron endpoints
├── components/
│   ├── ui/                             # shadcn primitives
│   ├── contract/                       # StatusBadge, SLABadge, EventTimeline, ContractActionPanel
│   ├── dashboard/                      # KPITile, StagePipeline
│   └── shared/                         # AppShell, Providers, Skeleton
├── lib/
│   ├── auth.ts                         # NextAuth v5 config + module augmentation
│   ├── db.ts                           # Prisma 7 client w/ pg adapter
│   ├── storage.ts                      # S3 abstraction (MinIO + R2)
│   ├── business-days.ts                # Bangkok TZ holiday-aware date math
│   ├── sla.ts                          # SLA computation + badge formatter
│   ├── permissions.ts                  # role matrix + scope checks
│   ├── state-machine.ts                # 10 transitions, pure
│   ├── contract-actions-registry.ts    # availableActionsFor (UI dispatcher)
│   ├── contract-number.ts              # CTR-YYYY-NNNN generator
│   ├── cron-auth.ts                    # CRON_SECRET verifier
│   └── notifications/                  # email, LINE, sla-alerts, digest
├── server/
│   ├── actions/                        # contracts.ts, admin.ts, upload-helper.ts
│   └── queries/                        # contracts.ts, dashboard.ts (scope-aware)
└── types/
```

### Key modules

| Concern | File | Notes |
|---|---|---|
| State machine | `src/lib/state-machine.ts` | Pure. 10 transitions, role + status guard. |
| Permissions | `src/lib/permissions.ts` | Role × permission matrix + row scoping. |
| SLA math | `src/lib/business-days.ts` + `src/lib/sla.ts` | Bangkok TZ; per-request memoised holiday list. |
| File upload | `src/server/actions/upload-helper.ts` | Validates size/mime, S3 upload, returns Version data. |
| Server actions | `src/server/actions/contracts.ts` | One async function per transition. Returns discriminated `{success, data} \| {success, error}`. |
| Cron | `src/app/api/cron/{sla-recalc,digest}/route.ts` | Protected by `CRON_SECRET` (Bearer header). |

---

## Scripts

| Command                    | What it does                                      |
|----------------------------|---------------------------------------------------|
| `pnpm dev`                 | Next.js dev server (Turbopack)                    |
| `pnpm build` / `pnpm start`| Production build / serve                          |
| `pnpm typecheck`           | `tsc --noEmit`                                    |
| `pnpm lint`                | ESLint flat config                                |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests (~111 tests)              |
| `pnpm db:migrate`          | `prisma migrate dev`                              |
| `pnpm db:push`             | `prisma db push` (no migration file)              |
| `pnpm db:seed`             | Run `prisma/seed.ts`                              |
| `pnpm db:studio`           | Prisma Studio                                     |
| `pnpm sla:recalc`          | Hit `/api/cron/sla-recalc` locally                |

---

## Environment variables

All variables live in `.env.local` for development. See `.env.example` for the full list.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | yes | 32-byte random base64 |
| `NEXTAUTH_URL` | yes | App's external URL (used in emails + LINE messages) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` | yes | MinIO locally, Cloudflare R2 in prod |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | optional | Empty in dev → emails are logged to `NotificationLog` with `status="skipped"` |
| `LINE_CHANNEL_TOKEN` | optional | Empty → LINE pushes are skipped + logged |
| `APP_TIMEZONE` | default `Asia/Bangkok` | Currently hard-coded; this var is informational |
| `SLA_BUSINESS_DAYS` | default `7` | Used by `submitForReview` |
| `CRON_SECRET` | yes for cron | Required to call `/api/cron/*` endpoints |

Generate secrets with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## How to use the app

### As a BU member
1. **Register** a contract at `/contracts/new`
2. Wait for legal to assign a template (status: `REGISTERED` → `DRAFTING`)
3. Open the contract detail page, click **Submit for review**, attach the draft
4. Once legal returns it (status: `REVIEW_RETURNED`), three options appear:
   - **Resubmit to legal** (round increments)
   - **Send to counterparty** (status: `WITH_COUNTERPARTY`)
   - **Mark final** (skip CP step)
5. After CP replies, click **Record CP reply** and attach their version
6. Click **Mark final** with the agreed draft
7. Once signed, click **Upload signed PDF** (PDF only). Status moves to `COMPLETED`.

### As legal
1. Open `/contracts` to see the queue (filter by `IN_LEGAL_REVIEW` for the active review pipeline; check `/legal-performance` for SLA metrics)
2. Click an `IN_LEGAL_REVIEW` contract — opening it auto-claims pickup (one event per round, idempotent if multiple legal users open at once)
3. Click **Return with comments**, attach the reviewed version. Late returns are flagged `COMPLETED_LATE` automatically.

### As admin
- `/admin/users` — add accounts, deactivate (you can't deactivate yourself)
- `/admin/holidays` — add or remove dates that affect SLA business-day math

---

## Cron jobs

Two endpoints, both gated by `CRON_SECRET`:

| Endpoint | Schedule | What it does |
|---|---|---|
| `/api/cron/sla-recalc` | Hourly during business hours (08:00–18:00 Bangkok), once daily otherwise | Recomputes `Review.slaStatus`. Fires email + LINE alerts on transitions ON_TRACK→WARNING and *→BREACHED per plan §9.1 |
| `/api/cron/digest` | 08:30 Bangkok every weekday | Builds per-user digests of items needing attention and sends them via email |

Schedule them with Vercel Cron or any external scheduler. Calls require:
```
authorization: Bearer ${CRON_SECRET}
# or
x-cron-secret: ${CRON_SECRET}
```

To trigger locally: `pnpm sla:recalc`.

---

## Acceptance test (the happy path)

1. Sign in as `member.epc@innopower.co.th` and create a contract
2. Sign in as `reviewer.legal@innopower.co.th`, open it, attach a template (any docx/pdf)
3. Back as the BU member, submit a draft
4. Sign in as legal — pickup is auto, then return with a reviewed file
5. As BU, send to counterparty, then record their reply, then mark final, then upload a signed PDF

Verifies: state machine guards every transition, scope filtering hides cross-BU contracts, every step writes an Event row, all uploaded files are downloadable via presigned URL.

---

## See also

- `DEPLOYMENT.md` — production deployment notes (R2, M365 SMTP, secret rotation, backups)
- The build plan in `Contract Management System — Claude Code Build Plan` (project root)

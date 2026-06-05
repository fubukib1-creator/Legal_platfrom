import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.join(process.cwd(), ".env.local"), override: false });
loadEnv({ path: path.join(process.cwd(), ".env"), override: false });

const baseUrl = process.env.SLA_RECALC_URL ?? "http://localhost:3000/api/cron/sla-recalc";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET is required");
  process.exit(1);
}

async function main() {
  const r = await fetch(baseUrl, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await r.text();
  console.log(`HTTP ${r.status}`);
  console.log(body);
  if (!r.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

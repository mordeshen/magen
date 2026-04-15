// Smoke test endpoint — בודק את כל המרכיבים הקריטיים בצד השרת
// מופעל מ-GitHub Actions cron כל 5 דק'
// הגנה: CRON_SECRET header או query param
// rate-limiting: לא שולח Telegram על אותו כשל יותר מפעם ב-15 דק'

import { getAdminSupabase } from "./lib/supabase-admin";
import { alertDev } from "./lib/alert";

const CRON_SECRET = process.env.CRON_SECRET;
const RATE_LIMIT_MS = 15 * 60 * 1000; // 15 דק'

// state בזיכרון — אם האינסטנס עולה מחדש, מאפס. זה בסדר, לא נורא.
const lastAlertAt = new Map(); // key → timestamp

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://shikum.org";

async function runChecks() {
  const checks = [];
  const add = (name, ok, info = "") => checks.push({ name, ok, info });

  // 1. Supabase
  try {
    const sb = getAdminSupabase();
    const { error } = await sb.from("profiles").select("id", { count: "exact", head: true });
    if (error) throw error;
    add("supabase", true);
  } catch (e) {
    add("supabase", false, e.message || "unknown");
  }

  // 2. Supabase Auth (דרך HTTP — בדיוק מה שהלקוח רואה)
  try {
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const r = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anon },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    add("supabase-auth", true);
  } catch (e) {
    add("supabase-auth", false, e.message);
  }

  // 3. Anthropic
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    add("anthropic", r.ok || r.status < 500, r.ok ? "" : `http ${r.status}`);
  } catch (e) {
    add("anthropic", false, e.message);
  }

  // 4. Plans endpoint (מוודא שהאתר עצמו חי)
  try {
    const r = await fetch(`${BASE}/api/plans`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const body = await r.json();
    if (!Array.isArray(body) || body.length === 0) throw new Error("empty plans");
    add("plans-endpoint", true);
  } catch (e) {
    add("plans-endpoint", false, e.message);
  }

  // 5. Homepage (מוודא SSR עובד)
  try {
    const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
    add("homepage", true);
  } catch (e) {
    add("homepage", false, e.message);
  }

  return checks;
}

export default async function handler(req, res) {
  // אימות
  const provided = req.headers["x-cron-secret"] || req.query.secret;
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const checks = await runChecks();
  const failed = checks.filter(c => !c.ok);
  const allOk = failed.length === 0;

  // Telegram alert עם rate-limiting
  if (!allOk) {
    const failKey = failed.map(f => f.name).sort().join(",");
    const last = lastAlertAt.get(failKey) || 0;
    const now = Date.now();

    if (now - last > RATE_LIMIT_MS) {
      lastAlertAt.set(failKey, now);
      const summary = failed.map(f => `❌ ${f.name}${f.info ? `: ${f.info}` : ""}`).join("\n");
      await alertDev("smoke-test", `${failed.length} בדיקות נפלו`, {
        extra: summary,
      });
    }
  }

  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    checks,
    failed: failed.length,
    timestamp: new Date().toISOString(),
  });
}

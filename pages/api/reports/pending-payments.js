// Pending payments report — בודק עסקאות שלא הושלמו
// GitHub Actions cron → כל 30 דק'
// שולח Telegram רק אם יש עסקאות תקועות > 10 דק' (שלא התעכבו רק מרעש)

import { getAdminSupabase } from "../lib/supabase-admin";
import { alertDev } from "../lib/alert";

const CRON_SECRET = process.env.CRON_SECRET;
const STUCK_AFTER_MIN = 10;
const STUCK_BEFORE_HOURS = 24; // אם ישן יותר מיום — נזנח, לא התראה דחופה
const SKIP_PLAN_IDS = ["test"];
const SKIP_EMAILS = ["mordechay.shenvald@gmail.com"]; // admin test emails

export default async function handler(req, res) {
  const provided = req.headers["x-cron-secret"] || req.query.secret;
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const sb = getAdminSupabase();
  const now = Date.now();
  const cutoffStart = new Date(now - STUCK_AFTER_MIN * 60 * 1000).toISOString();
  const cutoffEnd = new Date(now - STUCK_BEFORE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: stuck, error } = await sb
    .from("pending_purchases")
    .select("id, email, plan_id, amount, created_at")
    .eq("fulfilled", false)
    .lt("created_at", cutoffStart)
    .gt("created_at", cutoffEnd)
    .not("plan_id", "in", `(${SKIP_PLAN_IDS.map(p => `"${p}"`).join(",")})`)
    .not("email", "in", `(${SKIP_EMAILS.map(e => `"${e}"`).join(",")})`)
    .order("created_at", { ascending: true });

  if (error) {
    await alertDev("pending-payments", "שגיאה בשליפת pending_purchases", { error: error.message });
    return res.status(500).json({ error: error.message });
  }

  if (stuck && stuck.length > 0) {
    const lines = stuck.slice(0, 10).map(p => {
      const mins = Math.round((Date.now() - new Date(p.created_at).getTime()) / 60000);
      const email = (p.email || "").replace(/(.{2}).+(@.+)/, "$1***$2");
      return `• ${email} — ${p.plan_id} — ${(p.amount / 100).toFixed(0)}₪ — תקוע ${mins} דק׳`;
    });
    const more = stuck.length > 10 ? `\n... ועוד ${stuck.length - 10}` : "";

    await alertDev("pending-payments", `${stuck.length} תשלומים תקועים (>${STUCK_AFTER_MIN} דק׳)`, {
      extra: lines.join("\n") + more,
    });
  }

  res.status(200).json({ stuck_count: stuck?.length || 0, checked_at: new Date().toISOString() });
}

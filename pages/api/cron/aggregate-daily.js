import { getAdminSupabase } from "../lib/supabase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const secret = req.headers["x-cron-secret"] || req.query.secret;
  if (secret !== process.env.FEEDBACK_CRON_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const admin = getAdminSupabase();
    const targetDate = req.body?.date || new Date(Date.now() - 86400000).toISOString().split("T")[0];

    const { error } = await admin.rpc("aggregate_daily_analytics", {
      target_date: targetDate,
    });

    if (error) throw error;

    return res.json({ ok: true, date: targetDate });
  } catch (err) {
    console.error("[cron/aggregate-daily] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

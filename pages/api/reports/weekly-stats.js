// Weekly stats report — מספרים כלליים על המערכת
// GitHub Actions cron → פעם בשבוע (ראשון 10:00 לפי cron UTC)
// שולח Telegram תמיד, כולל כשהכל תקין — זה דוח, לא אזעקה.

import { getAdminSupabase } from "../lib/supabase-admin";
import { alertDev } from "../lib/alert";

const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
  const provided = req.headers["x-cron-secret"] || req.query.secret;
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const sb = getAdminSupabase();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // קריאות במקביל
  const [
    totalUsers,
    newUsersWeek,
    totalSubs,
    paidSubs,
    chatSessionsWeek,
    whatsappMsgsWeek,
    completedPaymentsWeek,
    stuckPayments,
  ] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    sb.from("user_subscriptions").select("id", { count: "exact", head: true }),
    sb.from("user_subscriptions").select("id", { count: "exact", head: true }).neq("plan_id", "free"),
    sb.from("chat_sessions").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    sb.from("whatsapp_conversations").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    sb.from("pending_purchases").select("id", { count: "exact", head: true }).eq("fulfilled", true).gte("created_at", weekAgo),
    sb.from("pending_purchases").select("id", { count: "exact", head: true }).eq("fulfilled", false),
  ]);

  const stats = {
    total_users: totalUsers.count ?? 0,
    new_users_this_week: newUsersWeek.count ?? 0,
    total_subscriptions: totalSubs.count ?? 0,
    paid_subscriptions: paidSubs.count ?? 0,
    chat_sessions_this_week: chatSessionsWeek.count ?? 0,
    whatsapp_msgs_this_week: whatsappMsgsWeek.count ?? 0,
    completed_payments_this_week: completedPaymentsWeek.count ?? 0,
    stuck_pending_payments: stuckPayments.count ?? 0,
  };

  const message = [
    `📊 *דוח שבועי*`,
    ``,
    `👥 משתמשים: *${stats.total_users}* (+${stats.new_users_this_week} השבוע)`,
    `💳 מנויים: *${stats.total_subscriptions}* (בתשלום: ${stats.paid_subscriptions})`,
    ``,
    `💬 שיחות באתר השבוע: *${stats.chat_sessions_this_week}*`,
    `📱 הודעות וואטסאפ השבוע: *${stats.whatsapp_msgs_this_week}*`,
    ``,
    `✅ תשלומים השבוע: *${stats.completed_payments_this_week}*`,
    stats.stuck_pending_payments > 0 ? `⚠️ תשלומים תקועים: *${stats.stuck_pending_payments}*` : `✅ אין תשלומים תקועים`,
  ].join("\n");

  // שולח ישירות בלי prefix של alertDev (זה דוח, לא אזעקה)
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: message, parse_mode: "Markdown" }),
    });
  } else {
    console.warn("[weekly-stats] Telegram not configured");
  }

  res.status(200).json(stats);
}

/**
 * API Route: סיכום פידבקים יומי למייל
 *
 * GET /api/feedback-digest  (Authorization: Bearer SECRET)
 *
 * קורא פידבקים מ-24 שעות אחרונות ושולח סיכום למייל.
 * מיועד להפעלה ע"י cron job (Railway / external cron).
 *
 * ENV vars needed:
 *   SUPABASE_SERVICE_ROLE_KEY — service role (not anon!) to bypass RLS
 *   FEEDBACK_CRON_SECRET — secret key to protect this endpoint
 *   ADMIN_EMAIL — email to send digest to
 *   RESEND_API_KEY — Resend.com API key for sending emails
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export default async function handler(req, res) {
  // Auth check — Bearer token via Authorization header (timing-safe)
  const secret = process.env.FEEDBACK_CRON_SECRET;
  const authHeader = req.headers.authorization || "";
  const expected = `Bearer ${secret}`;
  if (!secret || authHeader.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminEmail = process.env.ADMIN_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;

  if (!serviceKey || !supabaseUrl) {
    console.error("feedback-digest: missing env vars (db)");
    return res.status(500).json({ error: "server configuration error" });
  }
  if (!adminEmail || !resendKey) {
    console.error("feedback-digest: missing env vars (mail)");
    return res.status(500).json({ error: "server configuration error" });
  }

  // Query feedback from last 24 hours using service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, serviceKey);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: feedbacks, error } = await supabase
    .from("feedback")
    .select("id, message, contact_email, contact_phone, page, created_at, user_id")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("feedback-digest: supabase query failed:", error.message);
    return res.status(500).json({ error: "failed to fetch feedback" });
  }

  if (!feedbacks || feedbacks.length === 0) {
    return res.status(200).json({ message: "no new feedback", count: 0 });
  }

  // Build email body
  const lines = feedbacks.map((fb, i) => {
    const time = new Date(fb.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const contact = [
      fb.contact_email ? `מייל: ${fb.contact_email}` : null,
      fb.contact_phone ? `טלפון: ${fb.contact_phone}` : null,
    ].filter(Boolean).join(" | ");

    return `
━━━ פידבק #${i + 1} ━━━
🕐 ${time}
${fb.page ? `📄 עמוד: ${fb.page}` : ""}
${contact ? `📬 ${contact}` : "👤 אנונימי"}
${fb.user_id ? `🔗 user: ${fb.user_id}` : ""}

${fb.message}
`;
  }).join("\n");

  const subject = `מגן — ${feedbacks.length} פידבק${feedbacks.length > 1 ? "ים" : ""} חדש${feedbacks.length > 1 ? "ים" : ""}`;

  const htmlBody = `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0c1018;color:#eef1f6;padding:24px;border-radius:12px;">
  <h2 style="color:#f4a24e;margin-bottom:4px;">🛡️ מגן — סיכום פידבקים יומי</h2>
  <p style="color:#8a95a7;font-size:14px;margin-bottom:24px;">${feedbacks.length} פידבק${feedbacks.length > 1 ? "ים" : ""} מ-24 שעות אחרונות</p>

  ${feedbacks.map((fb, i) => {
    const time = new Date(fb.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const contact = [
      fb.contact_email ? `<a href="mailto:${fb.contact_email}" style="color:#4a8fdd;">${fb.contact_email}</a>` : null,
      fb.contact_phone ? `<a href="tel:${fb.contact_phone}" style="color:#4a8fdd;">${fb.contact_phone}</a>` : null,
    ].filter(Boolean).join(" &nbsp;|&nbsp; ");

    return `
    <div style="background:#141c26;border:1px solid #1e2835;border-radius:10px;padding:16px 20px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:#8a95a7;font-size:12px;">🕐 ${time}</span>
        <span style="color:#556070;font-size:11px;">#${i + 1}</span>
      </div>
      <p style="color:#eef1f6;font-size:15px;line-height:1.6;margin:0 0 10px;">${fb.message.replace(/\n/g, "<br/>")}</p>
      ${contact ? `<p style="color:#8a95a7;font-size:13px;margin:0;">📬 ${contact}</p>` : '<p style="color:#556070;font-size:12px;margin:0;">👤 אנונימי — לא השאיר פרטים</p>'}
    </div>`;
  }).join("")}

  <p style="color:#556070;font-size:11px;text-align:center;margin-top:20px;">נשלח אוטומטית מ-מגן</p>
</div>`;

  // Send via Resend
  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "מגן <feedback@resend.dev>",
        to: [adminEmail],
        subject,
        html: htmlBody,
        text: `מגן — סיכום פידבקים יומי\n\n${lines}`,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("feedback-digest: email send failed:", err);
      return res.status(500).json({ error: "email send failed" });
    }

    return res.status(200).json({ message: "digest sent", count: feedbacks.length });
  } catch (err) {
    console.error("feedback-digest: unexpected error:", err.message);
    return res.status(500).json({ error: "internal error" });
  }
}

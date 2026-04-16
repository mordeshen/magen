// Abandoned-cart reminder — שולח מייל למשתמשים שהתחילו רכישה ולא השלימו.
// GitHub Actions → כל שעה.
//
// לוגיקה:
//   1. מוצא pending_purchases: fulfilled=false, 1–24h ישנים, reminder_sent_at IS NULL,
//      מסנן admin/test כמו ב-pending-payments.js.
//   2. שולח מייל חם דרך Resend מ-noreply@shikum.org.
//   3. מסמן reminder_sent_at = NOW() כדי לא לשלוח פעמיים.
//   4. אם ישן מעל 24 שעות — מסמן fulfilled=true (abandoned, להפסיק להתריע).
//
// לא תלוי במוניטור pending-payments — לוגיקה נפרדת (זה מייל ללקוח, לא Telegram לדב).

import { getAdminSupabase } from "../lib/supabase-admin";
import { alertDev } from "../lib/alert";

const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "מגן <noreply@shikum.org>";
const REPLY_TO = "mordechay.shenvald@gmail.com";

const REMINDER_MIN_AGE_MIN = 60;         // שולחים אחרי שעה
const REMINDER_MAX_AGE_HOURS = 24;        // לא שולחים מעל 24 שעות (מסמן abandoned)
const SKIP_PLAN_IDS = ["test"];
const SKIP_EMAILS = ["mordechay.shenvald@gmail.com"];

function planLabel(planId) {
  return { one_time: "רכישה חד-פעמית", monthly: "מנוי חודשי", annual: "מנוי שנתי" }[planId] || planId;
}

function emailHtml({ planId, amount }) {
  const price = (amount / 100).toFixed(0);
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<body style="margin:0;padding:32px 16px;background:#f5f3ef;font-family:'Heebo',Arial,sans-serif;color:#1a1915;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;padding:40px 32px;border-radius:4px;border:1px solid #d8d3c9;">
    <h1 style="font-size:22px;margin:0 0 24px;font-weight:700;color:#1a1915;">השלמת הרכישה ב-מגן</h1>

    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">שלום,</p>

    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">
      ראיתי שהתחלת ${planLabel(planId)} ב-מגן (${price}₪), אבל התהליך לא הסתיים.
    </p>

    <p style="font-size:16px;line-height:1.7;margin:0 0 24px;">
      אם היו התלבטויות או שאלות — אני כאן, בלי מחויבות. אפשר פשוט להשיב למייל הזה ואחזור אליך אישית.
    </p>

    <div style="margin:32px 0;">
      <a href="https://shikum.org/pricing?plan=${encodeURIComponent(planId)}"
         style="display:inline-block;padding:14px 28px;background:#b8693f;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:2px;">
        המשך הרכישה
      </a>
    </div>

    <p style="font-size:14px;line-height:1.6;margin:0;color:#556070;">
      אם שינית את דעתך — אין צורך לעשות דבר. המייל הזה נשלח פעם אחת בלבד.
    </p>

    <hr style="border:none;border-top:1px solid #e8e3d8;margin:32px 0 16px;" />

    <p style="font-size:12px;color:#8a95a7;margin:0;text-align:center;">
      מגן — מרכז זכויות פצועי צה"ל · <a href="https://shikum.org" style="color:#b8693f;">shikum.org</a>
    </p>
  </div>
</body>
</html>`;
}

function emailText({ planId, amount }) {
  const price = (amount / 100).toFixed(0);
  return `שלום,

ראיתי שהתחלת ${planLabel(planId)} ב-מגן (${price}₪), אבל התהליך לא הסתיים.

אם היו התלבטויות או שאלות — אני כאן, בלי מחויבות. אפשר להשיב למייל הזה ואחזור אליך אישית.

להמשך הרכישה: https://shikum.org/pricing?plan=${encodeURIComponent(planId)}

אם שינית את דעתך — אין צורך לעשות דבר. המייל הזה נשלח פעם אחת בלבד.

— מגן
shikum.org`;
}

export default async function handler(req, res) {
  const provided = req.headers["x-cron-secret"] || req.query.secret;
  if (CRON_SECRET && provided !== CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!RESEND_API_KEY) {
    await alertDev("abandoned-cart", "RESEND_API_KEY לא מוגדר");
    return res.status(500).json({ error: "resend not configured" });
  }

  const sb = getAdminSupabase();
  const now = Date.now();
  const minAge = new Date(now - REMINDER_MIN_AGE_MIN * 60 * 1000).toISOString();
  const maxAge = new Date(now - REMINDER_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();

  // 1. סימון כ-abandoned תשלומים שעברו 24 שעות — הפסקת התראות
  const { data: abandoned } = await sb
    .from("pending_purchases")
    .update({ fulfilled: true })
    .eq("fulfilled", false)
    .lt("created_at", maxAge)
    .select("id");

  // 2. מציאת תשלומים שצריכים תזכורת
  const { data: candidates, error } = await sb
    .from("pending_purchases")
    .select("id, email, plan_id, amount, created_at")
    .eq("fulfilled", false)
    .is("reminder_sent_at", null)
    .lt("created_at", minAge)
    .gt("created_at", maxAge)
    .not("plan_id", "in", `(${SKIP_PLAN_IDS.map(p => `"${p}"`).join(",")})`)
    .not("email", "in", `(${SKIP_EMAILS.map(e => `"${e}"`).join(",")})`);

  if (error) {
    await alertDev("abandoned-cart", "שגיאה בשליפת candidates", { error: error.message });
    return res.status(500).json({ error: error.message });
  }

  const results = { sent: 0, failed: 0, abandoned_marked: abandoned?.length || 0, skipped_no_email: 0 };

  for (const p of candidates || []) {
    if (!p.email) { results.skipped_no_email++; continue; }

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [p.email],
          reply_to: REPLY_TO,
          subject: "השלמת הרכישה ב-מגן",
          html: emailHtml(p),
          text: emailText(p),
        }),
      });

      if (!r.ok) {
        const errBody = await r.text();
        console.error(`[abandoned-cart] Resend fail for ${p.email}:`, errBody);
        results.failed++;
        continue;
      }

      // סימון שנשלח
      await sb.from("pending_purchases")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", p.id);

      results.sent++;
    } catch (e) {
      console.error(`[abandoned-cart] exception for ${p.email}:`, e.message);
      results.failed++;
    }
  }

  if (results.failed > 0) {
    await alertDev("abandoned-cart", `${results.failed} מיילים נכשלו`, { extra: JSON.stringify(results) });
  }

  res.status(200).json({ ...results, checked_at: new Date().toISOString() });
}

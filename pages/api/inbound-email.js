// Inbound email webhook — מקבל מיילים ל-support@shikum.org מ-Resend
// זרימה: Resend → POST כאן → שומרים ב-DB + שולחים ל-Gmail של admin
//
// הגדרה ב-Resend:
//   Webhooks → Add endpoint
//   URL: https://shikum.org/api/inbound-email
//   Events: email.received
//   Signing secret → RESEND_WEBHOOK_SECRET ב-Railway

import crypto from "crypto";
import { getAdminSupabase } from "./lib/supabase-admin";
import { alertDev } from "./lib/alert";

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = "mordechay.shenvald@gmail.com";
const FORWARD_FROM = "מגן Support <support@shikum.org>";

// Next.js: רוצה את raw body כדי לאמת signature
export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifySignature(raw, headers) {
  if (!WEBHOOK_SECRET) return true; // מצב dev — אין secret
  // Resend משתמש ב-svix signature (webhook-id, webhook-timestamp, webhook-signature)
  const id = headers["svix-id"] || headers["webhook-id"];
  const ts = headers["svix-timestamp"] || headers["webhook-timestamp"];
  const sigHeader = headers["svix-signature"] || headers["webhook-signature"];
  if (!id || !ts || !sigHeader) return false;

  const signedPayload = `${id}.${ts}.${raw.toString("utf8")}`;
  const secret = WEBHOOK_SECRET.startsWith("whsec_") ? WEBHOOK_SECRET.slice(6) : WEBHOOK_SECRET;
  const expected = crypto
    .createHmac("sha256", Buffer.from(secret, "base64"))
    .update(signedPayload)
    .digest("base64");

  // sigHeader יכול להכיל כמה חתימות: "v1,xxx v1,yyy"
  const signatures = sigHeader.split(" ").map(s => s.split(",")[1]).filter(Boolean);
  return signatures.some(s => crypto.timingSafeEqual(
    Buffer.from(s, "base64"),
    Buffer.from(expected, "base64"),
  ));
}

async function findUserByEmail(sb, email) {
  if (!email) return null;
  const { data } = await sb.from("profiles").select("id, name").ilike("email", email).maybeSingle();
  return data;
}

async function forwardToAdmin(payload, user) {
  const from = payload.from?.email || payload.from || "unknown";
  const fromName = payload.from?.name || "";
  const subject = payload.subject || "(ללא נושא)";
  const text = payload.text || "";
  const html = payload.html || "";

  const userTag = user ? `\n\n[משתמש רשום: ${user.name || user.id}]` : "\n\n[משתמש לא רשום]";
  const headerHtml = `
    <div style="background:#f5f3ef;padding:16px;border-inline-start:4px solid #b8693f;margin-bottom:16px;font-family:Heebo,Arial,sans-serif;direction:rtl;text-align:right;">
      <div style="font-size:13px;color:#556070;">מ: <b>${fromName || from}</b> &lt;${from}&gt;</div>
      <div style="font-size:13px;color:#556070;">נושא: <b>${subject}</b></div>
      ${user ? `<div style="font-size:13px;color:#2d7a3e;">✅ משתמש רשום: ${user.name || user.id}</div>` : `<div style="font-size:13px;color:#8a6d3b;">⚠️ לא רשום במערכת</div>`}
    </div>`;

  const body = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FORWARD_FROM,
      to: [ADMIN_EMAIL],
      reply_to: from, // כשתלחץ Reply ב-Gmail, התגובה תחזור לשולח
      subject: `[מגן] ${subject}`,
      html: headerHtml + (html || `<pre style="font-family:Heebo,Arial,sans-serif;">${text.replace(/</g, "&lt;")}</pre>`) + userTag.replace(/\n/g, "<br/>"),
      text: `מ: ${fromName || from} <${from}>\nנושא: ${subject}${userTag}\n\n${text}`,
    }),
  });

  if (!body.ok) {
    const err = await body.text();
    throw new Error(`Resend forward failed: ${err}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  let raw;
  try {
    raw = await readRaw(req);
  } catch (e) {
    return res.status(400).json({ error: "bad body" });
  }

  // אימות signature
  if (!verifySignature(raw, req.headers)) {
    await alertDev("inbound-email", "חתימה לא חוקית בקריאה ל-webhook", {
      extra: `headers: ${JSON.stringify(Object.keys(req.headers))}`,
    });
    return res.status(401).json({ error: "invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "invalid json" });
  }

  // Resend יכול לשלוח "email.inbound" או משהו דומה; התוכן ב-data
  const payload = event.data || event;
  const fromEmail = payload.from?.email || payload.from;
  const toEmail = Array.isArray(payload.to) ? payload.to[0]?.email || payload.to[0] : payload.to?.email || payload.to;

  const sb = getAdminSupabase();
  const user = await findUserByEmail(sb, fromEmail);

  // שמירה ב-DB
  const { data: saved, error: saveErr } = await sb.from("support_emails").insert({
    from_email: fromEmail,
    from_name: payload.from?.name || null,
    to_email: toEmail,
    subject: payload.subject || null,
    text_body: payload.text || null,
    html_body: payload.html || null,
    message_id: payload.message_id || payload.headers?.["message-id"] || null,
    in_reply_to: payload.headers?.["in-reply-to"] || null,
    attachments: payload.attachments || null,
    raw: event,
    user_id: user?.id || null,
  }).select("id").single();

  if (saveErr && saveErr.code !== "23505") { // 23505 = duplicate message_id, OK
    await alertDev("inbound-email", "שגיאה בשמירה ל-DB", { error: saveErr.message });
    return res.status(500).json({ error: "db save failed" });
  }

  // Forward ל-Gmail
  try {
    await forwardToAdmin(payload, user);
    if (saved?.id) {
      await sb.from("support_emails").update({ forwarded_to_admin_at: new Date().toISOString() }).eq("id", saved.id);
    }
  } catch (e) {
    await alertDev("inbound-email", "Forward ל-Gmail נכשל", { error: e.message, extra: `from: ${fromEmail}` });
    return res.status(500).json({ error: "forward failed" });
  }

  res.status(200).json({ ok: true, saved_id: saved?.id, matched_user: !!user });
}

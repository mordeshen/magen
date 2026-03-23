// pages/api/whatsapp.js
// WhatsApp webhook — Twilio → Claude AI → Twilio
// כל משתמש מזוהה לפי מספר טלפון, היסטוריה נשמרת ב-Supabase

import { getAdminSupabase } from "./lib/supabase-admin";

export const config = {
  api: { bodyParser: true },
};

const SYSTEM_PROMPT = `אתה יועץ AI של פלטפורמת מגן — מערכת תמיכה לגמלאי צה"ל פצועים.

תפקידך:
- לעזור בשאלות על זכאות וקצבאות ממשרד הביטחון והמוסד לביטוח לאומי
- להסביר תהליכים ביורוקרטיים בצורה פשוטה וברורה
- להפנות לטפסים הנכונים
- לתמוך רגשית במידת הצורך

חוקים:
- ענה תמיד בעברית
- היה חם, ישיר, ומכבד
- אל תמציא מידע — אם אינך בטוח, אמור זאת והפנה לנציג אנושי
- הודעות קצרות ל-WhatsApp: עד 3-4 משפטים בתשובה רגילה
- אם המשתמש במצוקה — הפנה מיד לקו סיוע: *6911`;

const MAX_HISTORY = 20;

async function getHistory(supabase, phone) {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("role, content")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  if (error) {
    console.error("WhatsApp: Supabase fetch error:", error);
    return [];
  }

  return (data || []).reverse();
}

async function saveMessage(supabase, phone, role, content) {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .insert({ phone, role, content });

  if (error) console.error("WhatsApp: Supabase insert error:", error);
}

async function callClaude(history, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20241022",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [...history, { role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content?.[0]?.type === "text"
    ? data.content[0].text
    : "מצטער, אני לא יכול לענות כרגע. נסה שוב בעוד רגע.";
}

async function sendWhatsApp(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  const params = new URLSearchParams({ To: to, From: from, Body: body });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio send error ${res.status}: ${text}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const from = req.body?.From;     // "whatsapp:+972501234567"
    const message = req.body?.Body?.trim();

    if (!from || !message) {
      return res.status(400).json({ error: "missing From or Body" });
    }

    const supabase = getAdminSupabase();

    // 1. שלוף היסטוריה
    const history = await getHistory(supabase, from);

    // 2. שמור הודעת המשתמש
    await saveMessage(supabase, from, "user", message);

    // 3. קרא ל-Claude
    const reply = await callClaude(history, message);

    // 4. שמור תשובת AI
    await saveMessage(supabase, from, "assistant", reply);

    // 5. שלח חזרה דרך Twilio
    await sendWhatsApp(from, reply);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return res.status(500).json({ error: "internal error" });
  }
}

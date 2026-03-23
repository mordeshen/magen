// pages/api/whatsapp.js
// WhatsApp webhook — Twilio → Inverted Intelligence Architecture → Twilio
// Layer 1 (Sonnet): Understand intent, emotional state, plan response
// Decision Gate: Route to Haiku (simple) or Sonnet (complex/crisis)
// Layer 2 (Haiku): Execute response with RAG knowledge
// Layer 3 (async): Learn from interaction

import { getAdminSupabase } from "./lib/supabase-admin";
import { MODEL_SONNET } from "./lib/models";
import { invertedChat } from "./lib/inverted-chat";

export const config = {
  api: { bodyParser: true },
};

// Legacy fallback prompt (used if inverted architecture fails)
const LEGACY_SYSTEM_PROMPT = `אתה יועץ AI של פלטפורמת מגן — מערכת תמיכה לגמלאי צה"ל פצועים.

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
- אם המשתמש במצוקה — הפנה מיד לקו סיוע: *8944`;

const MAX_HISTORY = 20;

// Hat display names for WhatsApp
const HAT_LABELS = {
  lawyer: "דן (זכויות)",
  social: "מיכל (ליווי)",
  psycho: "אורי (תמיכה)",
  veteran: "רועי (ותיקים)",
  events: "שירה (אירועים)",
};

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

// Legacy Claude call (fallback)
async function callClaudeLegacy(history, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL_SONNET,
      max_tokens: 1000,
      system: LEGACY_SYSTEM_PROMPT,
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

/**
 * Format reply with hat label for WhatsApp
 * Adds a subtle hat indicator at the beginning
 */
function formatWhatsAppReply(reply, brief) {
  if (!brief?.hat) return reply;

  const label = HAT_LABELS[brief.hat];
  if (!label) return reply;

  // Add hat label as first line
  return `${label}\n─────────────\n${reply}`;
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

    // 1. Fetch conversation history
    const history = await getHistory(supabase, from);

    // 2. Save user message
    await saveMessage(supabase, from, "user", message);

    // 3. Try inverted architecture
    let reply;
    let brief = null;

    const context = {
      recentMessages: history.slice(-6), // Last 6 for context
      clientHat: null,                   // Auto-detect in WhatsApp
      profile: null,                     // No profile in WhatsApp (phone-based)
      memory: [],
      conversationId: from,              // Use phone as conversation ID
    };

    const result = await invertedChat(message, context, supabase);

    if (result) {
      // Inverted architecture succeeded
      reply = formatWhatsAppReply(result.reply, result.brief);
      brief = result.brief;
      console.log(`[whatsapp] Layer ${result.layer} | Hat: ${result.brief.hat} | Complexity: ${result.brief.complexity}`);
    } else {
      // Fallback to legacy
      console.warn("[whatsapp] Inverted architecture failed, using legacy");
      reply = await callClaudeLegacy(history, message);
    }

    // 4. Save AI response
    await saveMessage(supabase, from, "assistant", reply);

    // 5. Send back via Twilio
    await sendWhatsApp(from, reply);

    return res.status(200).json({ ok: true, layer: result?.layer });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return res.status(500).json({ error: "internal error" });
  }
}

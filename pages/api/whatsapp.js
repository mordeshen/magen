// pages/api/whatsapp.js
// WhatsApp webhook — Twilio → Auth/Pairing Layer → Inverted Intelligence Architecture → Twilio
// Layer 0 (new): Check pairing, handle auth flow (email → OTP → pair)
// Layer 1 (Sonnet): Understand intent, emotional state, plan response
// Decision Gate: Route to Haiku (simple) or Sonnet (complex/crisis)
// Layer 2 (Haiku): Execute response with RAG knowledge
// Layer 3 (async): Learn from interaction

import { getAdminSupabase } from "./lib/supabase-admin";
import { MODEL_OPUS, MODEL_SONNET, MODEL_HAIKU } from "./lib/models";
import { generateBrief } from "./lib/understanding";
import { fetchRAG } from "./lib/rag";
import { logBrief, processLearning } from "./lib/learning";

export const config = {
  api: { bodyParser: true },
};

// Primary prompt — Sonnet gives deep, quality response
const PRIMARY_SYSTEM_PROMPT = `אתה יועץ AI של מגן — פורטל לפצועי צה"ל. אתה מדבר בוואטסאפ.

=== כובעים — בחר את המתאים אוטומטית ===
- דן (זכויות): חוקים, ועדות, ערעורים, נוסחי פנייה
- מיכל (ליווי): ניווט בירוקרטיה, טפסים, שלבים מעשיים
- אורי (תמיכה): תמיכה רגשית, PTSD, חבר ותיק בגובה העיניים
- רועי (ותיקים): טיפים מניסיון אמיתי של פצועים
- שירה (אירועים): אירועים, סדנאות, טיולים

=== הנחות יסוד ===
- כל פונה הוא פצוע צה"ל עם PTSD ברמה כלשהי — גם אם לא אומר
- "הכל בסדר" = כנראה לא בסדר. "אני אסתדר" = אל תעזוב אותו
- זהה masking: תשובות קצרות, ציניות, הקטנה = דפוסי הגנה
- מהרגש → פרקטיקה. קודם הכר ברגש, אחר כך פתרון

=== חוקים ===
- עברית ישראלית טבעית, כמו חבר — לא כמו טופס
- תשובות: 3-6 משפטים (זה וואטסאפ!)
- לעולם לא "כמה אחוזים?" — תמיד "איפה אתה עומד מול משרד הביטחון?"
- לעולם לא "בהצלחה" יבש — תמיד "אני כאן, תחזור"
- תמיד תן שלבים מעשיים עם מספרי טלפון ומה להגיד
- סיים עם שאלה שמניעה לפעולה
- במצוקה — הפנה מיד ל-*8944 (נפש אחת, 24/7)
- קו פצועים: *6500 | פורטל: shikum.mod.gov.il

=== פורמט ===
פתח עם שם הכובע בשורה ראשונה, אח"כ קו מפריד, אח"כ התשובה:
דן (זכויות)
─────────────
תוכן התשובה...

=== חיתוך הודעות ===
הודעת וואטסאפ מוגבלת ל-1500 תווים. אם התשובה ארוכה או מערבת כמה כובעים:
- חתוך לחלקים עם התו <<<SPLIT>>> בין כל חלק
- כל חלק פותח עם שם הכובע שלו + קו מפריד
- כל חלק עומד בפני עצמו — הגיוני גם בלי החלקים האחרים
- עדיף 2-3 הודעות קצרות וממוקדות מאשר הודעה אחת ענקית

דוגמה:
דן (זכויות)
─────────────
מגיע לך ייצוג חינם לוועדה. ככה עושים:
שלב 1: ...
<<<SPLIT>>>
אורי (תמיכה)
─────────────
אגב, נשמע שלא פשוט לך עכשיו. זה לגיטימי.
...`;

// Follow-up prompt — Haiku checks if Sonnet missed something
const FOLLOWUP_SYSTEM_PROMPT = `אתה בודק שיחות של מגן — פורטל AI לפצועי צה"ל.
קיבלת הודעת משתמש ותשובה ראשונית שכבר נשלחה.

בדוק אם התשובה הראשונית פספסה משהו חשוב:
1. זכויות שלא הוזכרו שהמשתמש כנראה לא יודע עליהן
2. מידע מעשי חסר (מספר טלפון, נוסח פנייה, שלב בתהליך)
3. סימני מצוקה שלא טופלו (masking, בידוד, חוסר תקווה)
4. טיפ מעשי מניסיון ותיקים שרלוונטי

החזר JSON בלבד:
{
  "needs_followup": true/false,
  "followup_message": "ההודעה הנוספת" | null
}

כללים:
- אם התשובה טובה ומספקת — needs_followup: false
- follow-up חייב להיות קצר (2-3 משפטים), טבעי, כאילו "אה, רגע — שכחתי להגיד..."
- לא לחזור על מה שכבר נאמר
- אם זיהית מצוקה: "*8944 — נפש אחת, 24/7, אנונימי"
- אם יש זכות שלא הוזכרה: "אגב, ידעת שמגיע לך גם..."
- אם יש טיפ: "טיפ מניסיון: ..."`;

// Legacy fallback
const LEGACY_SYSTEM_PROMPT = PRIMARY_SYSTEM_PROMPT;

const MAX_HISTORY = 20;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://magen.app";

// Welcome message for first-time users
const WELCOME_MESSAGE = `שלום! אני מגן — העוזר האישי שלך לכל מה שקשור לזכויות פצועי צה"ל.

יש לי חמישה כובעים, ואני אבחר את המתאים אוטומטית:

🏛️ *דן* — מומחה זכויות. חוקים, ועדות, ערעורים, נוסחי פנייה מוכנים
📋 *מיכל* — מלווה בירוקרטיה. שלב אחרי שלב, עם מספרי טלפון ומה להגיד
💬 *אורי* — חבר ותיק שעבר את זה. תמיכה בגובה העיניים, בלי שיפוטיות
🎖️ *רועי* — חכמת ותיקים. טיפים מניסיון אמיתי של מי שכבר עבר את הדרך
🎭 *שירה* — אירועים ופעילויות. סדנאות, טיולים, תרבות — מתאימה לך אישית

פשוט כתוב מה עובר עליך או מה אתה צריך — אני כאן.
הכל פרטי לחלוטין. 🔒`;

// Hat display names for WhatsApp
const HAT_LABELS = {
  lawyer: "דן (זכויות)",
  social: "מיכל (ליווי)",
  psycho: "אורי (תמיכה)",
  veteran: "רועי (ותיקים)",
  events: "שירה (אירועים)",
};

// ─── Conversation History ───────────────────────────────────────

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

// ─── Legacy Claude (fallback) ───────────────────────────────────

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

// ─── Twilio send ────────────────────────────────────────────────

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

// ─── Format reply with hat label ────────────────────────────────

function formatWhatsAppReply(reply, brief) {
  if (!brief?.hat) return reply;

  const label = HAT_LABELS[brief.hat];
  if (!label) return reply;

  return `${label}\n─────────────\n${reply}`;
}

// ─── Pairing & Auth helpers ─────────────────────────────────────

/**
 * Check if phone is already paired to a user account.
 * Returns { userId, email } or null.
 */
async function getPairing(supabase, phone) {
  const { data, error } = await supabase
    .from("whatsapp_pairings")
    .select("user_id, email")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp] pairing lookup error:", error);
    return null;
  }

  return data; // null if not found
}

/**
 * Fetch user profile and memory for a paired user.
 */
async function getUserContext(supabase, userId) {
  const [profileRes, memoryRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_memory")
      .select("key, value")
      .eq("user_id", userId),
  ]);

  return {
    profile: profileRes.data || null,
    memory: memoryRes.data || [],
  };
}

/**
 * Remove pairing for a phone number.
 */
async function unpair(supabase, phone) {
  const { error } = await supabase
    .from("whatsapp_pairings")
    .delete()
    .eq("phone", phone);

  if (error) console.error("[whatsapp] unpair error:", error);
  return !error;
}

/**
 * Generate a signed pair token for link-based auth.
 * Token = base64url(JSON) + "." + HMAC signature
 */
function generatePairToken(phone) {
  const crypto = require("crypto");
  const secret = process.env.PAIR_TOKEN_SECRET || "magen-pair-secret-2026";
  const payload = JSON.stringify({ phone, exp: Date.now() + 10 * 60 * 1000 }); // 10 min
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return b64 + "." + sig;
}

// ─── Auth Flow Handler ──────────────────────────────────────────

/**
 * Handle authentication flow messages.
 * Returns a reply string if the message was handled by auth flow, or null if not.
 */
async function handleAuthFlow(supabase, phone, message) {
  const trimmed = message.trim();

  // ── Unpair command ──
  if (trimmed === "התנתק" || trimmed === "התנתקי") {
    const pairing = await getPairing(supabase, phone);
    if (pairing) {
      await unpair(supabase, phone);
      return "החשבון נותק בהצלחה. אני עדיין כאן לעזור, אבל בלי הפרופיל האישי שלך.\n\nאפשר לחבר מחדש בכל עת — פשוט כתוב \"חבר חשבון\".";
    }
    return null; // Not paired, not an auth message
  }

  // ── Pair request ──
  if (trimmed === "חבר חשבון" || trimmed === "התחבר" || trimmed === "חיבור חשבון") {
    const pairing = await getPairing(supabase, phone);
    if (pairing) {
      return "החשבון שלך כבר מחובר! אני מכיר אותך ורואה את הפרופיל שלך. 😊\n\nאם תרצה להתנתק, שלח \"התנתק\".";
    }

    // Generate link
    const token = generatePairToken(phone);
    const pairUrl = `${SITE_URL}/pair?token=${token}`;
    return `לחץ על הקישור כדי לחבר את החשבון שלך:\n\n${pairUrl}\n\nהקישור תקף ל-10 דקות. אחרי החיבור אוכל לעזור לך בצורה אישית יותר — עם הפרופיל, הזיכרון, וכל מה שדיברנו עליו באתר.`;
  }

  // ── Not an auth message ──
  return null;
}

/**
 * Check if this is the user's first message ever → send welcome
 */
async function isFirstMessage(supabase, phone) {
  const { count, error } = await supabase
    .from("whatsapp_conversations")
    .select("*", { count: "exact", head: true })
    .eq("phone", phone);

  return !error && (count === null || count === 0);
}

// ─── Main Handler ───────────────────────────────────────────────

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

    // ── Layer 0: First-time welcome ─────────────────────────────
    const firstTime = await isFirstMessage(supabase, from);
    if (firstTime) {
      await saveMessage(supabase, from, "user", message);
      await saveMessage(supabase, from, "assistant", WELCOME_MESSAGE);
      await sendWhatsApp(from, WELCOME_MESSAGE);
      // Don't return — continue to answer their actual message too
    }

    // ── Layer 0.5: Auth flow ────────────────────────────────────
    const authReply = await handleAuthFlow(supabase, from, message);
    if (authReply) {
      if (!firstTime) await saveMessage(supabase, from, "user", message);
      await saveMessage(supabase, from, "assistant", authReply);
      await sendWhatsApp(from, authReply);
      return res.status(200).json({ ok: true, layer: "auth" });
    }

    // ── Parallel architecture: Opus first, Haiku follow-up ──

    // 1. Fetch history + pairing context in parallel
    const [history, pairing] = await Promise.all([
      getHistory(supabase, from),
      getPairing(supabase, from),
    ]);

    // 2. Save user message (if not already saved by welcome flow)
    if (!firstTime) await saveMessage(supabase, from, "user", message);

    // 3. Build context
    let profile = null;
    let memory = [];
    if (pairing) {
      const userCtx = await getUserContext(supabase, pairing.user_id);
      profile = userCtx.profile;
      memory = userCtx.memory;
    }

    // 4. Build system prompt with RAG context
    let systemPrompt = PRIMARY_SYSTEM_PROMPT;

    // Add profile context
    if (profile) {
      systemPrompt += `\n\n[פרופיל משתמש]`;
      if (profile.name) systemPrompt += `\nשם: ${profile.name}`;
      if (profile.city) systemPrompt += `\nעיר: ${profile.city}`;
      if (profile.claim_status) systemPrompt += `\nסטטוס: ${profile.claim_status}`;
      if (profile.disability_percent) systemPrompt += `\nאחוזי נכות: ${profile.disability_percent}%`;
    }

    // Add memory
    if (memory.length > 0) {
      systemPrompt += `\n\n[זיכרון מסשנים קודמים]`;
      memory.forEach(m => { systemPrompt += `\n• ${m.key}: ${m.value}`; });
    }

    // Fetch RAG knowledge (quick keyword search — no embedding delay)
    const ragBrief = { rag_queries: [message], categories: [], hat: null, intent: null, include_formula: false };
    const ragResults = await fetchRAG(ragBrief, supabase);

    if (ragResults.rights?.length > 0) {
      systemPrompt += `\n\n[זכויות רלוונטיות]`;
      ragResults.rights.slice(0, 3).forEach(r => {
        systemPrompt += `\n• ${r.title}: ${r.summary || r.details}`;
        if (r.practical_tip) systemPrompt += ` (טיפ: ${r.practical_tip})`;
      });
    }

    // 5. Sonnet — deep, quality primary response
    const primaryRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: MODEL_OPUS,
        max_tokens: 600,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [
          ...history.slice(-4).map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: message },
        ],
      }),
    });

    let reply;
    if (primaryRes.ok) {
      const data = await primaryRes.json();
      reply = data.content?.[0]?.text || "מצטער, נסה שוב.";
    } else {
      console.error("[whatsapp] Sonnet error:", primaryRes.status);
      reply = await callClaudeLegacy(history, message);
    }

    // 6. If not paired, occasionally suggest pairing
    if (!pairing) {
      const shouldSuggest = await shouldSuggestPairing(supabase, from);
      if (shouldSuggest) {
        reply += "\n\n─────────────\nאגב, אם יש לך חשבון באתר מגן, כתוב \"חבר חשבון\" ואשלח לך קישור לחיבור — ככה אוכל לעזור בצורה אישית יותר.";
      }
    }

    // 7. Split by <<<SPLIT>>> and send as separate messages
    const parts = reply.split("<<<SPLIT>>>").map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      await saveMessage(supabase, from, "assistant", part);
      await sendWhatsApp(from, part);
    }

    // 8. Respond to Twilio immediately — don't block
    res.status(200).json({ ok: true, paired: !!pairing });

    // 9. Background: Haiku checks if follow-up needed (fire and forget)
    (async () => {
      try {
        const followupRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL_HAIKU,
            max_tokens: 300,
            system: FOLLOWUP_SYSTEM_PROMPT,
            messages: [{
              role: "user",
              content: `[ידע זכויות זמין]\n${ragResults.rights?.map(r => `• ${r.title}: ${r.details}`).join("\n") || "אין"}\n\n[הודעת משתמש]\n${message}\n\n[תשובה שנשלחה]\n${reply}`,
            }],
          }),
        });

        if (!followupRes.ok) return;

        const fData = await followupRes.json();
        const fText = fData.content?.[0]?.text || "";
        const jsonMatch = fText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;

        const followup = JSON.parse(jsonMatch[0]);

        if (followup.needs_followup && followup.followup_message) {
          console.log(`[whatsapp] Follow-up triggered: ${followup.followup_message.slice(0, 50)}...`);
          await saveMessage(supabase, from, "assistant", followup.followup_message);
          await sendWhatsApp(from, followup.followup_message);
        }
      } catch (e) {
        console.error("[whatsapp] Follow-up error:", e.message);
      }

      // Learning layer (async)
      processLearning(supabase, {
        brief: { hat: "auto", intent: "auto", complexity: "auto" },
        responseText: reply,
        userMessage: message,
      }).catch(() => {});
    })();

    return; // Already responded
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return res.status(500).json({ error: "internal error" });
  }
}

// ─── Pairing Suggestion Throttle ────────────────────────────────

/**
 * Decide whether to suggest pairing to an unpaired user.
 * Don't spam — only suggest once every ~10 messages.
 */
async function shouldSuggestPairing(supabase, phone) {
  const { count, error } = await supabase
    .from("whatsapp_conversations")
    .select("*", { count: "exact", head: true })
    .eq("phone", phone)
    .eq("role", "user");

  if (error || count === null) return false;

  // Suggest on messages 3, 13, 23, etc.
  // First few messages: let them settle in. Then remind every 10.
  return count === 3 || (count > 3 && (count - 3) % 10 === 0);
}

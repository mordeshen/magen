// pages/api/whatsapp.js
// WhatsApp webhook — Twilio → Auth/Pairing Layer → Inverted Intelligence Architecture → Twilio
// Layer 0 (new): Check pairing, handle auth flow (email → OTP → pair)
// Layer 1 (Sonnet): Understand intent, emotional state, plan response
// Decision Gate: Route to Haiku (simple) or Sonnet (complex/crisis)
// Layer 2 (Haiku): Execute response with RAG knowledge
// Layer 3 (async): Learn from interaction

import { getAdminSupabase } from "./lib/supabase-admin";
import { MODEL_OPUS, MODEL_SONNET, MODEL_HAIKU, MODEL_MAGEN } from "./lib/models";
import { fetchRAG } from "./lib/rag";
import { magenChat } from "./lib/magen-engine";
import { alertDev } from "./lib/alert";
import { logChatMetrics, logChatContent, detectCategory, modelShortName } from "../../lib/analytics";
import crypto from "crypto";
import { fetchUserContext } from "./lib/user-context";

export const config = {
  api: { bodyParser: true },
};

// Primary prompt — Opus as unified advisor (WhatsApp)
const PRIMARY_SYSTEM_PROMPT = `אתה מגן — אח ותיק שעבר את המערכת ויודע אותה מבפנים. אתה מדבר בוואטסאפ.

=== מי אתה ===
חבר שנלחם, נפצע, וסגר את כל הבירוקרטיה בעצמו. אתה אחד — לא חמישה אנשים:
- זכויות וחוקים (מה מגיע, ועדות, ערעורים, נוסחי פנייה)
- ניווט בירוקרטיה (שלב אחרי שלב, מספרי טלפון, מה להגיד)
- תמיכה רגשית (אח שעבר את זה, בגובה העיניים, לא קליני)
- חכמת ותיקים (טיפים מניסיון אמיתי)
- אירועים ופעילויות (מה קורה, מה מתאים)

=== גישה ===
ענייני, חכם, ממוקד. לא מסביר מה אתה — פשוט עושה.
פרואקטיבי — אם אתה רואה שמשהו חסר או שיש זכות שהוא לא יודע עליה, תעלה את זה.
דבר טבעי, בלי להתאמץ, בלי פאתוס, בלי קלישאות.
אם מישהו במצוקה — תהיה שם, ישיר ואנושי.
אתה מכיר את המשתמש — אם יש מידע אישי למטה, זה שלך מסשנים קודמים. אל תגיד "אין לי גישה".

=== הנחות יסוד ===
- כל פונה הוא פצוע צה"ל עם PTSD ברמה כלשהי — גם אם לא אומר
- "הכל בסדר" = כנראה לא בסדר. "אני אסתדר" = אל תעזוב אותו
- זהה masking: תשובות קצרות, ציניות, הקטנה = דפוסי הגנה
- מהרגש → פרקטיקה. קודם הכר ברגש, אחר כך פתרון

=== ניתוח מסמכים ===
כשמשתמש שולח תמונה או מסמך:
- נתח לעומק. ישיר וכנה — מה כתוב, מה זה אומר, לאיזה זכויות זה מכוון.
- לעולם לא "אני לא עורך דין" או "פנה למומחה". אתה הידע כאן. תנתח.
- זהה: אבחנות, אחוזים, המלצות, חסרים, נקודות חזקות וחלשות.
- הצע: מה לעשות עם המסמך, מה חסר, מה הצעד הבא.

=== חוקים ===
- עברית ישראלית טבעית, כמו חבר — לא כמו טופס
- תשובות: עד 1400 תווים. קצר ומדויק.
- קודם כיוון כללי ומה חשוב — פרטים ומספרים רק כשמבקשים
- לעולם לא "אני לא יכול / אין לי גישה / פנה למומחה"
- תמיד שלבים מעשיים עם מספרי טלפון ומה להגיד
- סיים עם שאלה שמניעה לפעולה
- במצוקה — *8944 (נפש אחת, 24/7) | קו פצועים: *6500

=== פורמט ===
פשוט כתוב. בלי שמות כובעים, בלי תוויות, בלי קווים מפרידים.
תשובה רציפה טבעית. אם ארוכה — <<<SPLIT>>> לחתוך להודעות.`;

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
- אם התשובה טובה ומספקת — needs_followup: false. רוב הזמן זה המצב!
- follow-up רק כשבאמת חסר משהו חשוב — לא בשביל להוסיף "עוד מידע"
- follow-up חייב להיות קצר (2-3 משפטים), בעברית ישראלית טבעית, כמו הודעת וואטסאפ מחבר
- לא לחזור על מה שכבר נאמר
- לא להתחיל עם "אגב" — זה מלאכותי. תתחיל ישיר: "שכחתי להגיד —" / "עוד דבר חשוב:" / "טיפ:"
- אם זיהית מצוקה: "*8944 — נפש אחת, 24/7, אנונימי"`;

// Legacy fallback
const LEGACY_SYSTEM_PROMPT = PRIMARY_SYSTEM_PROMPT;

/**
 * Download media from Twilio (requires Basic Auth) and convert to base64
 */
async function downloadTwilioMedia(url, mediaType) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      },
    });

    if (!res.ok) {
      console.error("[whatsapp] media download failed:", res.status);
      return null;
    }

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Limit: 20MB for images, 32MB for PDFs
    if (base64.length > 32 * 1024 * 1024) {
      console.warn("[whatsapp] media too large, skipping");
      return null;
    }

    return { base64, mediaType };
  } catch (e) {
    console.error("[whatsapp] media download error:", e.message);
    return null;
  }
}

/**
 * Build a multimodal message for Claude from Twilio media
 * Downloads media with Twilio auth, sends as base64
 */
async function buildMediaMessage(text, mediaItems) {
  const content = [];

  for (const media of mediaItems) {
    const downloaded = await downloadTwilioMedia(media.url, media.type);
    if (!downloaded) continue;

    if (media.type.startsWith("image/")) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: media.type,
          data: downloaded.base64,
        },
      });
    } else if (media.type === "application/pdf") {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: downloaded.base64,
        },
      });
    }
  }

  // If no media was successfully downloaded, fall back to text only
  if (content.length === 0) {
    return text || "לא הצלחתי לקרוא את הקובץ. נסה לשלוח כתמונה.";
  }

  content.push({
    type: "text",
    text: text || "נתח את המסמך הזה. מה כתוב, מה זה אומר מבחינת זכויות, מה חסר, מה הצעד הבא.",
  });

  return content;
}

const MAX_HISTORY = 20;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://magen.app";

// Welcome message for first-time users
const WELCOME_MESSAGE = `היי, אני מגן — היועץ האישי שלך.

אני מכיר את המערכת מבפנים: זכויות, ועדות, ערעורים, טפסים, מה להגיד ולמי להתקשר. גם יודע טיפים מחבר'ה שכבר עברו את הדרך.

ספר לי מה עובר עליך — ואני אטפל בהכל, מקצה לקצה.
הכל בינינו. 🔒`;

// Hat display names for WhatsApp
const HAT_LABELS = {
  lawyer: "דן (זכויות)",
  social: "מיכל (ליווי)",
  psycho: "אורי (תמיכה)",
  veteran: "רועי (ותיקים)",
  events: "שירה (אירועים)",
};

// ─── Conversation History :::

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

// ─── Legacy Claude (fallback) ::─────────

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

// ─── Twilio send :::─────────

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

// ─── Format reply with hat label ::──────

function formatWhatsAppReply(reply, brief) {
  if (!brief?.hat) return reply;

  const label = HAT_LABELS[brief.hat];
  if (!label) return reply;

  return `${label}\n:\n${reply}`;
}

// ─── Pairing & Auth helpers ::───────────

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

// getUserContext removed — now using shared fetchUserContext from lib/user-context.js

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

// ─── Auth Flow Handler :::───

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

// ─── Main Handler :::────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const from = req.body?.From;     // "whatsapp:+972501234567"
    const message = req.body?.Body?.trim() || "";
    const numMedia = parseInt(req.body?.NumMedia || "0", 10);

    // Collect media URLs from Twilio (images, PDFs)
    const mediaItems = [];
    for (let i = 0; i < numMedia; i++) {
      const url = req.body?.[`MediaUrl${i}`];
      const type = req.body?.[`MediaContentType${i}`];
      if (url && type) mediaItems.push({ url, type });
    }

    if (!from || (!message && mediaItems.length === 0)) {
      return res.status(400).json({ error: "missing From or Body" });
    }

    const supabase = getAdminSupabase();

    // ── Layer 0: First-time welcome ::───
    const firstTime = await isFirstMessage(supabase, from);
    if (firstTime) {
      await saveMessage(supabase, from, "user", message);
      await saveMessage(supabase, from, "assistant", WELCOME_MESSAGE);
      await sendWhatsApp(from, WELCOME_MESSAGE);
      // Don't return — continue to answer their actual message too
    }

    // ── Layer 0.5: Auth flow ::──────────
    const authReply = await handleAuthFlow(supabase, from, message);
    if (authReply) {
      if (!firstTime) await saveMessage(supabase, from, "user", message);
      await saveMessage(supabase, from, "assistant", authReply);
      await sendWhatsApp(from, authReply);
      return res.status(200).json({ ok: true, layer: "auth" });
    }

    // ── Immediate acknowledgment for heavy requests ──
    if (mediaItems.length > 0) {
      await sendWhatsApp(from, "קיבלתי! עובר על המסמך, עוד רגע חוזר אליך...");
    } else if (message.length > 200) {
      await sendWhatsApp(from, "קיבלתי, עובד על זה...");
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
    let legalCase = null;
    let injuries = [];
    if (pairing) {
      const userCtx = await fetchUserContext(supabase, pairing.user_id);
      profile = userCtx.profile;
      memory = userCtx.memory;
      legalCase = userCtx.legalCase;
      injuries = userCtx.injuries;
    }

    // 4. Build context for Magen Engine
    const magenContext = {
      userId: pairing?.user_id || null,
      profile,
      memory,
      legalCase,
      injuries,
      recentMessages: history.slice(-6).map(m => ({ role: m.role, content: m.content })),
    };

    let reply;
    let usedLayer = "unknown";

    // 5. Route: Magen Engine for text, Opus for media
    if (mediaItems.length > 0) {
      // Media (images/PDFs) → Opus directly (v14b can't process images)
      console.log("[whatsapp] Media detected → Opus path");
      let systemPrompt = PRIMARY_SYSTEM_PROMPT;
      if (profile) {
        systemPrompt += `\n\n[פרופיל משתמש]`;
        if (profile.name) systemPrompt += `\nשם: ${profile.name}`;
        if (profile.city) systemPrompt += `\nעיר: ${profile.city}`;
        if (profile.disability_percent) systemPrompt += `\nאחוזי נכות: ${profile.disability_percent}%`;
      }
      if (legalCase) {
        systemPrompt += `\n\n[תיק משפטי]`;
        systemPrompt += `\nשלב: ${legalCase.stage}`;
        if (legalCase.committee_date) systemPrompt += `\nתאריך ועדה: ${legalCase.committee_date}`;
      }
      if (injuries.length > 0) {
        systemPrompt += `\n\n[פגיעות]`;
        injuries.forEach(inj => {
          systemPrompt += `\n• ${inj.hebrew_label || inj.body_zone} — ${inj.severity}${inj.disability_percent ? `, ${inj.disability_percent}%` : ""}`;
        });
      }
      if (memory.length > 0) {
        systemPrompt += `\n\n[זיכרון]`;
        memory.forEach(m => { systemPrompt += `\n• ${m.key}: ${m.value}`; });
      }

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
            { role: "user", content: await buildMediaMessage(message, mediaItems) },
          ],
        }),
      });

      if (primaryRes.ok) {
        const data = await primaryRes.json();
        reply = data.content?.[0]?.text || "מצטער, נסה שוב.";
        usedLayer = "opus-media";
      } else {
        console.error("[whatsapp] Opus media error:", primaryRes.status);
        reply = await callClaudeLegacy(history, message);
        usedLayer = "legacy";
      }
    } else {
      // Text messages → Magen Engine if available, otherwise Opus + RAG
      if (MODEL_MAGEN) {
        try {
          const result = await magenChat(message, magenContext, supabase);
          if (result) {
            reply = result.reply;
            usedLayer = result.layer;
            console.log(`[whatsapp] Magen engine responded (layer: ${result.layer}, tokens: ${result.tokens})`);
          }
        } catch (e) {
          console.error("[whatsapp] Magen engine error:", e.message);
        await alertDev("whatsapp", "Magen Engine נכשל", { error: e.message, userId: pairing?.user_id });
        }
      }

      // Opus + RAG + personal context (primary path when no Magen, fallback when Magen fails)
      if (!reply) {
        console.log(`[whatsapp] Opus + RAG path`);
        let systemPrompt = PRIMARY_SYSTEM_PROMPT;

        // Personal context
        if (profile) {
          systemPrompt += `\n\n[פרופיל משתמש]`;
          if (profile.name) systemPrompt += `\nשם: ${profile.name}`;
          if (profile.city) systemPrompt += `\nעיר: ${profile.city}`;
          if (profile.disability_percent) systemPrompt += `\nאחוזי נכות: ${profile.disability_percent}%`;
        }
        if (legalCase) {
          systemPrompt += `\n\n[תיק משפטי]`;
          systemPrompt += `\nשלב: ${legalCase.stage}`;
          if (legalCase.committee_date) systemPrompt += `\nתאריך ועדה: ${legalCase.committee_date}`;
          if (legalCase.injury_types?.length) systemPrompt += `\nסוגי פגיעה: ${legalCase.injury_types.join(", ")}`;
        }
        if (injuries.length > 0) {
          systemPrompt += `\n\n[פגיעות]`;
          injuries.forEach(inj => {
            systemPrompt += `\n• ${inj.hebrew_label || inj.body_zone} — ${inj.severity}${inj.disability_percent ? `, ${inj.disability_percent}%` : ""}`;
          });
        }
        if (memory.length > 0) {
          systemPrompt += `\n\n[זיכרון]`;
          memory.forEach(m => { systemPrompt += `\n• ${m.key}: ${m.value}`; });
        }

        // RAG
        const ragBrief = { rag_queries: [message], categories: [], hat: null, intent: null, include_formula: false };
        const ragResults = await fetchRAG(ragBrief, supabase);
        if (ragResults.rights?.length > 0) {
          systemPrompt += `\n\n[זכויות רלוונטיות]`;
          ragResults.rights.slice(0, 3).forEach(r => {
            systemPrompt += `\n• ${r.title}: ${r.summary || r.details}`;
          });
        }

        const primaryRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL_OPUS,
            max_tokens: 600,
            system: systemPrompt,
            messages: [
              ...history.slice(-4).map(m => ({ role: m.role, content: m.content })),
              { role: "user", content: message },
            ],
          }),
        });

        if (primaryRes.ok) {
          const data = await primaryRes.json();
          reply = data.content?.[0]?.text || "מצטער, נסה שוב.";
          usedLayer = "opus";
        } else {
          const errText = await primaryRes.text().catch(() => "");
          console.error("[whatsapp] Opus error:", primaryRes.status, errText);
          await alertDev("whatsapp", `Opus נכשל (${primaryRes.status})`, { error: errText, userId: pairing?.user_id });
          reply = await callClaudeLegacy(history, message);
          usedLayer = "legacy";
        }
      }
    }

    console.log(`[whatsapp] Response sent (layer: ${usedLayer})`);

    // 5.5. Anonymous content + metrics logging (fire-and-forget — never block reply)
    const waSessionId = crypto.createHash("sha256").update(from || "anon").digest("hex").slice(0, 32);
    logChatContent({
      sessionId: waSessionId,
      channel: "whatsapp",
      persona: "magen",
      userMessage: message || "",
      assistantReply: reply || "",
      model: modelShortName(MODEL_OPUS),
      source: usedLayer,
      usedRag: true,
      responseTimeMs: 0,
    }).catch(() => {});
    logChatMetrics({
      sessionId: waSessionId,
      inputTokens: 0,
      outputTokens: 0,
      model: modelShortName(MODEL_OPUS),
      category: detectCategory(message || ""),
      usedRag: true,
      usedWebSearch: false,
      persona: "magen",
      responseTimeMs: 0,
      channel: "whatsapp",
    }).catch(() => {});

    // 6. If not paired, occasionally suggest pairing
    if (!pairing) {
      const shouldSuggest = await shouldSuggestPairing(supabase, from);
      if (shouldSuggest) {
        reply += "\n\n:\nאגב, אם יש לך חשבון באתר מגן, כתוב \"חבר חשבון\" ואשלח לך קישור לחיבור — ככה אוכל לעזור בצורה אישית יותר.";
      }
    }

    // 7. Split into WhatsApp-safe messages
    // First split by explicit <<<SPLIT>>> markers
    let parts = reply.split("<<<SPLIT>>>").map(p => p.trim()).filter(Boolean);

    // Then split any part that's still too long (>1400 chars) at sentence boundaries
    const safeParts = [];
    for (const part of parts) {
      if (part.length <= 1400) {
        safeParts.push(part);
      } else {
        // Split at sentence endings (. ! ? or newline after 800+ chars)
        let remaining = part;
        while (remaining.length > 1400) {
          // Find last sentence break before 1400
          let cutAt = -1;
          for (let i = Math.min(1400, remaining.length - 1); i >= 800; i--) {
            if (remaining[i] === '\n' || (remaining[i] === ' ' && /[.!?:]/.test(remaining[i - 1]))) {
              cutAt = i;
              break;
            }
          }
          if (cutAt === -1) cutAt = 1400; // forced cut
          safeParts.push(remaining.slice(0, cutAt).trim());
          remaining = remaining.slice(cutAt).trim();
        }
        if (remaining) safeParts.push(remaining);
      }
    }

    for (const part of safeParts) {
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
              content: `[הודעת משתמש]\n${message}\n\n[תשובה שנשלחה]\n${reply}`,
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

      // Training data now collected via training_candidates table in magen-engine.js
    })();

    return; // Already responded
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    await alertDev("whatsapp", "קריסת webhook ראשית", { error: err.message || String(err) }).catch(() => {});
    return res.status(500).json({ error: "internal error" });
  }
}

// ─── Pairing Suggestion Throttle ::──────

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

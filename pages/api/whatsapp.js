// pages/api/whatsapp.js
// WhatsApp webhook — Twilio → Auth/Pairing Layer → Inverted Intelligence Architecture → Twilio
// Layer 0 (new): Check pairing, handle auth flow (email → OTP → pair)
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
const OTP_EXPIRY_MINUTES = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;

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
 * Generate a random 6-digit OTP code.
 */
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Store OTP in whatsapp_otp table.
 * Upserts by phone so only one active OTP per phone at a time.
 */
async function storeOTP(supabase, phone, email, code) {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("whatsapp_otp")
    .upsert(
      { phone, email, code, expires_at: expiresAt, attempts: 0 },
      { onConflict: "phone" }
    );

  if (error) console.error("[whatsapp] storeOTP error:", error);
  return !error;
}

/**
 * Verify OTP code. Returns { valid: true, email } or { valid: false, reason }.
 */
async function verifyOTP(supabase, phone, code) {
  const { data, error } = await supabase
    .from("whatsapp_otp")
    .select("code, email, expires_at, attempts")
    .eq("phone", phone)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, reason: "no_otp" };
  }

  // Check expiry
  if (new Date(data.expires_at) < new Date()) {
    await supabase.from("whatsapp_otp").delete().eq("phone", phone);
    return { valid: false, reason: "expired" };
  }

  // Check attempts (max 5)
  if (data.attempts >= 5) {
    await supabase.from("whatsapp_otp").delete().eq("phone", phone);
    return { valid: false, reason: "too_many_attempts" };
  }

  // Increment attempts
  await supabase
    .from("whatsapp_otp")
    .update({ attempts: data.attempts + 1 })
    .eq("phone", phone);

  if (data.code !== code) {
    return { valid: false, reason: "wrong_code" };
  }

  // Valid — clean up OTP record
  await supabase.from("whatsapp_otp").delete().eq("phone", phone);
  return { valid: true, email: data.email };
}

/**
 * Create pairing between phone and user account.
 */
async function createPairing(supabase, phone, userId, email) {
  const { error } = await supabase
    .from("whatsapp_pairings")
    .insert({ phone, user_id: userId, email });

  if (error) console.error("[whatsapp] createPairing error:", error);
  return !error;
}

/**
 * Look up a user by email in Supabase Auth.
 * Returns user object or null.
 */
async function findUserByEmail(supabase, email) {
  // Use the admin API to list users filtered by email
  const { data, error } = await supabase.auth.admin.listUsers({
    filter: email,
    perPage: 1,
  });

  if (error) {
    console.error("[whatsapp] findUserByEmail error:", error);
    return null;
  }

  // listUsers returns { users: [...] }
  const users = data?.users || [];
  // Find exact match (filter is a substring match)
  return users.find((u) => u.email === email) || null;
}

/**
 * Send OTP code to user's email via Resend API.
 * Returns true if sent, false if no email service available.
 */
async function sendOTPEmail(email, code) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[whatsapp] No RESEND_API_KEY — cannot send OTP email");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "מגן <noreply@resend.dev>",
        to: [email],
        subject: "קוד אימות לחיבור וואטסאפ — מגן",
        html: `
          <div dir="rtl" style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 2rem;">
            <h2 style="color: #1c1917;">חיבור וואטסאפ לחשבון מגן</h2>
            <p>הקוד שלך לחיבור וואטסאפ:</p>
            <div style="font-size: 2rem; font-weight: bold; letter-spacing: 0.3em; background: #f5f5f4; padding: 1rem; text-align: center; border-radius: 8px; margin: 1rem 0;">
              ${code}
            </div>
            <p style="color: #57534e; font-size: 0.875rem;">הקוד תקף ל-${OTP_EXPIRY_MINUTES} דקות. אם לא ביקשת חיבור וואטסאפ, התעלם מהודעה זו.</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[whatsapp] Resend error:", res.status, text);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[whatsapp] sendOTPEmail error:", err);
    return false;
  }
}

/**
 * Mask email for display: "us**@gm***.com"
 */
function maskEmail(email) {
  const [local, domain] = email.split("@");
  const maskedLocal = local.slice(0, 2) + "**";
  const domainParts = domain.split(".");
  const maskedDomain = domainParts[0].slice(0, 2) + "***." + domainParts.slice(1).join(".");
  return `${maskedLocal}@${maskedDomain}`;
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
      return "החשבון נותק בהצלחה. אני עדיין כאן לעזור, אבל בלי הפרופיל האישי שלך. אפשר לחבר מחדש בכל עת על ידי שליחת כתובת המייל.";
    }
    return "אין חשבון מחובר כרגע. כדי לחבר חשבון, שלח את כתובת המייל שנרשמת איתה באתר מגן.";
  }

  // ── Already paired — no auth handling needed ──
  const pairing = await getPairing(supabase, phone);
  if (pairing) return null;

  // ── User sent an email address ──
  if (EMAIL_REGEX.test(trimmed)) {
    const email = trimmed.toLowerCase();

    // Verify email exists in auth system
    const user = await findUserByEmail(supabase, email);
    if (!user) {
      return "לא מצאתי חשבון עם כתובת המייל הזו באתר מגן. בדוק שהכתובת נכונה, או הירשם באתר magen.app ונסה שוב.";
    }

    // Generate OTP and store
    const code = generateOTP();
    const stored = await storeOTP(supabase, phone, email, code);
    if (!stored) {
      return "אירעה שגיאה. נסה שוב בעוד רגע.";
    }

    // Try to send OTP via email
    const emailSent = await sendOTPEmail(email, code);
    const masked = maskEmail(email);

    if (emailSent) {
      return `מצאתי את החשבון שלך. שלחתי קוד אימות בן 6 ספרות לכתובת ${masked}.\n\nבדוק את המייל ושלח לי את הקוד כאן.\nהקוד תקף ל-${OTP_EXPIRY_MINUTES} דקות.`;
    } else {
      // Fallback: no email service — tell user to check website
      // In a real scenario you'd want to ensure email delivery,
      // but for MVP we inform the user
      return `מצאתי את החשבון שלך (${masked}), אבל לא הצלחתי לשלוח מייל כרגע.\n\nנסה שוב בעוד כמה דקות, או פנה אלינו דרך האתר.`;
    }
  }

  // ── User sent a 6-digit code ──
  if (OTP_REGEX.test(trimmed)) {
    const result = await verifyOTP(supabase, phone, trimmed);

    if (result.valid) {
      // Look up the user again to get their ID
      const user = await findUserByEmail(supabase, result.email);
      if (user) {
        const paired = await createPairing(supabase, phone, user.id, result.email);
        if (paired) {
          return `החשבון חובר בהצלחה! מעכשיו אני מכיר את הפרופיל שלך ואוכל לעזור בצורה אישית יותר.\n\nכדי להתנתק בעתיד, שלח "התנתק".`;
        }
      }
      return "אירעה שגיאה בחיבור החשבון. נסה שוב.";
    }

    // Invalid OTP — give specific feedback
    switch (result.reason) {
      case "expired":
        return "הקוד פג תוקף. שלח שוב את כתובת המייל כדי לקבל קוד חדש.";
      case "too_many_attempts":
        return "יותר מדי ניסיונות. שלח שוב את כתובת המייל כדי לקבל קוד חדש.";
      case "wrong_code":
        return "הקוד שגוי. נסה שוב, או שלח את כתובת המייל מחדש לקבלת קוד חדש.";
      case "no_otp":
        // 6-digit number but no pending OTP — not an auth message
        // Fall through to normal chat
        return null;
      default:
        return null;
    }
  }

  // ── Not an auth message — return null (handled by normal chat) ──
  return null;
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

    // ── Layer 0: Auth flow ──────────────────────────────────────
    const authReply = await handleAuthFlow(supabase, from, message);
    if (authReply) {
      // Auth flow handled the message — save and respond
      await saveMessage(supabase, from, "user", message);
      await saveMessage(supabase, from, "assistant", authReply);
      await sendWhatsApp(from, authReply);
      return res.status(200).json({ ok: true, layer: "auth" });
    }

    // ── Layer 1+: Normal chat flow ──────────────────────────────

    // 1. Fetch conversation history
    const history = await getHistory(supabase, from);

    // 2. Save user message
    await saveMessage(supabase, from, "user", message);

    // 3. Build context — check for pairing to enrich with profile/memory
    const pairing = await getPairing(supabase, from);
    let profile = null;
    let memory = [];

    if (pairing) {
      const userCtx = await getUserContext(supabase, pairing.user_id);
      profile = userCtx.profile;
      memory = userCtx.memory;
    }

    // 4. Try inverted architecture
    let reply;
    let brief = null;

    const context = {
      recentMessages: history.slice(-6),
      clientHat: null,
      profile,
      memory,
      conversationId: from,
    };

    const result = await invertedChat(message, context, supabase);

    if (result) {
      reply = formatWhatsAppReply(result.reply, result.brief);
      brief = result.brief;
      console.log(`[whatsapp] Layer ${result.layer} | Hat: ${result.brief.hat} | Complexity: ${result.brief.complexity} | Paired: ${!!pairing}`);
    } else {
      console.warn("[whatsapp] Inverted architecture failed, using legacy");
      reply = await callClaudeLegacy(history, message);
    }

    // 5. If not paired, occasionally suggest pairing (append to reply)
    if (!pairing) {
      const shouldSuggest = await shouldSuggestPairing(supabase, from);
      if (shouldSuggest) {
        reply += "\n\n─────────────\nאגב, אם יש לך חשבון באתר מגן, שלח לי את המייל שנרשמת איתו ואני אחבר את החשבון שלך כדי שאוכל לעזור לך בצורה אישית יותר.";
      }
    }

    // 6. Save AI response
    await saveMessage(supabase, from, "assistant", reply);

    // 7. Send back via Twilio
    await sendWhatsApp(from, reply);

    return res.status(200).json({ ok: true, layer: result?.layer, paired: !!pairing });
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

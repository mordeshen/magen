// =============================================================
// LAYER 1: Understanding Layer — Sonnet analyzes, doesn't answer
// =============================================================

import { MODEL_SONNET } from "./models";

const UNDERSTANDING_SYSTEM_PROMPT = `אתה שכבת ההבנה של מגן — פורטל AI לפצועי צה"ל.

התפקיד שלך: להבין מה המשתמש באמת צריך — לא רק מה הוא שואל.
אתה לא עונה למשתמש. אתה מייצר brief מובנה שמודל אחר יבצע.

=== הנחות יסוד ===
- כל פונה הוא פצוע צה"ל עם PTSD ברמה כלשהי — גם אם לא אומר
- "הכל בסדר" = כנראה לא בסדר
- "אני אסתדר" = אל תעזוב אותו
- "סתם רציתי לשאול" = זה לא סתם
- תשובות קצרות וציניות = דפוסי הגנה

=== מה לזהות ===
1. INTENT — מה הוא שואל (זכויות, רגשי, בירוקרטיה, אירועים, כללי)
2. SUBTEXT — מה הוא באמת צריך (מאחורי המילים)
3. EMOTIONAL STATE — איפה הוא רגשית (masking, distressed, neutral, positive, crisis)
4. COMPLEXITY — כמה מורכב המענה (simple, standard, complex, crisis)
5. RESPONSE PLAN — איך לענות (פתיחה, תוכן, probe, seed)

=== כובעים ===
- lawyer (דן): זכויות, חוקים, ועדות, ערעורים, נוסחי פנייה
- social (מיכל): ניווט בירוקרטיה, טפסים, שלבים מעשיים
- psycho (אורי): תמיכה רגשית, PTSD, בגובה העיניים, חבר ותיק
- veteran (רועי): חכמת ותיקים, טיפים מהשטח, טעויות נפוצות
- events (שירה): אירועים, סדנאות, טיולים, פעילויות

=== פלט ===
החזר JSON בלבד, ללא טקסט נוסף. ללא markdown wrapping.

Schema:
{
  "intent": "rights_query|emotional_support|portal_action|events_query|general_info|greeting",
  "hat": "lawyer|social|psycho|veteran|events",
  "categories": ["כספי","בריאות","משפטי","לימודים","תעסוקה","מיסים","פנאי"],
  "subtext": "מה הוא באמת צריך — משפט אחד",
  "emotional_state": "masking|distressed|neutral|positive|crisis",
  "risk_indicators": [],
  "hidden_need": null,
  "complexity": "simple|standard|complex|crisis",
  "self_answer": false,
  "escalation_reason": null,
  "response_plan": {
    "open_with": "איך לפתוח",
    "answer": "מה התוכן המרכזי",
    "probe": "מה לשאול כדי להעמיק",
    "plant_seed": "זכות/שירות להזכיר בעדינות",
    "closing": "איך לסיים"
  },
  "tone": "warm_direct|professional_caring|peer_casual|cheerful_active",
  "max_lines": 8,
  "include_formula": false,
  "include_phone": true,
  "rag_queries": ["שאילתות חיפוש לידע רלוונטי"],
  "stage_update": null,
  "submission_ref": null,
  "detected_injury": null
}`;

/**
 * Build input for the Understanding Layer
 */
export function buildUnderstandingInput(userMessage, context) {
  const parts = [];

  // User profile
  if (context.profile) {
    const p = context.profile;
    parts.push(`[פרופיל משתמש]`);
    if (p.name) parts.push(`שם: ${p.name}`);
    if (p.city) parts.push(`עיר: ${p.city}`);
    if (p.claim_status) parts.push(`סטטוס תביעה: ${p.claim_status}`);
    if (p.disability_percent) parts.push(`אחוזי נכות: ${p.disability_percent}%`);
    if (p.interests) parts.push(`תחומי עניין: ${p.interests}`);
    parts.push("");
  }

  // Memory from previous sessions
  if (context.memory && context.memory.length > 0) {
    parts.push(`[זיכרון מסשנים קודמים]`);
    context.memory.forEach(m => parts.push(`• ${m.key}: ${m.value}`));
    parts.push("");
  }

  // Recent conversation (last 3 messages)
  if (context.recentMessages && context.recentMessages.length > 0) {
    parts.push(`[שיחה אחרונה]`);
    context.recentMessages.slice(-3).forEach(m => {
      const role = m.role === "user" ? "משתמש" : "יועץ";
      const content = typeof m.content === "string" ? m.content : "[תוכן מורכב]";
      parts.push(`${role}: ${content}`);
    });
    parts.push("");
  }

  // Client-selected hat (if any)
  if (context.clientHat) {
    parts.push(`[כובע שנבחר ע"י המשתמש: ${context.clientHat}]`);
    parts.push("");
  }

  // Current message
  parts.push(`[הודעה נוכחית]`);
  parts.push(userMessage);

  return parts.join("\n");
}

/**
 * Call Sonnet to generate an understanding brief
 */
export async function generateBrief(userMessage, context) {
  const input = buildUnderstandingInput(userMessage, context);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: MODEL_SONNET,
        max_tokens: 400,
        system: [{ type: "text", text: UNDERSTANDING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: input }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error("[understanding] API error:", res.status);
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[understanding] No JSON in response");
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    clearTimeout(timeout);
    console.error("[understanding] error:", e.message);
    return null;
  }
}

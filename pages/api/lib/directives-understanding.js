// =============================================================
// Layer 1: Query Understanding for Directives Pipeline
// Opus 4.6 — fast JSON extraction, no tool_use overhead
// =============================================================

import { MODEL_OPUS } from "./models";

const SYSTEM = `אתה מנתח שאילתות למערכת RAG של זכויות נכי צה"ל. החזר JSON בלבד.

צירי סיווג:
- journey_stages: first_days|recognition|active_rehab|stable_life|late_years|special_situation
- life_domains: money|medical|mental_health|family|housing|vehicle|career|education|taxes_fees|daily_life|bureaucracy
- disability_grades: 10-19|20-49|50-99|100|100+
- injury_type: physical|mental|blind|deaf|amputee|spinal|head|ptsd|all

כללים:
1. אל תמציא persona שלא נאמרה. null אם לא ידוע.
2. trigger_keywords = מילות מפתח בעברית שקשורות לשאלה (3-6 מילים).
3. life_domains = מקסימום 2, הראשון הכי רלוונטי.
4. complexity: simple=עובדתי ברור, medium=צריך כמה הוראות, complex=שיקול דעת/חישוב.
5. is_ambiguous=true אם חסר מידע קריטי. ambiguity_q=מה לשאול.

החזר JSON בלבד:
{"persona":{"disability_grade":null,"injury_type":null,"family_status":null,"age_bucket":null,"rehab_status":null},"intent":{"question":"ניסוח קצר","is_ambiguous":false,"ambiguity_q":null},"filters":{"journey_stages":[],"life_domains":[],"trigger_keywords":[]},"complexity":"simple","urgency":"low"}`;

export async function understandQuery(question, userPersona, recentMessages) {
  const parts = [];

  if (userPersona && Object.values(userPersona).some(Boolean)) {
    const bits = [];
    if (userPersona.disability_grade) bits.push(`נכות: ${userPersona.disability_grade}`);
    if (userPersona.injury_type) bits.push(`פגיעה: ${userPersona.injury_type}`);
    if (userPersona.family_status) bits.push(`משפחתי: ${userPersona.family_status}`);
    if (bits.length) parts.push(`[ידוע: ${bits.join(", ")}]`);
  }

  if (recentMessages?.length) {
    const last = recentMessages.slice(-2).map((m) =>
      `${m.role === "user" ? "שאלה" : "תשובה"}: ${(typeof m.content === "string" ? m.content : "").slice(0, 150)}`
    ).join("\n");
    parts.push(`[הקשר]\n${last}`);
  }

  parts.push(question);
  const userContent = parts.join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_OPUS,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[understanding] API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("[understanding] No JSON in response:", text.slice(0, 100));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Normalize to expected shape
    return {
      understanding: {
        user_persona_inferred: parsed.persona || {},
        intent: {
          primary_question: parsed.intent?.question || question,
          is_ambiguous: parsed.intent?.is_ambiguous || false,
          ambiguity_resolution_q: parsed.intent?.ambiguity_q || null,
        },
        search_filters: {
          journey_stages: parsed.filters?.journey_stages || [],
          life_domains: parsed.filters?.life_domains || [],
          trigger_keywords: parsed.filters?.trigger_keywords || [],
        },
        complexity: parsed.complexity || "medium",
        urgency: parsed.urgency || "low",
      },
      tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      model: MODEL_OPUS,
    };
  } catch (err) {
    clearTimeout(timeout);
    console.error("[understanding] Error:", err.message);
    return null;
  }
}

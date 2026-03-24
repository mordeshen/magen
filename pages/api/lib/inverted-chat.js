// =============================================================
// Inverted Intelligence Architecture — Main Orchestrator
// =============================================================
// Layer 1 (Sonnet): Understand → Brief
// Decision Gate: Route to Haiku or Sonnet
// Layer 2 (Haiku): Execute response from brief + RAG
// Layer 3 (Haiku): Learn from interaction (async)
// =============================================================

import { MODEL_SONNET } from "./models";
import { generateBrief } from "./understanding";
import { decisionGate } from "./decision-gate";
import { executeResponse } from "./execution";
import { fetchRAG } from "./rag";
import { logBrief, processLearning } from "./learning";

// Direct response prompt for Sonnet escape hatch
function buildDirectResponsePrompt(brief) {
  const hatNames = {
    lawyer: "דן — יועץ זכויות",
    social: "מיכל — מלווה בירוקרטיה",
    psycho: "אורי — חבר ותיק, תמיכה רגשית",
    veteran: "רועי — חכמת ותיקים",
    events: "שירה — אירועים ופעילויות",
  };

  const toneGuide = {
    warm_direct: "ישיר, חם, מקצועי",
    professional_caring: "מקצועי עם חום",
    peer_casual: "חבר ותיק, לא קליני",
    cheerful_active: "חברותי ומזמין",
  };

  return `אתה ${hatNames[brief.hat] || "יועץ מגן"}.
דבר בעברית ישראלית טבעית. טון: ${toneGuide[brief.tone] || "חם וישיר"}.
אורך תשובה: עד ${brief.max_lines || 8} שורות.

=== תוכנית תשובה ===
פתיחה: ${brief.response_plan?.open_with || "הכר ברגש"}
תוכן: ${brief.response_plan?.answer || "ענה על השאלה"}
${brief.response_plan?.probe ? `שאלת העמקה: ${brief.response_plan.probe}` : ""}
${brief.response_plan?.plant_seed ? `זריעה: ${brief.response_plan.plant_seed}` : ""}
סיום: ${brief.response_plan?.closing || "אני כאן, תחזור מתי שתרצה"}

=== כללים ===
- לעולם לא "בהצלחה" יבש — תמיד "אני כאן, תחזור"
- לעולם לא "כמה אחוזים?" — תמיד "איפה אתה עומד מול משרד הביטחון?"
- סיים עם שאלה או הצעה שמניעה לפעולה
${brief.include_phone ? "- כלול מספר טלפון רלוונטי" : ""}
${brief.include_formula ? "- כתוב נוסח פנייה בפורמט ---נוסח--- ... ---סוף נוסח---" : ""}
- קו חם: מוקד פצועים *6500 | נפש אחת *8944
${brief.complexity === "crisis" ? "- מצב חירום — הפנה מיד ל-*8944 (נפש אחת, 24/7, אנונימי)" : ""}`;
}

/**
 * Main handler — orchestrates the inverted architecture
 *
 * @param {string} userMessage - The user's message
 * @param {object} context - { profile, memory, recentMessages, clientHat, conversationId }
 * @param {object} supabase - Supabase admin client (for RAG + learning)
 * @returns {{ reply: string, brief: object, layer: number }}
 */
export async function invertedChat(userMessage, context, supabase) {
  // === LAYER 1: Understanding ===
  const brief = await generateBrief(userMessage, context);

  // Fallback: if understanding fails, return null (caller should use legacy system)
  if (!brief) {
    console.warn("[inverted-chat] Understanding layer failed, falling back to legacy");
    return null;
  }

  // Inject user city for event filtering
  if (context.profile?.city) {
    brief._userCity = context.profile.city;
  }

  // Honor client hat selection if provided
  if (context.clientHat && brief.hat !== context.clientHat) {
    brief.hat = context.clientHat;
  }

  // === DECISION GATE ===
  const layer = decisionGate(brief);
  let reply;

  if (layer === "sonnet_direct") {
    // === ESCAPE HATCH: Sonnet answers directly ===
    const ragResults = await fetchRAG(brief, supabase);
    const directPrompt = buildDirectResponsePrompt(brief);

    // Build context with RAG
    let contextBlock = "";
    if (ragResults.rights?.length > 0) {
      contextBlock += "\n\n[ידע זכויות]\n" +
        ragResults.rights.map(r => `• ${r.title}: ${r.details}`).join("\n");
    }
    if (ragResults.veteran?.length > 0) {
      contextBlock += "\n\n[חכמת ותיקים]\n" +
        ragResults.veteran.map(v => `• ${v.title}: ${v.content}`).join("\n");
    }
    if (ragResults.events?.length > 0) {
      contextBlock += "\n\n[אירועים]\n" +
        ragResults.events.map(e => `• ${e.title} — ${e.date} | ${e.location}`).join("\n");
    }

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
        max_tokens: 1000,
        system: [{ type: "text", text: directPrompt + contextBlock, cache_control: { type: "ephemeral" } }],
        messages: [
          ...(context.recentMessages || []).slice(-3),
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Sonnet direct error ${res.status}`);
    }

    const data = await res.json();
    reply = data.content?.[0]?.text || "מצטער, נסה שוב.";
  } else {
    // === LAYER 2: Haiku Execution ===
    const ragResults = await fetchRAG(brief, supabase);
    reply = await executeResponse(brief, ragResults, userMessage);
  }

  // === LAYER 3: Learning (async — non-blocking) ===
  const resolvedAtLayer = layer === "sonnet_direct" ? 1 : 2;

  // Fire and forget — don't await
  logBrief(supabase, {
    conversationId: context.conversationId,
    brief,
    responseText: reply,
    resolvedAtLayer,
  }).catch(() => {});

  processLearning(supabase, {
    brief,
    responseText: reply,
    userMessage,
  }).catch(() => {});

  return { reply, brief, layer: resolvedAtLayer };
}

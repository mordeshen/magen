import { getAdminSupabase } from "./supabase-admin";

// =============================================================
// Knowledge Provider — single source of truth for answer generation
// =============================================================
//
// Goal: switch between knowledge sources (Opus today, fine-tuned Gemma 4
// in the future) by changing one env var, without touching chat.js or
// any prompt-building code.
//
// KNOWLEDGE_MODE = "opus" (default) | "finetuned"
//
// In "opus" mode this returns { answer: null, source: "opus" } and chat.js
// continues with its existing Opus path. We never duplicate prompt-building.
//
// In "finetuned" mode it calls the fine-tuned endpoint, and falls back to
// Opus if the model reports low confidence, asks to escalate, or errors.
// =============================================================

const KNOWLEDGE_MODE = process.env.KNOWLEDGE_MODE || "opus";

// Endpoint of the fine-tuned model (Gemma 4 — wired up later)
const FINETUNED_API_URL = process.env.FINETUNED_API_URL || "";
const FINETUNED_API_KEY = process.env.FINETUNED_API_KEY || "";

// Confidence below this triggers Opus fallback. Tune when the model is live.
const FT_CONFIDENCE_THRESHOLD = parseFloat(process.env.FT_CONFIDENCE_THRESHOLD || "0.7");

/**
 * Get an answer from the active knowledge source.
 *
 * @param {string} userMessage     - The user's question
 * @param {object} context          - Personal context { profile, injuries, legalCase, memory, userId }
 * @param {object} ragResults       - RAG hits  { rights, events, veteran }
 * @param {Array}  recentMessages   - Recent conversation turns (last ~6)
 * @returns {{ answer: string|null, source: "opus"|"finetuned"|"opus_fallback", confidence: number }}
 *
 * Important: when source === "opus", `answer` is null on purpose — chat.js
 * is responsible for running the existing Opus pipeline. This keeps prompt
 * construction in one place.
 */
export async function getKnowledgeResponse(userMessage, context, ragResults, recentMessages) {
  if (KNOWLEDGE_MODE === "finetuned" && FINETUNED_API_URL) {
    return await tryFinetunedWithFallback(userMessage, context, ragResults, recentMessages);
  }
  return await getOpusResponse(userMessage, context, ragResults, recentMessages);
}

async function tryFinetunedWithFallback(userMessage, context, ragResults, recentMessages) {
  try {
    const ftResponse = await callFinetuned(userMessage, context);

    // If the fine-tuned model isn't confident enough, fall back to Opus and
    // log the question so we can improve the next training round.
    if (ftResponse.confidence < FT_CONFIDENCE_THRESHOLD || ftResponse.needsEscalation) {
      console.log(
        `[knowledge] finetuned confidence=${ftResponse.confidence}, escalation=${ftResponse.needsEscalation} → Opus fallback`
      );

      await logMissingKnowledge(userMessage, ftResponse, context);

      const opusResponse = await getOpusResponse(userMessage, context, ragResults, recentMessages);
      return { ...opusResponse, source: "opus_fallback" };
    }

    return {
      answer: ftResponse.answer,
      source: "finetuned",
      confidence: ftResponse.confidence,
    };
  } catch (err) {
    console.error("[knowledge] finetuned call failed, falling back to Opus:", err.message);
    const opusResponse = await getOpusResponse(userMessage, context, ragResults, recentMessages);
    return { ...opusResponse, source: "opus_fallback" };
  }
}

/**
 * Call the fine-tuned model. Real implementation comes when the model is
 * deployed — for now this is a placeholder that demonstrates the interface
 * but is never reached because KNOWLEDGE_MODE defaults to "opus".
 *
 * The exact request/response shape will depend on the serving stack
 * (vLLM, Ollama, Modal, custom). Adjust callFinetuned() then, not anywhere
 * else in the codebase.
 */
async function callFinetuned(userMessage, context) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const MODEL = process.env.MAGEN_OPENAI_MODEL;

  if (!OPENAI_KEY || !MODEL) {
    throw new Error("OPENAI_API_KEY or MAGEN_OPENAI_MODEL not set");
  }

  const systemPrompt = `אתה מגן — מומחה בזכויות נכי צה"ל. ענה בעברית, ישיר, קצר (2-4 משפטים).
אם אתה לא בטוח בתשובה או שהשאלה מורכבת — תגיד "לא בטוח" ואני אעביר למומחה.
${context.profile ? `פרופיל: ${JSON.stringify({ name: context.profile.name, city: context.profile.city, disability_percent: context.profile.disability_percent, claim_status: context.profile.claim_status })}` : ""}
${context.legalCase ? `שלב משפטי: ${context.legalCase.stage}` : ""}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}`);
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content || "";

  // Detect low confidence from the model's own text
  const lowConfidenceSignals = ["לא בטוח", "לא יודע", "אין לי מידע", "צריך לבדוק", "לא ברור לי"];
  const needsEscalation = lowConfidenceSignals.some(s => answer.includes(s));
  const confidence = needsEscalation ? 0.3 : 0.8;

  console.log(`[knowledge] v14b answered (${data.usage?.total_tokens || 0} tokens, confidence: ${confidence})`);

  return {
    answer,
    confidence,
    needsEscalation,
  };
}

/**
 * Returns a sentinel that tells chat.js: "stay on the existing Opus pipeline."
 * We keep prompt construction inside chat.js (single source of truth) instead
 * of duplicating it here.
 */
async function getOpusResponse(_userMessage, _context, _ragResults, _recentMessages) {
  return {
    answer: null,
    source: "opus",
    confidence: 1.0,
  };
}

/**
 * Log fine-tuned questions that fell back to Opus, so we can curate better
 * training data for the next round.
 */
async function logMissingKnowledge(userMessage, ftResponse, context) {
  const entry = {
    question: userMessage,
    finetuned_answer: ftResponse.answer || null,
    finetuned_confidence: ftResponse.confidence ?? null,
    reason: ftResponse.needsEscalation
      ? "escalation"
      : (ftResponse.confidence < FT_CONFIDENCE_THRESHOLD ? "low_confidence" : "error"),
    user_context_summary: {
      disability_percent: context?.profile?.disability_percent || null,
      injury_types: context?.injuries?.map((i) => i.hebrew_label) || [],
      legal_stage: context?.legalCase?.stage || null,
    },
  };
  console.log("[knowledge] MISSING:", JSON.stringify(entry));

  try {
    const admin = getAdminSupabase();
    const { error } = await admin.from("missing_knowledge").insert(entry);
    if (error) console.error("[knowledge] missing_knowledge insert failed:", error.message);
  } catch (err) {
    console.error("[knowledge] logMissingKnowledge supabase error:", err.message);
  }
}

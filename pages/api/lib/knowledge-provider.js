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
  const systemBlocks = [
    {
      role: "system",
      content: 'אתה מומחה בזכויות נכי צה"ל. ענה בעברית, ישיר ופרקטי. אם אינך בטוח — החזר confidence נמוך והסבר מה חסר.',
    },
  ];
  if (context.profile) {
    systemBlocks.push({
      role: "system",
      content: `פרופיל משתמש: ${JSON.stringify(context.profile)}`,
    });
  }

  const response = await fetch(FINETUNED_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(FINETUNED_API_KEY && { Authorization: `Bearer ${FINETUNED_API_KEY}` }),
    },
    body: JSON.stringify({
      messages: [
        ...systemBlocks,
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Finetuned API returned ${response.status}`);
  }

  const data = await response.json();

  // Tolerate multiple response shapes — adapt when the real endpoint is wired.
  return {
    answer: data.choices?.[0]?.message?.content || data.content || data.answer || "",
    confidence: typeof data.confidence === "number" ? data.confidence : 0.5,
    needsEscalation: data.needs_escalation === true,
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

import { getAdminSupabase } from "./supabase-admin";
import { alertDev } from "./alert";

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

// Fallback alerts to Telegram are throttled so a noisy V5 session doesn't spam.
// Only the first fallback in each 10-min window alerts; the rest stay in
// Supabase's missing_knowledge table + Railway logs.
const FALLBACK_ALERT_THROTTLE_MS = 10 * 60 * 1000;
let _lastFallbackAlertAt = 0;

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
    const ftResponse = await callFinetuned(userMessage, context, ragResults, recentMessages);

    // If the fine-tuned model isn't confident enough, fall back to Opus and
    // log the question so we can improve the next training round.
    if (ftResponse.confidence < FT_CONFIDENCE_THRESHOLD || ftResponse.needsEscalation) {
      console.log(
        `[knowledge] finetuned confidence=${ftResponse.confidence}, escalation=${ftResponse.needsEscalation} → Opus fallback`
      );

      const now = Date.now();
      if (now - _lastFallbackAlertAt > FALLBACK_ALERT_THROTTLE_MS) {
        _lastFallbackAlertAt = now;
        const reason = ftResponse.needsEscalation ? "escalation signal" : `low confidence ${ftResponse.confidence}`;
        alertDev("v5", `fallback to Opus (${reason})`, {
          extra: `q: ${userMessage.slice(0, 80)}`,
        }).catch(() => {});
      }

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
    alertDev("v5", "call failed — falling back to Opus", {
      error: err.message,
      extra: `q: ${userMessage.slice(0, 80)}`,
    }).catch(() => {});
    const opusResponse = await getOpusResponse(userMessage, context, ragResults, recentMessages);
    return { ...opusResponse, source: "opus_fallback" };
  }
}

/**
 * Call the fine-tuned V5 model (Gemma 4 + Magen LoRA) served via an
 * OpenAI-compatible endpoint (Modal / vLLM / HF Endpoints / local MLX).
 *
 * FINETUNED_API_URL should point at the chat-completions endpoint base
 * (e.g. https://<modal-app>.modal.run/v1). FINETUNED_API_KEY is optional
 * (local MLX doesn't require one).
 *
 * RAG results are injected as a system block so V5 answers with facts
 * from the knowledge base, not just its trained intuition.
 */
async function callFinetuned(userMessage, context, ragResults, recentMessages) {
  if (!FINETUNED_API_URL) {
    throw new Error("FINETUNED_API_URL not set");
  }

  const systemPrompt = buildFinetunedSystemPrompt(context, ragResults);
  const history = (recentMessages || [])
    .filter((m) => m && m.role && m.content)
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content }));

  const url = FINETUNED_API_URL.replace(/\/$/, "") + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (FINETUNED_API_KEY) headers.Authorization = `Bearer ${FINETUNED_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      max_tokens: 400,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`finetuned endpoint returned ${response.status}`);
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content || "";

  const lowConfidenceSignals = ["לא בטוח", "לא יודע", "אין לי מידע", "צריך לבדוק", "לא ברור לי"];
  const needsEscalation = lowConfidenceSignals.some((s) => answer.includes(s));
  const ragHits = (ragResults?.rights?.length || 0) + (ragResults?.veteran?.length || 0);
  const confidence = needsEscalation ? 0.3 : (ragHits > 0 ? 0.85 : 0.65);

  console.log(`[knowledge] V5 answered (${data.usage?.total_tokens || 0} tokens, rag_hits=${ragHits}, confidence=${confidence})`);

  return { answer, confidence, needsEscalation };
}

function buildFinetunedSystemPrompt(context, ragResults) {
  const lines = [
    'אתה מגן — מומחה בזכויות נכי צה"ל. ענה בעברית, ישיר, חם, בסגנון שאומן עליו.',
    'אם תוצאות ה-RAG למטה לא מכסות את השאלה או שאתה לא בטוח בפרט מסוים — תגיד "לא בטוח" במקום להמציא.',
  ];

  if (context?.profile) {
    const p = context.profile;
    lines.push(`פרופיל: ${JSON.stringify({
      name: p.name, city: p.city,
      disability_percent: p.disability_percent,
      claim_status: p.claim_status,
    })}`);
  }
  if (context?.legalCase?.stage) {
    lines.push(`שלב משפטי: ${context.legalCase.stage}`);
  }

  const rights = (ragResults?.rights || []).slice(0, 3);
  const veteran = (ragResults?.veteran || []).slice(0, 2);
  if (rights.length || veteran.length) {
    lines.push("\n=== ידע רלוונטי (RAG) — השתמש רק בעובדות מכאן ===");
    for (const r of rights) {
      lines.push(`• ${r.title || r.category || "זכות"}: ${r.summary || ""}${r.practical_tip ? ` טיפ: ${r.practical_tip}` : ""}${r.phone_number ? ` טלפון: ${r.phone_number}` : ""}`);
    }
    for (const v of veteran) {
      lines.push(`• ${v.title || "ידע"}: ${v.summary || v.content || ""}`);
    }
  }

  return lines.join("\n");
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

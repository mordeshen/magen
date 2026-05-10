// =============================================================
// POST /api/ask — Directives Knowledge Pipeline (SSE Streaming)
// =============================================================
// Streams progress steps + final answer via Server-Sent Events.
// Each step sends a "thinking" event, final answer streams as "answer" events.
// =============================================================

import { createClient } from "@supabase/supabase-js";
import { understandQuery } from "./lib/directives-understanding";
import { filterDirectives, hybridRetrieve, rerankIfAmbiguous } from "./lib/directives-retrieval";
import { synthesizeStream } from "./lib/directives-synthesis";
import { lookupCaseBank, checkCache, storeCache, captureQA } from "./lib/directives-cache";
import { alertDev } from "./lib/alert";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const startTime = Date.now();
  const { question, user_persona, recent_messages, user_id, stream } = req.body;

  if (!question || typeof question !== "string" || question.trim().length < 2) {
    return res.status(400).json({ error: "Missing or invalid question" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Server configuration error" });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Non-streaming mode (backwards compatible)
  if (!stream) {
    return handleNonStreaming(req, res, { question, user_persona, recent_messages, supabase, startTime });
  }

  // === SSE Streaming Mode ===
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  function sendEvent(type, data) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }

  try {
    // === Layer 0a: Case Bank ===
    sendEvent("thinking", { step: "בודק תשובות קודמות..." });
    const caseHit = await lookupCaseBank(supabase, question);
    if (caseHit) {
      sendEvent("answer", { text: caseHit.answer, citations: caseHit.citations, source: "case_bank" });
      sendEvent("done", { latency_ms: Date.now() - startTime });
      return res.end();
    }

    // === Layer 0b: Cache ===
    const cacheHit = await checkCache(supabase, question, user_persona);
    if (cacheHit) {
      sendEvent("answer", { text: cacheHit.answer, citations: cacheHit.citations, source: "cache" });
      sendEvent("done", { latency_ms: Date.now() - startTime });
      return res.end();
    }

    // === Layer 1: Understanding ===
    sendEvent("thinking", { step: "מבין את השאלה..." });
    const understandingResult = await understandQuery(question, user_persona, recent_messages);
    if (!understandingResult) {
      sendEvent("error", { message: "לא הצלחתי להבין את השאלה. נסה לנסח אחרת." });
      return res.end();
    }

    const { understanding } = understandingResult;
    const domains = understanding.search_filters?.life_domains || [];
    const domainNames = {
      housing: "דיור", vehicle: "רכב", money: "כספי", medical: "רפואי",
      mental_health: "בריאות הנפש", career: "תעסוקה", education: "לימודים",
      taxes_fees: "מיסים", family: "משפחה", daily_life: "יומיום", bureaucracy: "בירוקרטיה",
    };
    const domainLabel = domains.map((d) => domainNames[d] || d).join(", ");

    // === Layer 2: Filter ===
    sendEvent("thinking", { step: `מחפש הוראות בתחום ${domainLabel}...` });
    const filteredDirectives = await filterDirectives(supabase, understanding.search_filters, understanding.user_persona_inferred);
    let searchNumbers = filteredDirectives.map((d) => d.number);

    if (!searchNumbers.length) {
      const { data: all } = await supabase.from("directives").select("number").limit(30);
      searchNumbers = (all || []).map((d) => d.number);
    }

    sendEvent("thinking", { step: `נמצאו ${searchNumbers.length} הוראות רלוונטיות, מאחזר מידע מדויק...` });

    // === Layer 3: Retrieval ===
    const triggerKeywords = understanding.search_filters?.trigger_keywords || [];
    const chunks = await hybridRetrieve(supabase, understanding.intent?.primary_question || question, searchNumbers, triggerKeywords);

    if (!chunks.length) {
      sendEvent("answer", {
        text: "לא מצאתי מידע מדויק על השאלה הזו בהוראות אגף השיקום. מומלץ לפנות לעובד השיקום במחוז שלך או להתקשר למוקד *6500.",
        citations: [], source: "no_results",
      });
      sendEvent("done", { latency_ms: Date.now() - startTime });
      return res.end();
    }

    // === Layer 4: Re-rank ===
    const rerankedChunks = await rerankIfAmbiguous(chunks, question);
    const enrichedChunks = rerankedChunks.map((chunk) => {
      const dir = filteredDirectives.find((d) => d.number === chunk.directive_number);
      return { ...chunk, must_pair_with: dir?.must_pair_with || [], conflicts_with: dir?.conflicts_with || [] };
    });

    const directiveNumbers = [...new Set(enrichedChunks.map((c) => c.directive_number))];
    sendEvent("thinking", { step: `קורא הוראות ${directiveNumbers.join(", ")} ומנסח תשובה...` });

    // === Layer 5: Synthesis (streaming) ===
    const synthesisResult = await synthesizeStream(
      question, enrichedChunks, understanding, understanding.user_persona_inferred, recent_messages,
      (chunk) => sendEvent("answer_chunk", { text: chunk })
    );

    if (!synthesisResult) {
      sendEvent("error", { message: "שגיאה בניסוח התשובה. נסה שוב." });
      return res.end();
    }

    const latencyMs = Date.now() - startTime;

    sendEvent("answer_done", {
      citations: synthesisResult.citations,
      directives_used: directiveNumbers,
      complexity: understanding.complexity,
      model: synthesisResult.model,
      latency_ms: latencyMs,
      ...(understanding.intent?.is_ambiguous ? { clarification_needed: understanding.intent.ambiguity_resolution_q } : {}),
    });
    sendEvent("done", { latency_ms: latencyMs });
    res.end();

    // === Layer 6: Capture (async) ===
    captureQA(supabase, {
      question, userPersona: understanding.user_persona_inferred, understanding,
      retrievedDirectives: directiveNumbers,
      retrievedChunkIds: enrichedChunks.map((c) => c.id).filter(Boolean),
      answer: synthesisResult.text, citations: synthesisResult.citations,
      modelUnderstanding: understandingResult.model, modelSynthesis: synthesisResult.model, latencyMs,
    }).catch(() => {});

    storeCache(supabase, question, user_persona, {
      answer: synthesisResult.text, citations: synthesisResult.citations,
    }).catch(() => {});

  } catch (err) {
    console.error("[ask] Fatal:", err);
    sendEvent("error", { message: "שגיאה פנימית. נסה שוב." });
    res.end();
    alertDev(`/api/ask fatal: ${err.message}`).catch(() => {});
  }
}

// Non-streaming handler (original behavior)
async function handleNonStreaming(req, res, { question, user_persona, recent_messages, supabase, startTime }) {
  try {
    const caseHit = await lookupCaseBank(supabase, question);
    if (caseHit) {
      return res.status(200).json({ answer: caseHit.answer, citations: caseHit.citations, source: "case_bank", latency_ms: Date.now() - startTime });
    }

    const cacheHit = await checkCache(supabase, question, user_persona);
    if (cacheHit) {
      return res.status(200).json({ answer: cacheHit.answer, citations: cacheHit.citations, source: "cache", latency_ms: Date.now() - startTime });
    }

    const understandingResult = await understandQuery(question, user_persona, recent_messages);
    if (!understandingResult) return res.status(500).json({ error: "Understanding layer failed" });

    const { understanding } = understandingResult;

    const filteredDirectives = await filterDirectives(supabase, understanding.search_filters, understanding.user_persona_inferred);
    let searchNumbers = filteredDirectives.map((d) => d.number);
    if (!searchNumbers.length) {
      const { data: all } = await supabase.from("directives").select("number").limit(30);
      searchNumbers = (all || []).map((d) => d.number);
    }

    const triggerKeywords = understanding.search_filters?.trigger_keywords || [];
    const chunks = await hybridRetrieve(supabase, understanding.intent?.primary_question || question, searchNumbers, triggerKeywords);

    if (!chunks.length) {
      return res.status(200).json({ answer: "לא מצאתי מידע מדויק. מומלץ לפנות לעובד השיקום במחוז או למוקד *6500.", citations: [], source: "no_results", latency_ms: Date.now() - startTime });
    }

    const rerankedChunks = await rerankIfAmbiguous(chunks, question);
    const enrichedChunks = rerankedChunks.map((chunk) => {
      const dir = filteredDirectives.find((d) => d.number === chunk.directive_number);
      return { ...chunk, must_pair_with: dir?.must_pair_with || [], conflicts_with: dir?.conflicts_with || [] };
    });

    const { synthesize } = await import("./lib/directives-synthesis");
    const synthesisResult = await synthesize(question, enrichedChunks, understanding, understanding.user_persona_inferred, recent_messages);
    if (!synthesisResult) return res.status(500).json({ error: "Synthesis layer failed" });

    const latencyMs = Date.now() - startTime;
    const directiveNumbers = [...new Set(enrichedChunks.map((c) => c.directive_number))];

    captureQA(supabase, {
      question, userPersona: understanding.user_persona_inferred, understanding,
      retrievedDirectives: directiveNumbers, retrievedChunkIds: enrichedChunks.map((c) => c.id).filter(Boolean),
      answer: synthesisResult.text, citations: synthesisResult.citations,
      modelUnderstanding: understandingResult.model, modelSynthesis: synthesisResult.model, latencyMs,
    }).catch(() => {});

    storeCache(supabase, question, user_persona, { answer: synthesisResult.text, citations: synthesisResult.citations }).catch(() => {});

    return res.status(200).json({
      answer: synthesisResult.text, citations: synthesisResult.citations,
      directives_used: directiveNumbers, complexity: understanding.complexity,
      model: synthesisResult.model, source: "pipeline", latency_ms: latencyMs,
      ...(understanding.intent?.is_ambiguous ? { clarification_needed: understanding.intent.ambiguity_resolution_q } : {}),
    });
  } catch (err) {
    console.error("[ask] Fatal:", err);
    alertDev(`/api/ask fatal: ${err.message}`).catch(() => {});
    return res.status(500).json({ error: "Internal error" });
  }
}

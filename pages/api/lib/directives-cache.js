// =============================================================
// Layer 0a: Case Bank Lookup (semantic Q&A history)
// Layer 0b: Response Cache (hash-based exact match, 24h TTL)
// Layer 6: Capture for Learning (save Q&A for future use)
// =============================================================

import { createHash } from "crypto";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

async function embedQuery(text) {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "voyage-multilingual-2",
        input: [text],
        input_type: "query",
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

function normalizeQuestion(text) {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.]+$/, "")
    .toLowerCase();
}

function cacheKey(question, persona) {
  const normalized = normalizeQuestion(question);
  const personaHash = persona
    ? createHash("md5").update(JSON.stringify(persona)).digest("hex").slice(0, 8)
    : "anon";
  return createHash("sha256").update(`${normalized}|${personaHash}`).digest("hex");
}

// Layer 0a: Semantic case bank lookup
export async function lookupCaseBank(supabase, question, minSimilarity = 0.92) {
  if (!supabase) return null;

  const embedding = await embedQuery(question);
  if (!embedding) return null;

  try {
    const { data, error } = await supabase.rpc("search_qa_cases", {
      query_embedding: embedding,
      min_similarity: minSimilarity,
      match_count: 1,
      only_verified: true,
    });

    if (error || !data?.length) return null;

    const match = data[0];
    if (match.similarity < minSimilarity) return null;

    console.log(`[case-bank] Hit! similarity=${match.similarity.toFixed(3)}, id=${match.id}`);
    return {
      answer: match.answer_text,
      citations: match.answer_citations,
      source: "case_bank",
      caseId: match.id,
      similarity: match.similarity,
    };
  } catch (err) {
    console.warn("[case-bank] Lookup error:", err.message);
    return null;
  }
}

// Layer 0b: Exact cache check
export async function checkCache(supabase, question, persona) {
  if (!supabase) return null;

  const key = cacheKey(question, persona);

  try {
    const { data, error } = await supabase
      .from("response_cache")
      .select("response, expires_at")
      .eq("cache_key", key)
      .single();

    if (error || !data) return null;

    // Check TTL
    if (new Date(data.expires_at) < new Date()) {
      // Expired — delete async
      supabase.from("response_cache").delete().eq("cache_key", key).then(() => {});
      return null;
    }

    // Update hit count async
    supabase
      .from("response_cache")
      .update({ hit_count: (data.hit_count || 0) + 1, last_hit_at: new Date().toISOString() })
      .eq("cache_key", key)
      .then(() => {});

    console.log(`[cache] Hit! key=${key.slice(0, 12)}...`);
    return { ...data.response, source: "cache" };
  } catch {
    return null;
  }
}

// Layer 0b: Store in cache
export async function storeCache(supabase, question, persona, response) {
  if (!supabase) return;

  const key = cacheKey(question, persona);
  const TTL_HOURS = 24;
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString();

  try {
    await supabase.from("response_cache").upsert({
      cache_key: key,
      response,
      expires_at: expiresAt,
      hit_count: 0,
      last_hit_at: null,
    }, { onConflict: "cache_key" });
  } catch (err) {
    console.warn("[cache] Store error:", err.message);
  }
}

// Layer 6: Capture Q&A for learning
export async function captureQA(supabase, {
  question,
  userPersona,
  understanding,
  retrievedDirectives,
  retrievedChunkIds,
  answer,
  citations,
  modelUnderstanding,
  modelSynthesis,
  latencyMs,
}) {
  if (!supabase) return;

  const embedding = await embedQuery(question);
  if (!embedding) {
    console.warn("[capture] Skipped — no embedding");
    return;
  }

  try {
    await supabase.from("qa_cases").insert({
      question_raw: question,
      question_normalized: normalizeQuestion(question),
      question_embedding: embedding,
      user_persona: userPersona || {},
      understanding_json: understanding || {},
      retrieved_directives: retrievedDirectives || [],
      retrieved_chunk_ids: retrievedChunkIds || [],
      answer_text: answer,
      answer_citations: citations || [],
      model_understanding: modelUnderstanding,
      model_synthesis: modelSynthesis,
      latency_ms: latencyMs,
      verification_status: "unverified",
    });
    console.log("[capture] Q&A case saved");
  } catch (err) {
    console.warn("[capture] Error:", err.message);
  }
}

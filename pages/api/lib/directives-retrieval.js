// =============================================================
// Directives Retrieval Layer — Metadata filter + Hybrid search
// =============================================================
// Layer 2: SQL pre-filtering by frontmatter axes
// Layer 3: Vector + BM25 + keyword, RRF fusion → top 5 chunks
// Layer 4: Conditional re-rank (only if top-1 ambiguous)
// =============================================================

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";

async function getQueryEmbedding(text) {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;

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
}

// Layer 2: Metadata pre-filtering — narrows 144 directives to 3-15
export async function filterDirectives(supabase, searchFilters, userPersona) {
  if (!supabase) return [];

  const { journey_stages, life_domains, must_match_personas, trigger_keywords } = searchFilters;

  // Strategy: first try strict filter (primary domain only), then widen if needed
  let data = await runFilter(supabase, {
    journey_stages,
    life_domains: life_domains?.slice(0, 1), // primary domain only
    userPersona,
    must_match_personas,
    trigger_keywords,
    limit: 15,
  });

  // If too few results with strict filter, widen to all domains
  if (data.length < 3 && life_domains?.length > 1) {
    data = await runFilter(supabase, {
      journey_stages,
      life_domains,
      userPersona,
      must_match_personas,
      trigger_keywords,
      limit: 15,
    });
  }

  return data;
}

async function runFilter(supabase, { journey_stages, life_domains, userPersona, must_match_personas, trigger_keywords, limit }) {
  let query = supabase
    .from("directives")
    .select("number, title, summary_text, journey_stages, life_domains, trigger_keywords, must_pair_with, conflicts_with");

  if (life_domains?.length) {
    query = query.overlaps("life_domains", life_domains);
  }
  if (journey_stages?.length) {
    query = query.overlaps("journey_stages", journey_stages);
  }

  // Trigger keyword matching — boost relevance
  if (trigger_keywords?.length) {
    query = query.overlaps("trigger_keywords", trigger_keywords);
  }

  // Persona-based filtering
  if (must_match_personas?.disability_grade && userPersona?.disability_grade) {
    query = query.or(
      `applies_disability_grades.cs.{${userPersona.disability_grade}},applies_disability_grades.cs.{all}`
    );
  }
  if (must_match_personas?.injury_type && userPersona?.injury_type) {
    query = query.or(
      `applies_injury_types.cs.{${userPersona.injury_type}},applies_injury_types.cs.{all}`
    );
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    console.warn("[retrieval] Filter error:", error.message);
    return [];
  }

  return data || [];
}

// Layer 3: Hybrid retrieval within filtered set
export async function hybridRetrieve(supabase, question, filteredNumbers, triggerKeywords) {
  if (!supabase || !filteredNumbers?.length) return [];

  // Run vector + FTS + keyword in parallel
  const [vectorResults, ftsResults, keywordResults] = await Promise.all([
    vectorSearch(supabase, question, filteredNumbers),
    fullTextSearch(supabase, question, filteredNumbers),
    keywordMatch(supabase, triggerKeywords, filteredNumbers),
  ]);

  // RRF Fusion (k=60)
  const K = 60;
  const scores = new Map();

  function addRRF(results, weight = 1.0) {
    results.forEach((r, rank) => {
      const id = r.id;
      const score = (scores.get(id)?.score || 0) + weight / (K + rank + 1);
      scores.set(id, { ...r, score });
    });
  }

  addRRF(vectorResults, 1.0);
  addRRF(ftsResults, 0.8);
  addRRF(keywordResults, 0.6);

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function vectorSearch(supabase, question, directiveNumbers) {
  const embedding = await getQueryEmbedding(question);
  if (!embedding) return [];

  const { data, error } = await supabase.rpc("search_directive_chunks", {
    query_embedding: embedding,
    filter_directive_numbers: directiveNumbers,
    match_count: 10,
  });

  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    directive_number: d.directive_number,
    section_title: d.section_title,
    content: d.content,
    similarity: d.similarity,
    source: "vector",
  }));
}

async function fullTextSearch(supabase, question, directiveNumbers) {
  // Build tsquery from question words (OR-connected)
  const words = question
    .replace(/[^֐-׿\s\w]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (!words.length) return [];

  const tsquery = words.join(" | ");

  const { data, error } = await supabase.rpc("search_chunks_fts", {
    search_query: tsquery,
    filter_directive_numbers: directiveNumbers,
    match_count: 10,
  });

  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    directive_number: d.directive_number,
    section_title: d.section_title,
    content: d.content,
    rank: d.rank,
    source: "fts",
  }));
}

async function keywordMatch(supabase, triggerKeywords, directiveNumbers) {
  if (!triggerKeywords?.length) return [];

  // Find chunks from directives whose trigger_keywords overlap with the query
  const { data, error } = await supabase
    .from("directive_chunks")
    .select("id, directive_number, section_title, content")
    .in("directive_number", directiveNumbers)
    .limit(10);

  if (error || !data) return [];

  // Score by keyword presence in content
  return data
    .map((chunk) => {
      const hits = triggerKeywords.filter((kw) => chunk.content.includes(kw));
      return { ...chunk, keywordHits: hits.length, source: "keyword" };
    })
    .filter((c) => c.keywordHits > 0)
    .sort((a, b) => b.keywordHits - a.keywordHits);
}

// Layer 4: Conditional re-rank
export async function rerankIfAmbiguous(chunks, question) {
  if (chunks.length < 2) return chunks;

  const top1Score = chunks[0].score || chunks[0].similarity || 0;
  const top2Score = chunks[1].score || chunks[1].similarity || 0;
  const gap = top1Score - top2Score;

  // Only re-rank if top scores are close
  if (gap >= 0.05) return chunks;

  const key = process.env.VOYAGE_API_KEY;
  if (!key) return chunks;

  try {
    const res = await fetch(VOYAGE_RERANK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "rerank-2",
        query: question,
        documents: chunks.map((c) => c.content.slice(0, 2000)),
        top_k: 5,
      }),
    });

    if (!res.ok) return chunks;

    const data = await res.json();
    return data.results.map((r) => ({
      ...chunks[r.index],
      rerankScore: r.relevance_score,
    }));
  } catch {
    return chunks;
  }
}

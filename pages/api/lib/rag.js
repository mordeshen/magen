// =============================================================
// RAG Layer — Knowledge retrieval for the execution layer
// =============================================================

import { readFileSync } from "fs";
import { join } from "path";

// Cache loaded JSON data
let _rights = null;
let _events = null;

/**
 * Generate embedding via OpenAI (for semantic search)
 * Returns null if OPENAI_API_KEY not set
 */
async function getQueryEmbedding(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

/**
 * Semantic search using embeddings (best quality)
 */
async function searchRightsSemantic(supabase, queries, categories) {
  if (!supabase || !queries?.length) return null;

  const searchText = queries.join(" ");
  const embedding = await getQueryEmbedding(searchText);
  if (!embedding) return null;

  try {
    const { data, error } = await supabase.rpc("search_rights", {
      query_embedding: embedding,
      match_count: 5,
      filter_categories: categories?.length ? categories : null,
    });

    if (error || !data?.length) return null;

    console.log(`[RAG] rights source: semantic search (${data.length} results, top similarity: ${data[0].similarity?.toFixed(3)})`);
    return data.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      summary: r.summary,
      details: r.details,
      practical_tip: r.practical_tip,
      phone_number: r.phone_number,
      formula_template: r.formula_template,
      _score: r.similarity,
      _source: "semantic",
    }));
  } catch (err) {
    console.warn("[RAG] Semantic search failed:", err?.message);
    return null;
  }
}

function loadRights() {
  if (_rights) return _rights;
  try {
    _rights = JSON.parse(readFileSync(join(process.cwd(), "data", "rights.json"), "utf8"));
  } catch { _rights = []; }
  return _rights;
}

function loadEvents() {
  if (_events) return _events;
  try {
    _events = JSON.parse(readFileSync(join(process.cwd(), "data", "events.json"), "utf8"));
  } catch { _events = []; }
  return _events;
}

/**
 * Search rights from Supabase `rights_knowledge` table.
 * Tries the `search_rights_keyword` RPC first; falls back to ilike queries.
 * Returns results in the same shape as the local searchRightsKeyword.
 */
async function searchRightsSupabase(supabase, queries, categories) {
  if (!supabase || !queries?.length) return null;

  try {
    // --- Attempt 1: RPC function ---
    const searchTerm = queries.join(" ");
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "search_rights_keyword",
      {
        search_term: searchTerm,
        ...(categories?.length ? { filter_categories: categories } : {}),
      }
    );

    if (!rpcError && rpcData?.length) {
      console.log(`[RAG] rights source: Supabase RPC (${rpcData.length} results)`);
      return rpcData.slice(0, 5).map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        summary: r.summary,
        details: r.details,
        tip: r.tip ?? null,
        link: r.link ?? null,
        urgency: r.urgency ?? "medium",
        updatedAt: r.updated_at ?? r.updatedAt ?? null,
        _score: r.rank ?? r.score ?? 1,
        _source: "supabase_rpc",
      }));
    }

    // --- Attempt 2: ilike fallback ---
    const terms = queries
      .flatMap((q) => q.split(/\s+/))
      .filter((t) => t.length >= 2);

    if (!terms.length) return null;

    // Build an OR filter: title/summary/details ilike any term
    const ilikeFilters = terms.flatMap((t) => [
      `title.ilike.%${t}%`,
      `summary.ilike.%${t}%`,
      `details.ilike.%${t}%`,
    ]);

    let query = supabase
      .from("rights_knowledge")
      .select("id, category, title, summary, details, tip, link, urgency, updated_at")
      .or(ilikeFilters.join(","));

    if (categories?.length) {
      query = query.in("category", categories);
    }

    const { data, error } = await query.limit(5);

    if (error || !data?.length) return null;

    console.log(`[RAG] rights source: Supabase ilike (${data.length} results)`);
    return data.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      summary: r.summary,
      details: r.details,
      tip: r.tip ?? null,
      link: r.link ?? null,
      urgency: r.urgency ?? "medium",
      updatedAt: r.updated_at ?? null,
      _score: 1,
      _source: "supabase_ilike",
    }));
  } catch (err) {
    console.warn("[RAG] Supabase rights search failed, will use local JSON:", err?.message);
    return null;
  }
}

/**
 * Search rights by keyword matching (no embeddings needed)
 * Matches against title, summary, details, and category
 */
function searchRightsKeyword(queries, categories) {
  const rights = loadRights();
  const results = new Map(); // id → { right, score }

  for (const right of rights) {
    // Category filter
    if (categories?.length > 0 && !categories.includes(right.category)) {
      continue;
    }

    let score = 0;
    const searchText = `${right.title} ${right.summary} ${right.details} ${right.tip || ""}`.toLowerCase();

    for (const query of queries) {
      const terms = query.toLowerCase().split(/\s+/);
      for (const term of terms) {
        if (term.length < 2) continue;
        if (searchText.includes(term)) score += 1;
        if (right.title.toLowerCase().includes(term)) score += 2; // title boost
      }
    }

    if (score > 0) {
      results.set(right.id, { ...right, _score: score });
    }
  }

  return Array.from(results.values())
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

/**
 * Search events by date (future only) and optional city filter
 */
function searchEvents(city) {
  const events = loadEvents();
  const today = new Date().toISOString().split("T")[0];

  return events
    .filter(e => e.date >= today)
    .filter(e => !city || city === "כלל הארץ" || e.city === city || e.city === "כלל הארץ")
    .slice(0, 5);
}

/**
 * Search veteran knowledge from Supabase
 */
async function searchVeteranKnowledge(supabase, queries) {
  if (!supabase) return [];

  try {
    // Simple keyword search on approved veteran knowledge
    const { data, error } = await supabase
      .from("veteran_knowledge")
      .select("id, category, title, content, upvotes")
      .eq("approved", true)
      .order("upvotes", { ascending: false })
      .limit(5);

    if (error || !data) return [];

    // Score by keyword match
    const searchText = queries.join(" ").toLowerCase();
    return data
      .filter(v => {
        const vText = `${v.title} ${v.content} ${v.category}`.toLowerCase();
        return searchText.split(/\s+/).some(term => term.length >= 2 && vText.includes(term));
      })
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Search portal formulas from Supabase
 */
async function searchFormulas(supabase, categories) {
  if (!supabase || !categories?.length) return [];

  try {
    const { data, error } = await supabase
      .from("portal_formulas")
      .select("*")
      .in("category", categories)
      .limit(3);

    return error ? [] : (data || []);
  } catch {
    return [];
  }
}

/**
 * Search portal formulas from Supabase, filtered by category.
 * Separate from searchFormulas to allow independent use.
 */
async function searchPortalFormulas(supabase, categories) {
  if (!supabase || !categories?.length) return [];

  try {
    const { data, error } = await supabase
      .from("portal_formulas")
      .select("id, category, title, formula, description, variables, link")
      .in("category", categories)
      .limit(5);

    if (error) {
      console.warn("[RAG] portal_formulas query failed:", error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn("[RAG] searchPortalFormulas error:", err?.message);
    return [];
  }
}

/**
 * Main RAG function — fetches all relevant knowledge based on brief
 */
export async function fetchRAG(brief, supabase) {
  const queries = brief.rag_queries || [];
  const categories = brief.categories || [];

  // Run all searches in parallel
  const [semanticRights, supabaseRights, events, veteran, formulas, portalFormulas] = await Promise.all([
    // Try semantic search first (best quality, needs OPENAI_API_KEY)
    searchRightsSemantic(supabase, queries, categories),

    // Try Supabase keyword search as fallback
    searchRightsSupabase(supabase, queries, categories),

    // Events (if events hat or relevant)
    Promise.resolve(
      brief.hat === "events" || brief.intent === "events_query"
        ? searchEvents(brief._userCity)
        : []
    ),

    // Veteran knowledge from Supabase
    searchVeteranKnowledge(supabase, queries),

    // Portal formulas from Supabase (legacy)
    brief.include_formula ? searchFormulas(supabase, categories) : Promise.resolve([]),

    // Portal formulas (new dedicated function)
    brief.include_formula ? searchPortalFormulas(supabase, categories) : Promise.resolve([]),
  ]);

  // Cascade: semantic → Supabase keyword → local JSON
  let rights;
  if (semanticRights?.length) {
    rights = semanticRights;
  } else if (supabaseRights?.length) {
    rights = supabaseRights;
  } else {
    rights = searchRightsKeyword(queries, categories);
    if (rights.length) {
      console.log(`[RAG] rights source: local JSON (${rights.length} results)`);
    }
  }

  // Merge portal formulas from both sources, deduplicate by id
  const allFormulas = [...(formulas || [])];
  for (const pf of portalFormulas || []) {
    if (!allFormulas.some((f) => f.id === pf.id)) {
      allFormulas.push(pf);
    }
  }

  return { rights, events, veteran, formulas: allFormulas };
}

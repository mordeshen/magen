// =============================================================
// RAG Layer — Knowledge retrieval for the execution layer
// =============================================================

import { readFileSync } from "fs";
import { join } from "path";

// Cache loaded JSON data
let _rights = null;
let _events = null;

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
 * Main RAG function — fetches all relevant knowledge based on brief
 */
export async function fetchRAG(brief, supabase) {
  const queries = brief.rag_queries || [];
  const categories = brief.categories || [];

  // Run all searches in parallel
  const [rights, events, veteran, formulas] = await Promise.all([
    // Rights from local JSON (keyword search)
    Promise.resolve(searchRightsKeyword(queries, categories)),

    // Events (if events hat or relevant)
    Promise.resolve(
      brief.hat === "events" || brief.intent === "events_query"
        ? searchEvents(brief._userCity)
        : []
    ),

    // Veteran knowledge from Supabase
    searchVeteranKnowledge(supabase, queries),

    // Portal formulas from Supabase
    brief.include_formula ? searchFormulas(supabase, categories) : Promise.resolve([]),
  ]);

  return { rights, events, veteran, formulas };
}

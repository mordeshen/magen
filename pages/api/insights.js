import { getAdminSupabase } from "./lib/supabase-admin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check — skip if ADMIN_API_KEY not configured (dev mode)
  const requiredKey = process.env.ADMIN_API_KEY;
  if (requiredKey) {
    const provided = req.headers["x-admin-key"];
    if (provided !== requiredKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const supabase = getAdminSupabase();

    // Run all queries in parallel
    const [
      patternsRes,
      graphRes,
      insightsRes,
      briefsCountRes,
      layerDistRes,
      learnedRes,
    ] = await Promise.all([
      // Top conversation patterns by usage_count
      supabase
        .from("conversation_patterns")
        .select("id, trigger_pattern, detected_subtext, effective_response, confidence_score, usage_count, last_used")
        .order("usage_count", { ascending: false })
        .limit(20),

      // Rights graph connections by co_occurrence_count
      supabase
        .from("rights_graph")
        .select("id, right_a, right_b, co_occurrence_count, discovery_rate, typical_stage")
        .order("co_occurrence_count", { ascending: false })
        .limit(20),

      // System insights by frequency
      supabase
        .from("system_insights")
        .select("id, insight_type, pattern, frequency, trend, actionable, last_seen")
        .order("frequency", { ascending: false })
        .limit(20),

      // Total briefs count
      supabase
        .from("brief_log")
        .select("id", { count: "exact", head: true }),

      // All briefs for layer + hat distribution (select minimal fields)
      supabase
        .from("brief_log")
        .select("resolved_at_layer, brief"),

      // Recent learned responses
      supabase
        .from("learned_responses")
        .select("id, intent, trigger_keywords, brief_template, success_count, last_used")
        .order("last_used", { ascending: false })
        .limit(10),
    ]);

    // Compute stats from brief_log data
    const totalBriefs = briefsCountRes.count || 0;
    let layer1Count = 0;
    let layer2Count = 0;
    const hatCounts = {};
    let complexitySum = 0;
    let complexityN = 0;

    const briefs = layerDistRes.data || [];
    for (const row of briefs) {
      if (row.resolved_at_layer === 1) layer1Count++;
      else if (row.resolved_at_layer === 2) layer2Count++;

      // Extract hat from the brief JSONB
      if (row.brief && typeof row.brief === "object") {
        const hat = row.brief.hat || row.brief.recommended_hat;
        if (hat) {
          hatCounts[hat] = (hatCounts[hat] || 0) + 1;
        }
        // Extract complexity if present
        const c = row.brief.complexity;
        if (typeof c === "number") {
          complexitySum += c;
          complexityN++;
        }
      }
    }

    const avgComplexity = complexityN > 0
      ? (complexitySum / complexityN).toFixed(2)
      : "N/A";

    return res.status(200).json({
      patterns: patternsRes.data || [],
      rights_graph: graphRes.data || [],
      insights: insightsRes.data || [],
      stats: {
        total_briefs: totalBriefs,
        layer_1_count: layer1Count,
        layer_2_count: layer2Count,
        hat_distribution: hatCounts,
        avg_complexity: avgComplexity,
      },
      learned_responses: learnedRes.data || [],
    });
  } catch (err) {
    console.error("[insights] error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

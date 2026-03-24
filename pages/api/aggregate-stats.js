// pages/api/aggregate-stats.js
// Aggregates brief_log data into anonymous question_topic_stats
// Idempotent — safe to run multiple times for the same period

import { getAdminSupabase } from "./lib/supabase-admin";

const ADMIN_KEY = process.env.ADMIN_API_KEY || "";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth: x-admin-key header
  if (ADMIN_KEY) {
    const provided = req.headers["x-admin-key"];
    if (provided !== ADMIN_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const supabase = getAdminSupabase();

    // Determine date range — default: yesterday (full day guaranteed)
    const { date } = req.body || {};
    const targetDate = date || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    })();

    const periodStart = targetDate;
    const periodEnd = targetDate;

    // Fetch brief_log rows for the target date
    const { data: rows, error: fetchErr } = await supabase
      .from("brief_log")
      .select("brief, created_at")
      .gte("created_at", `${periodStart}T00:00:00Z`)
      .lt("created_at", `${periodStart}T23:59:59.999Z`);

    if (fetchErr) {
      console.error("[aggregate-stats] fetch error:", fetchErr.message);
      return res.status(500).json({ error: "Failed to fetch brief_log" });
    }

    if (!rows || rows.length === 0) {
      return res.status(200).json({ message: "No data for period", period: periodStart, aggregated: 0 });
    }

    // Aggregate by (intent, hat, category, complexity, emotional_state)
    const buckets = {};

    for (const row of rows) {
      const b = row.brief;
      if (!b || typeof b !== "object") continue;

      const intent = b.intent || "unknown";
      const hat = b.hat || b.recommended_hat || "unknown";
      const category = b.category || b.categories?.[0] || "unknown";
      const complexity = typeof b.complexity === "number"
        ? (b.complexity <= 3 ? "low" : b.complexity <= 6 ? "medium" : "high")
        : "unknown";
      const emotional = b.emotional_state || b.emotion || "unknown";

      const key = [intent, hat, category, complexity, emotional].join("|");
      buckets[key] = (buckets[key] || 0) + 1;
    }

    // Upsert into question_topic_stats
    let aggregated = 0;
    const errors = [];

    for (const [key, count] of Object.entries(buckets)) {
      const [intent, hat, category, complexity, emotional_state] = key.split("|");

      // Use upsert with the unique constraint columns
      const { error: upsertErr } = await supabase
        .from("question_topic_stats")
        .upsert(
          {
            period_start: periodStart,
            period_end: periodEnd,
            intent,
            hat,
            category,
            complexity,
            emotional_state,
            question_count: count,
          },
          {
            onConflict: "period_start,intent,hat,category,complexity,emotional_state",
          }
        );

      if (upsertErr) {
        errors.push({ key, error: upsertErr.message });
      } else {
        aggregated++;
      }
    }

    return res.status(200).json({
      message: "Aggregation complete",
      period: periodStart,
      rows_processed: rows.length,
      buckets_upserted: aggregated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[aggregate-stats] error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

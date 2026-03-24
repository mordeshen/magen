// =============================================================
// LAYER 3: Learning Layer — Async post-processing after each conversation
// =============================================================

import { MODEL_HAIKU } from "./models";
import crypto from "crypto";

const LEARNING_SYSTEM_PROMPT = `אתה מנתח שיחות של מגן — פורטל AI לפצועי צה"ל.
אחרי כל שיחה, תבדוק:

1. דפוסים: האם יש trigger pattern חדש? (מה המשתמש אמר → מה הוא באמת היה צריך)
2. קשרי זכויות: האם עלו שתי זכויות ביחד? האם המשתמש לא ידע על אחת מהן?
3. תובנות: האם יש משהו חריג? מגמה? פער?
4. איכות: האם ה-brief היה מדויק? האם התשובה ענתה על הצורך?

החזר JSON בלבד:
{
  "new_pattern": {"trigger": "...", "subtext": "...", "effective_response": "..."} | null,
  "rights_connection": {"right_a": "...", "right_b": "...", "user_knew_b": true/false} | null,
  "insight": {"type": "trend|gap|pattern|anomaly", "pattern": "...", "actionable": "..."} | null,
  "brief_quality": "accurate|partial|missed_subtext|wrong_hat",
  "suggested_improvement": "..." | null
}`;

/**
 * Log brief + response for analysis
 */
export async function logBrief(supabase, { conversationId, brief, responseText, resolvedAtLayer }) {
  if (!supabase) return;

  try {
    // Privacy: hash phone-based conversation IDs (WhatsApp, etc.)
    let safeId = conversationId;
    if (safeId && /whatsapp:\+|^\+\d/.test(safeId)) {
      safeId = crypto.createHash("sha256").update(safeId).digest("hex").slice(0, 16);
    }

    await supabase.from("brief_log").insert({
      conversation_id: safeId,
      brief,
      response_text: null, // stripped — may contain echoed PII
      resolved_at_layer: resolvedAtLayer,
    });
  } catch (e) {
    console.error("[learning] log error:", e.message);
  }
}

/**
 * Run the learning post-processor (async, non-blocking)
 */
export async function processLearning(supabase, { brief, responseText, userMessage }) {
  if (!supabase) return;

  try {
    const input = [
      "[brief]",
      JSON.stringify(brief),
      "",
      "[תשובה שנוצרה]",
      responseText,
      "",
      "[הודעת המשתמש]",
      userMessage,
    ].join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 300,
        system: [{ type: "text", text: LEARNING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: input }],
      }),
    });

    if (!res.ok) return;

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const learning = JSON.parse(jsonMatch[0]);

    // Save new pattern
    if (learning.new_pattern) {
      await supabase.from("conversation_patterns").insert({
        trigger_pattern: learning.new_pattern.trigger,
        detected_subtext: learning.new_pattern.subtext,
        effective_response: learning.new_pattern.effective_response,
      });
    }

    // Save rights connection
    if (learning.rights_connection) {
      const { right_a, right_b, user_knew_b } = learning.rights_connection;
      const { data: existing } = await supabase
        .from("rights_graph")
        .select("id, co_occurrence_count, discovery_rate")
        .eq("right_a", right_a)
        .eq("right_b", right_b)
        .maybeSingle();

      if (existing) {
        const newCount = existing.co_occurrence_count + 1;
        const newRate = user_knew_b
          ? existing.discovery_rate
          : (existing.discovery_rate * existing.co_occurrence_count + 1) / newCount;

        await supabase.from("rights_graph").update({
          co_occurrence_count: newCount,
          discovery_rate: newRate,
          last_seen: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("rights_graph").insert({
          right_a,
          right_b,
          discovery_rate: user_knew_b ? 0 : 1,
        });
      }
    }

    // Save insight
    if (learning.insight) {
      const { data: existingInsight } = await supabase
        .from("system_insights")
        .select("id, frequency")
        .eq("pattern", learning.insight.pattern)
        .maybeSingle();

      if (existingInsight) {
        await supabase.from("system_insights").update({
          frequency: existingInsight.frequency + 1,
          last_seen: new Date().toISOString(),
          actionable: learning.insight.actionable,
        }).eq("id", existingInsight.id);
      } else {
        await supabase.from("system_insights").insert({
          insight_type: learning.insight.type,
          pattern: learning.insight.pattern,
          actionable: learning.insight.actionable,
        });
      }
    }
  } catch (e) {
    console.error("[learning] process error:", e.message);
  }
}

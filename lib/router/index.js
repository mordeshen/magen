import { MODEL_OPUS, MODEL_SONNET } from "../../pages/api/lib/models.js";
import { applyHardRules } from "./hard-rules.js";
import { classify } from "./classifier.js";

/**
 * Smart Router — picks Opus or Sonnet in a single pass, no fallback.
 *
 * @param {{
 *   message: string,
 *   userMetadata: { isNewUser: boolean, daysSinceLastActive: number|null },
 *   conversationHistory: Array<{role: string, content: string}>,
 *   recentMessages: Array<{role: string, content: string}>,
 * }} input
 * @param {{ supabase?: object, userId?: string }} options — for async logging
 * @returns {Promise<{
 *   model: string,
 *   route: "OPUS"|"SONNET",
 *   reason: string,
 *   hardRuleMatched: string|null,
 *   classifierRoute: string|null,
 *   classifierReason: string|null,
 *   durationMs: number,
 * }>}
 */
export async function routeMessage(input, options = {}) {
  const start = Date.now();

  const hardResult = applyHardRules({
    message: input.message,
    userMetadata: input.userMetadata,
    conversationHistory: input.conversationHistory,
  });

  if (hardResult) {
    const decision = {
      model: MODEL_OPUS,
      route: "OPUS",
      reason: `hard_rule:${hardResult.rule}`,
      hardRuleMatched: hardResult.rule,
      classifierRoute: null,
      classifierReason: null,
      durationMs: Date.now() - start,
    };

    logDecision(decision, input, options).catch(() => {});
    return decision;
  }

  const classifierResult = await classify({
    message: input.message,
    recentMessages: input.recentMessages || [],
  });

  const model = classifierResult.route === "SONNET" ? MODEL_SONNET : MODEL_OPUS;

  const decision = {
    model,
    route: classifierResult.route,
    reason: classifierResult.reason,
    hardRuleMatched: null,
    classifierRoute: classifierResult.route,
    classifierReason: classifierResult.reason,
    durationMs: Date.now() - start,
  };

  logDecision(decision, input, options).catch(() => {});
  return decision;
}

async function logDecision(decision, input, options) {
  const { supabase, userId } = options;
  if (!supabase) return;

  try {
    await supabase.from("router_decisions").insert({
      user_id: userId || null,
      message_preview: (input.message || "").slice(0, 60),
      hard_rule_matched: decision.hardRuleMatched,
      classifier_route: decision.classifierRoute,
      classifier_reason: decision.classifierReason,
      final_model: decision.route,
      response_time_ms: decision.durationMs,
    });
  } catch (err) {
    console.error("[router] Failed to log decision:", err.message);
  }
}

export { applyHardRules } from "./hard-rules.js";
export { classify } from "./classifier.js";
export { EMOTIONAL_MARKERS } from "./emotional-markers.js";

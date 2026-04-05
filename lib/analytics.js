/**
 * מגן Analytics — anonymous chat metrics logging
 *
 * Fire-and-forget: never blocks the chat response.
 * No PII: no message content, no phone numbers, no names.
 */

import { getAdminSupabase } from "../pages/api/lib/supabase-admin";

/**
 * Log anonymous chat metrics to Supabase
 * @param {Object} metrics
 * @param {string} metrics.sessionId - anonymous UUID (no mapping to user)
 * @param {number} metrics.inputTokens
 * @param {number} metrics.outputTokens
 * @param {string} metrics.model - 'sonnet' | 'haiku' | 'opus'
 * @param {string} [metrics.category] - 'rights' | 'forms' | 'emotional' | 'general'
 * @param {boolean} metrics.usedRag
 * @param {boolean} metrics.usedWebSearch
 * @param {string} [metrics.persona] - 'lawyer' | 'social_worker' | 'psychologist' | 'veteran'
 * @param {number} metrics.responseTimeMs
 * @param {string} metrics.channel - 'whatsapp' | 'web'
 */
export async function logChatMetrics(metrics) {
  try {
    const admin = getAdminSupabase();
    await admin.from("chat_analytics").insert({
      session_id: metrics.sessionId,
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      model: metrics.model,
      category: metrics.category || null,
      used_rag: metrics.usedRag || false,
      used_web_search: metrics.usedWebSearch || false,
      persona: metrics.persona || null,
      response_time_ms: metrics.responseTimeMs,
      channel: metrics.channel || "web",
    });
  } catch (err) {
    // Never crash the chat because of analytics
    console.error("Analytics log failed:", err.message);
  }
}

/**
 * Detect category from message content (lightweight, no API call)
 */
export function detectCategory(message) {
  const m = (message || "").toLowerCase();
  if (/ועדה|אחוזים|ערעור|ערר|נכות|תביעה|סעיף|דחייה/.test(m)) return "rights";
  if (/טופס|מסמך|פורטל|הגשה|אישור/.test(m)) return "forms";
  if (/מרגיש|לא ישן|פחד|חרדה|דיכאון|אשמה|נטל|לבד|סיוט|שותה|התאבד/.test(m)) return "emotional";
  return "general";
}

/**
 * Map model ID to short name for analytics
 */
export function modelShortName(modelId) {
  if (!modelId) return "sonnet";
  if (modelId.includes("haiku")) return "haiku";
  if (modelId.includes("opus")) return "opus";
  return "sonnet";
}

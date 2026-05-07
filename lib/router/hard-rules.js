import { EMOTIONAL_MARKERS } from "./emotional-markers.js";

const QUESTION_WORDS = ["איפה", "מתי", "כמה", "מה המספר", "מה הטלפון", "מה הכתובת", "באיזה", "מה ה"];

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasQuestionWord(text) {
  const lower = text.trim();
  return QUESTION_WORDS.some(w => lower.startsWith(w) || lower.includes(w));
}

function hasEmotionalMarker(text) {
  const lower = text.trim();
  return EMOTIONAL_MARKERS.some(marker => {
    if (marker.includes(" ")) {
      return lower.includes(marker);
    }
    const re = new RegExp(`(?:^|[\\s.,!?;:\\-])${marker}(?:$|[\\s.,!?;:\\-])`, "u");
    return re.test(lower);
  });
}

/**
 * Synchronous hard rules — no IO, no LLM, ~1ms.
 * @param {{ message: string, userMetadata: { isNewUser: boolean, daysSinceLastActive: number|null }, conversationHistory: Array<{role: string, content: string}> }} input
 * @returns {{ route: "OPUS", rule: string } | null} — OPUS or null (fall through to classifier)
 */
export function applyHardRules({ message, userMetadata, conversationHistory }) {
  if (userMetadata.isNewUser && (!conversationHistory || conversationHistory.length === 0)) {
    return { route: "OPUS", rule: "new_user" };
  }

  if (userMetadata.daysSinceLastActive != null && userMetadata.daysSinceLastActive > 7) {
    return { route: "OPUS", rule: "returning_after_inactivity" };
  }

  if (hasEmotionalMarker(message)) {
    return { route: "OPUS", rule: "emotional_marker" };
  }

  const wordCount = countWords(message);
  if (wordCount < 5 && !hasQuestionWord(message)) {
    return { route: "OPUS", rule: "short_ambiguous" };
  }

  return null;
}

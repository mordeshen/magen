// =============================================================
// DECISION GATE — Routes brief to correct execution layer
// =============================================================

/**
 * Decide whether Haiku can handle the response or Sonnet needs to answer directly
 * @param {object} brief - Understanding brief from Layer 1
 * @returns {"haiku" | "sonnet_direct"}
 */
export function decisionGate(brief) {
  // Crisis — always Sonnet
  if (brief.complexity === "crisis" || brief.self_answer) {
    return "sonnet_direct";
  }

  // Complex — Sonnet
  if (brief.complexity === "complex") {
    return "sonnet_direct";
  }

  // Emotional escalation with multiple risk indicators — Sonnet
  if (brief.emotional_state === "distressed" && brief.risk_indicators?.length >= 2) {
    return "sonnet_direct";
  }

  // Masking with hidden emotional need — Sonnet (needs nuance)
  if (brief.emotional_state === "masking" && brief.hidden_need) {
    return "sonnet_direct";
  }

  // Standard + Simple — Haiku
  return "haiku";
}

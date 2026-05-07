/**
 * Latency test — runs against real Anthropic API.
 * NOT included in CI. Run manually:
 *   ANTHROPIC_API_KEY=sk-... npx vitest run lib/router/__tests__/latency.integration.test.js
 */
import { describe, it, expect } from "vitest";
import { applyHardRules } from "../hard-rules.js";
import { classify } from "../classifier.js";

describe("Latency", () => {
  it("hard-rule path resolves in < 5ms", () => {
    const start = performance.now();

    applyHardRules({
      message: "נמאס לי מהכל",
      userMetadata: { isNewUser: false, daysSinceLastActive: 1 },
      conversationHistory: [{ role: "user", content: "hi" }],
    });

    const elapsed = performance.now() - start;
    console.log(`Hard-rule latency: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(5);
  });

  it("classifier path resolves in < 1500ms", async () => {
    const start = performance.now();

    await classify({
      message: "מה הטלפון של ועדה רפואית בצפון?",
      recentMessages: [
        { role: "user", content: "שלום" },
        { role: "assistant", content: "היי, איך אפשר לעזור?" },
      ],
    });

    const elapsed = performance.now() - start;
    console.log(`Classifier latency: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(1500);
  }, 5000);
});

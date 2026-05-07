/**
 * Cost regression test — runs against real Anthropic API.
 * NOT included in CI. Run manually:
 *   ANTHROPIC_API_KEY=sk-... npx vitest run lib/router/__tests__/cost-regression.integration.test.js
 */
import { describe, it, expect } from "vitest";
import { applyHardRules } from "../hard-rules.js";
import { classify } from "../classifier.js";
import { FACTUAL_QUERIES, COMPLEX_QUERIES, EMOTIONAL_QUERIES, ALL_QUERIES } from "./fixtures.js";

const OPUS_COST_PER_1K_INPUT = 0.015;
const OPUS_COST_PER_1K_OUTPUT = 0.075;
const SONNET_COST_PER_1K_INPUT = 0.003;
const SONNET_COST_PER_1K_OUTPUT = 0.015;
const AVG_INPUT_TOKENS = 2000;
const AVG_OUTPUT_TOKENS = 200;

function estimateCost(model) {
  if (model === "OPUS") {
    return (AVG_INPUT_TOKENS / 1000) * OPUS_COST_PER_1K_INPUT +
           (AVG_OUTPUT_TOKENS / 1000) * OPUS_COST_PER_1K_OUTPUT;
  }
  return (AVG_INPUT_TOKENS / 1000) * SONNET_COST_PER_1K_INPUT +
         (AVG_OUTPUT_TOKENS / 1000) * SONNET_COST_PER_1K_OUTPUT;
}

describe("Cost Regression", () => {
  const activeUser = { isNewUser: false, daysSinceLastActive: 1 };
  const someHistory = [{ role: "user", content: "שלום" }, { role: "assistant", content: "היי" }];

  it("total cost at least 30% lower than all-Opus baseline", async () => {
    const allOpusCost = ALL_QUERIES.length * estimateCost("OPUS");
    let routerCost = 0;

    for (const query of ALL_QUERIES) {
      const hardResult = applyHardRules({
        message: query.text,
        userMetadata: activeUser,
        conversationHistory: someHistory,
      });

      let route;
      if (hardResult) {
        route = hardResult.route;
      } else {
        const classifierResult = await classify({
          message: query.text,
          recentMessages: someHistory,
        });
        route = classifierResult.route;
      }

      routerCost += estimateCost(route);
    }

    const savings = 1 - (routerCost / allOpusCost);
    console.log(`Cost: all-Opus=$${allOpusCost.toFixed(2)}, routed=$${routerCost.toFixed(2)}, savings=${(savings * 100).toFixed(1)}%`);
    expect(savings).toBeGreaterThanOrEqual(0.30);
  }, 120000);

  it("at least 60% of factual queries routed to Sonnet", async () => {
    let sonnetCount = 0;

    for (const query of FACTUAL_QUERIES) {
      const hardResult = applyHardRules({
        message: query,
        userMetadata: activeUser,
        conversationHistory: someHistory,
      });

      if (hardResult) continue;

      const classifierResult = await classify({
        message: query,
        recentMessages: someHistory,
      });
      if (classifierResult.route === "SONNET") sonnetCount++;
    }

    const passedToClassifier = FACTUAL_QUERIES.filter(q => {
      const r = applyHardRules({ message: q, userMetadata: activeUser, conversationHistory: someHistory });
      return !r;
    }).length;

    const sonnetRate = sonnetCount / passedToClassifier;
    console.log(`Factual queries: ${passedToClassifier} reached classifier, ${sonnetCount} routed to Sonnet (${(sonnetRate * 100).toFixed(1)}%)`);
    expect(sonnetRate).toBeGreaterThanOrEqual(0.60);
  }, 120000);
});

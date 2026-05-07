import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyHardRules } from "../hard-rules.js";
import { EMOTIONAL_MARKERS } from "../emotional-markers.js";

// ============================================================
// Hard Rules — pure functions, no mocks needed
// ============================================================

describe("Hard Rules", () => {
  const activeUser = { isNewUser: false, daysSinceLastActive: 1 };
  const someHistory = [{ role: "user", content: "שלום" }, { role: "assistant", content: "היי" }];

  it("new user, any message → OPUS", () => {
    const result = applyHardRules({
      message: "מה מגיע לי?",
      userMetadata: { isNewUser: true, daysSinceLastActive: null },
      conversationHistory: [],
    });
    expect(result).toEqual({ route: "OPUS", rule: "new_user" });
  });

  it("returning user (>7 days inactive), simple question → OPUS", () => {
    const result = applyHardRules({
      message: "מה הטלפון של ועדה רפואית בצפון?",
      userMetadata: { isNewUser: false, daysSinceLastActive: 10 },
      conversationHistory: someHistory,
    });
    expect(result).toEqual({ route: "OPUS", rule: "returning_after_inactivity" });
  });

  it("'נמאס לי' → OPUS (emotional marker)", () => {
    const result = applyHardRules({
      message: "נמאס לי",
      userMetadata: activeUser,
      conversationHistory: someHistory,
    });
    expect(result).toEqual({ route: "OPUS", rule: "emotional_marker" });
  });

  it("'לא' (2 chars, no question word) → OPUS (short + ambiguous)", () => {
    const result = applyHardRules({
      message: "לא",
      userMetadata: activeUser,
      conversationHistory: someHistory,
    });
    expect(result).toEqual({ route: "OPUS", rule: "short_ambiguous" });
  });

  it("'איפה הסניף הקרוב' (short but has question word) → null (fall through)", () => {
    const result = applyHardRules({
      message: "איפה הסניף הקרוב",
      userMetadata: activeUser,
      conversationHistory: someHistory,
    });
    expect(result).toBeNull();
  });

  it("factual question, returning user, active session → null (fall through)", () => {
    const result = applyHardRules({
      message: "מה מספר הטלפון של ועדה רפואית בצפון",
      userMetadata: activeUser,
      conversationHistory: someHistory,
    });
    expect(result).toBeNull();
  });

  it("short greeting without question word → OPUS", () => {
    const result = applyHardRules({
      message: "היי",
      userMetadata: activeUser,
      conversationHistory: someHistory,
    });
    expect(result).toEqual({ route: "OPUS", rule: "short_ambiguous" });
  });

  it("emotional marker embedded in longer message → OPUS", () => {
    const result = applyHardRules({
      message: "אני פשוט מתייאש מכל הבירוקרטיה",
      userMetadata: activeUser,
      conversationHistory: someHistory,
    });
    expect(result).toEqual({ route: "OPUS", rule: "emotional_marker" });
  });

  it("5+ word non-emotional message with active user → null", () => {
    const result = applyHardRules({
      message: "אני רוצה לדעת על זכויות לימודים לנכי צהל",
      userMetadata: activeUser,
      conversationHistory: someHistory,
    });
    expect(result).toBeNull();
  });

  it("exactly 7 days inactive → null (not >7)", () => {
    const result = applyHardRules({
      message: "מה מגיע לי עם 40 אחוז?",
      userMetadata: { isNewUser: false, daysSinceLastActive: 7 },
      conversationHistory: someHistory,
    });
    expect(result).toBeNull();
  });

  it("all emotional markers are detected", () => {
    for (const marker of EMOTIONAL_MARKERS) {
      const result = applyHardRules({
        message: marker,
        userMetadata: activeUser,
        conversationHistory: someHistory,
      });
      expect(result?.rule).toBe("emotional_marker");
    }
  });
});

// ============================================================
// Classifier — mock fetch, verify prompt and fallbacks
// ============================================================

describe("Classifier", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("includes last 2 messages of context in the prompt", async () => {
    let capturedBody;
    globalThis.fetch = vi.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          content: [{ text: '{"route":"SONNET","reason":"שאלה עובדתית"}' }],
        }),
      };
    });

    const { classify } = await import("../classifier.js");
    await classify({
      message: "מה הטלפון?",
      recentMessages: [
        { role: "user", content: "הודעה 1" },
        { role: "assistant", content: "תשובה 1" },
        { role: "user", content: "הודעה 2" },
        { role: "assistant", content: "תשובה 2" },
      ],
    });

    const messages = capturedBody.messages;
    expect(messages.length).toBe(3);
    expect(messages[0].content).toBe("הודעה 2");
    expect(messages[1].content).toBe("תשובה 2");
    expect(messages[2].content).toBe("מה הטלפון?");
  });

  it("prompt asks about user state, not question complexity", async () => {
    let capturedBody;
    globalThis.fetch = vi.fn(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          content: [{ text: '{"route":"OPUS","reason":"test"}' }],
        }),
      };
    });

    const { classify, CLASSIFIER_SYSTEM } = await import("../classifier.js");
    await classify({ message: "test" });

    expect(CLASSIFIER_SYSTEM).toContain("מתוסכל");
    expect(CLASSIFIER_SYSTEM).toContain("רגשית");
    expect(CLASSIFIER_SYSTEM).toContain("בירוקרטי");
    expect(CLASSIFIER_SYSTEM).toContain("עובדתית");
  });

  it("timeout → fallback to OPUS", async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const { classify } = await import("../classifier.js");
    const result = await classify({ message: "מה הטלפון?" });

    expect(result.route).toBe("OPUS");
    expect(result.reason).toBe("classifier_timeout");
  }, 5000);

  it("invalid JSON response → fallback to OPUS", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: "I cannot classify this message properly" }],
      }),
    }));

    const { classify } = await import("../classifier.js");
    const result = await classify({ message: "מה מגיע לי?" });

    expect(result.route).toBe("OPUS");
    expect(result.reason).toBe("classifier_invalid_json");
  });

  it("API error → fallback to OPUS", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
    }));

    const { classify } = await import("../classifier.js");
    const result = await classify({ message: "test" });

    expect(result.route).toBe("OPUS");
    expect(result.reason).toBe("classifier_api_error");
  });
});

// ============================================================
// Integration — mock Anthropic API, verify orchestration
// ============================================================

describe("Router Orchestration", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("hard rule matches → classifier never called", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const { routeMessage } = await import("../index.js");
    const result = await routeMessage({
      message: "נמאס לי",
      userMetadata: { isNewUser: false, daysSinceLastActive: 1 },
      conversationHistory: [{ role: "user", content: "hi" }],
      recentMessages: [],
    });

    expect(result.route).toBe("OPUS");
    expect(result.hardRuleMatched).toBe("emotional_marker");
    expect(result.classifierRoute).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hard rule misses, classifier returns SONNET → Sonnet model", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: '{"route":"SONNET","reason":"שאלה עובדתית פשוטה"}' }],
      }),
    }));

    const { routeMessage } = await import("../index.js");
    const result = await routeMessage({
      message: "מה הטלפון של ועדה רפואית בצפון?",
      userMetadata: { isNewUser: false, daysSinceLastActive: 1 },
      conversationHistory: [{ role: "user", content: "hi" }],
      recentMessages: [],
    });

    expect(result.route).toBe("SONNET");
    expect(result.hardRuleMatched).toBeNull();
    expect(result.classifierRoute).toBe("SONNET");
  });

  it("hard rule misses, classifier returns OPUS → Opus model", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: '{"route":"OPUS","reason":"שאלה מורכבת"}' }],
      }),
    }));

    const { routeMessage } = await import("../index.js");
    const result = await routeMessage({
      message: "הוועדה נתנה לי 10 אחוז על הגב אבל אני בקושי מסתדר",
      userMetadata: { isNewUser: false, daysSinceLastActive: 1 },
      conversationHistory: [{ role: "user", content: "hi" }],
      recentMessages: [],
    });

    expect(result.route).toBe("OPUS");
    expect(result.hardRuleMatched).toBeNull();
    expect(result.classifierRoute).toBe("OPUS");
  });

  it("exactly one decision per request (hard rule path)", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const { routeMessage } = await import("../index.js");
    await routeMessage({
      message: "לא",
      userMetadata: { isNewUser: false, daysSinceLastActive: 1 },
      conversationHistory: [{ role: "user", content: "hi" }],
      recentMessages: [],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("exactly one classifier call per request (classifier path)", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: '{"route":"SONNET","reason":"factual"}' }],
      }),
    }));
    globalThis.fetch = fetchSpy;

    const { routeMessage } = await import("../index.js");
    await routeMessage({
      message: "מה הטלפון של ועדה רפואית בצפון?",
      userMetadata: { isNewUser: false, daysSinceLastActive: 1 },
      conversationHistory: [{ role: "user", content: "hi" }],
      recentMessages: [],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("logs router decision async when supabase is provided", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: '{"route":"SONNET","reason":"factual"}' }],
      }),
    }));

    const insertSpy = vi.fn(async () => ({ error: null }));
    const mockSupabase = {
      from: vi.fn(() => ({ insert: insertSpy })),
    };

    const { routeMessage } = await import("../index.js");
    await routeMessage(
      {
        message: "מה הטלפון של ועדה רפואית?",
        userMetadata: { isNewUser: false, daysSinceLastActive: 1 },
        conversationHistory: [{ role: "user", content: "hi" }],
        recentMessages: [],
      },
      { supabase: mockSupabase, userId: "test-user" },
    );

    await new Promise(r => setTimeout(r, 50));

    expect(mockSupabase.from).toHaveBeenCalledWith("router_decisions");
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "test-user",
        final_model: "SONNET",
      }),
    );
  });

  it("durationMs is populated", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: '{"route":"SONNET","reason":"test"}' }],
      }),
    }));

    const { routeMessage } = await import("../index.js");
    const result = await routeMessage({
      message: "מה הטלפון?",
      userMetadata: { isNewUser: false, daysSinceLastActive: 1 },
      conversationHistory: [{ role: "user", content: "hi" }],
      recentMessages: [],
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

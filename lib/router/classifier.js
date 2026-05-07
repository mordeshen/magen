import { MODEL_HAIKU } from "../../pages/api/lib/models.js";

const CLASSIFIER_TIMEOUT_MS = 1500;

const CLASSIFIER_SYSTEM = `אתה מסווג בקשות של פצועי צה"ל. החזר JSON בלבד.

המשימה: להחליט אם השאלה דורשת Opus (מורכב/רגשי/ניווט בירוקרטיה) או Sonnet (שאלה עובדתית ברורה עם תשובה ידועה).

שאל את עצמך:
1. האם המשתמש מתוסכל, מבולבל, או רגשית עמוס?
2. האם זו שאלה עובדתית ברורה שסביר שיש עליה תשובה בבסיס הידע?
3. האם המשתמש באמצע תהליך בירוקרטי ודורש ניווט מדויק?

ברירת מחדל: כשלא בטוח → OPUS. Sonnet רק למקרים עובדתיים ברורים.

החזר JSON: {"route":"OPUS"|"SONNET","reason":"סיבה קצרה בעברית"}`;

/**
 * Lightweight Haiku classifier — decides OPUS vs SONNET.
 * Has a 1.5s timeout; defaults to OPUS on timeout or error.
 * @param {{ message: string, recentMessages: Array<{role: string, content: string}> }} input
 * @returns {Promise<{ route: "OPUS"|"SONNET", reason: string }>}
 */
export async function classify({ message, recentMessages = [] }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const contextMessages = recentMessages.slice(-2).map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : "[מורכב]",
    }));

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 100,
        system: CLASSIFIER_SYSTEM,
        messages: [
          ...contextMessages,
          { role: "user", content: message },
        ],
      }),
    });

    if (!r.ok) {
      console.error(`[router] Classifier API error ${r.status}`);
      return { route: "OPUS", reason: "classifier_api_error" };
    }

    const d = await r.json();
    const text = d.content?.[0]?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[router] Classifier returned non-JSON:", text.slice(0, 100));
      return { route: "OPUS", reason: "classifier_invalid_json" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.route !== "OPUS" && parsed.route !== "SONNET") {
      return { route: "OPUS", reason: "classifier_invalid_route" };
    }

    return { route: parsed.route, reason: parsed.reason || "classified" };
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("[router] Classifier timeout (1.5s) → defaulting to OPUS");
      return { route: "OPUS", reason: "classifier_timeout" };
    }
    console.error("[router] Classifier error:", err.message);
    return { route: "OPUS", reason: "classifier_error" };
  } finally {
    clearTimeout(timeout);
  }
}

export { CLASSIFIER_SYSTEM };

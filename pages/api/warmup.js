// Lightweight endpoint to wake up the V5 model container on Modal.
// Called from the client when the user opens the chat or starts typing,
// so the cold start happens in parallel with the user composing their message.
// Cost: $0 extra — same GPU seconds, just shifted earlier.

const FINETUNED_API_URL = process.env.FINETUNED_API_URL || "";
const FINETUNED_API_KEY = process.env.FINETUNED_API_KEY || "";

let lastWarmupAt = 0;
const THROTTLE_MS = 4 * 60 * 1000; // don't ping more than once per 4 min

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!FINETUNED_API_URL) return res.status(200).json({ status: "no_endpoint" });

  const now = Date.now();
  if (now - lastWarmupAt < THROTTLE_MS) {
    return res.status(200).json({ status: "throttled", warm: true });
  }
  lastWarmupAt = now;

  // Fire-and-forget: start the request but don't wait for full response.
  // The goal is just to trigger Modal's container boot, not to get an answer.
  const url = FINETUNED_API_URL.replace(/\/$/, "") + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (FINETUNED_API_KEY) headers.Authorization = `Bearer ${FINETUNED_API_KEY}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        max_tokens: 1,
        temperature: 0,
        messages: [{ role: "user", content: "ping" }],
      }),
    }).catch(() => {});

    clearTimeout(timeout);
  } catch {
    // Expected — we abort after 5s anyway. The container boot continues.
  }

  return res.status(200).json({ status: "warming" });
}

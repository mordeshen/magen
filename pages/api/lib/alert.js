// Unified alerting — sends Telegram message on critical failures
// Used by: whatsapp.js, chat.js, webhook/greeninvoice.js, checkout.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send alert to developer via Telegram
 * @param {string} source - Where the error happened (e.g. "whatsapp", "chat", "checkout")
 * @param {string} message - What went wrong
 * @param {object} [details] - Optional extra info
 */
export async function alertDev(source, message, details = {}) {
  const text = [
    `🚨 *${source.toUpperCase()}*`,
    message,
    details.userId ? `👤 ${details.userId}` : null,
    details.error ? `❌ ${details.error}` : null,
    details.extra ? `📎 ${details.extra}` : null,
    `🕐 ${new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
  ].filter(Boolean).join("\n");

  console.error(`[ALERT:${source}] ${message}`, details);

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[alert] Telegram not configured — alert not sent");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (e) {
    console.error("[alert] Failed to send Telegram alert:", e.message);
  }
}

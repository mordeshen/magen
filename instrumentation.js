// Self-ping: keeps the Railway container alive by pinging /api/ping
// every 4 minutes. Runs only in production, server-side only.

export async function register() {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof window !== "undefined") return;

  const INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
  const SITE_URL = process.env.SITE_URL || process.env.RAILWAY_PUBLIC_DOMAIN;

  if (!SITE_URL) {
    console.log("[keep-alive] SITE_URL not set, skipping self-ping");
    return;
  }

  const baseUrl = SITE_URL.startsWith("http") ? SITE_URL : `https://${SITE_URL}`;

  console.log(`[keep-alive] self-ping every ${INTERVAL_MS / 1000}s → ${baseUrl}/api/ping`);

  setInterval(async () => {
    try {
      const r = await fetch(`${baseUrl}/api/ping`, {
        signal: AbortSignal.timeout(10000),
      });
      console.log(`[keep-alive] ping → ${r.status}`);
    } catch (e) {
      console.warn(`[keep-alive] ping failed: ${e.message}`);
    }
  }, INTERVAL_MS);
}

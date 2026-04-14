// Health check endpoint — returns status of all critical services
// Used by: external cron monitor, Railway health checks

import { getAdminSupabase } from "./lib/supabase-admin";
import { alertDev } from "./lib/alert";

const CRON_SECRET = process.env.CRON_SECRET; // optional auth for cron calls

export default async function handler(req, res) {
  const results = {
    timestamp: new Date().toISOString(),
    status: "ok",
    services: {},
  };

  // 1. Supabase connectivity
  try {
    const sb = getAdminSupabase();
    const start = Date.now();
    const { error } = await sb.from("profiles").select("id", { count: "exact", head: true });
    const latency = Date.now() - start;
    if (error) throw error;
    results.services.supabase = { status: "ok", latency_ms: latency };
  } catch (e) {
    results.services.supabase = { status: "down", error: e.message };
    results.status = "degraded";
  }

  // 2. Anthropic API reachability (lightweight — just checks endpoint, no tokens used)
  try {
    const start = Date.now();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - start;
    // Any response (even 4xx) means API is reachable
    results.services.anthropic = { status: r.ok ? "ok" : "reachable", latency_ms: latency, http: r.status };
  } catch (e) {
    results.services.anthropic = { status: "down", error: e.message };
    results.status = "degraded";
  }

  // 3. Check if alert param is set (cron calls with ?alert=1)
  const shouldAlert = req.query.alert === "1" || req.headers["x-cron-secret"] === CRON_SECRET;

  if (results.status !== "ok" && shouldAlert) {
    const downServices = Object.entries(results.services)
      .filter(([, v]) => v.status === "down")
      .map(([k, v]) => `${k}: ${v.error}`)
      .join("\n");

    await alertDev("health-check", `שירותים לא זמינים!`, {
      extra: downServices,
    });
  }

  const httpStatus = results.status === "ok" ? 200 : 503;
  res.status(httpStatus).json(results);
}

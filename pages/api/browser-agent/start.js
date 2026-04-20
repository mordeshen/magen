import { getAdminSupabase, getUserSupabase } from "../lib/supabase-admin";
import { alertDev } from "../lib/alert";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Auth required
  const userSb = getUserSupabase(req, res);
  if (!userSb) return res.status(401).json({ error: "unauthorized" });

  let user;
  try {
    const { data } = await userSb.auth.getUser();
    user = data?.user;
  } catch {}
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const { task } = req.body;
  if (!task || typeof task !== "string") {
    return res.status(400).json({ error: "missing task" });
  }

  try {
    const { createSession } = require("../../../lib/browser-agent/session");
    const { SHIKUM_URL } = require("../../../lib/browser-agent/orchestrator");

    const session = await createSession(user.id);

    // Navigate to rehabilitation portal
    const state = await session.navigateTo(SHIKUM_URL);
    session.status = "waiting_login";

    // Store task on session for later use
    session.task = task;
    session.history = [];

    return res.status(200).json({
      sessionId: session.id,
      screenshot: state.screenshot.toString("base64"),
      message: "פתחתי את אתר אגף השיקום. כדי להמשיך, צריך להתחבר עם תעודת זהות וסיסמה.",
      status: "waiting_login",
    });
  } catch (e) {
    console.error("[browser-agent] start error:", e);
    if (e.message === "too_many_sessions") {
      return res.status(429).json({ error: "יש יותר מדי סשנים פעילים. נסה שוב בעוד כמה דקות." });
    }
    alertDev("browser-agent", "שגיאה בהפעלת סשן", { error: e.message }).catch(() => {});
    return res.status(500).json({ error: "לא הצלחנו לפתוח את האתר. נסו שוב." });
  }
}

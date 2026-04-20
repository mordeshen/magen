import { getUserSupabase } from "../lib/supabase-admin";
import { alertDev } from "../lib/alert";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const userSb = getUserSupabase(req, res);
  if (!userSb) return res.status(401).json({ error: "unauthorized" });

  let user;
  try {
    const { data } = await userSb.auth.getUser();
    user = data?.user;
  } catch {}
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const { sessionId, confirmed, correction } = req.body;
  if (!sessionId) return res.status(400).json({ error: "missing sessionId" });

  try {
    const { getSession } = require("../../../lib/browser-agent/session");
    const { executeStep } = require("../../../lib/browser-agent/orchestrator");

    const session = getSession(sessionId);
    if (!session || session.userId !== user.id) {
      return res.status(404).json({ error: "session not found" });
    }

    if (session.status !== "active") {
      return res.status(400).json({ error: "session not active" });
    }

    // If user provided a correction, prepend it to the task
    const task = correction
      ? `${session.task}. תיקון מהמשתמש: ${correction}`
      : session.task;

    const result = await executeStep(
      session,
      task,
      user.id,
      session.history || []
    );

    // Save actions to history
    if (result.actions) {
      session.history = [...(session.history || []), ...result.actions];
    }

    if (result.done) {
      session.status = "done";
    }

    return res.status(200).json({
      screenshot: result.screenshot,
      message: result.message,
      awaitConfirmation: result.awaitConfirmation,
      done: result.done,
      error: result.error || null,
    });
  } catch (e) {
    console.error("[browser-agent] step error:", e);
    alertDev("browser-agent", "שגיאה בביצוע צעד", { error: e.message }).catch(() => {});
    return res.status(500).json({ error: "שגיאה בביצוע הפעולה. נסו שוב." });
  }
}

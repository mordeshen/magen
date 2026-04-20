import { getUserSupabase } from "../lib/supabase-admin";

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

  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "missing sessionId" });

  try {
    const { closeSession, getSession } = require("../../../lib/browser-agent/session");
    const session = getSession(sessionId);
    if (session && session.userId === user.id) {
      closeSession(sessionId);
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true });
  }
}

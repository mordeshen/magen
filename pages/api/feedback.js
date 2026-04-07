// POST /api/feedback — save user rating on a chat response
// Body: { chat_log_id, rating (1-5), comment? }

import { getAdminSupabase } from "./lib/supabase-admin";

export const config = {
  api: { bodyParser: { sizeLimit: "10kb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { chat_log_id, rating, comment } = req.body || {};

  if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be 1-5" });
  }
  if (comment && typeof comment === "string" && comment.length > 1000) {
    return res.status(400).json({ error: "comment too long" });
  }

  try {
    const admin = getAdminSupabase();
    const { error } = await admin.from("chat_feedback").insert({
      chat_log_id: chat_log_id || null,
      rating,
      comment: comment || null,
    });
    if (error) {
      console.error("[feedback] insert failed:", error.message);
      return res.status(500).json({ error: "internal" });
    }

    // Mirror the rating back into chat_logs.rating for easy filtering
    if (chat_log_id) {
      await admin.from("chat_logs").update({ rating }).eq("id", chat_log_id);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[feedback] error:", err.message);
    return res.status(500).json({ error: "internal" });
  }
}

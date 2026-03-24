// pages/api/admin/moderate-knowledge.js
// Admin moderation for veteran knowledge entries

import { getAdminSupabase } from "../lib/supabase-admin";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);
const ADMIN_KEY = process.env.ADMIN_API_KEY || "";

function isAdmin(req) {
  // Option 1: x-admin-key header
  const headerKey = req.headers["x-admin-key"];
  if (ADMIN_KEY && headerKey === ADMIN_KEY) return true;

  // Option 2: check against ADMIN_EMAILS (requires email in header for simple API usage)
  const email = req.headers["x-admin-email"];
  if (email && ADMIN_EMAILS.includes(email)) return true;

  return false;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const sb = getAdminSupabase();

  // GET — list pending (unapproved) knowledge entries
  if (req.method === "GET") {
    const { data, error } = await sb
      .from("veteran_knowledge")
      .select("id, user_id, category, title, content, approved, upvotes, created_at")
      .eq("approved", false)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data || []);
  }

  // POST — toggle approved status
  if (req.method === "POST") {
    const { id, approved } = req.body || {};

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Missing id" });
    }
    if (typeof approved !== "boolean") {
      return res.status(400).json({ error: "approved must be a boolean" });
    }
    // Validate UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "Invalid id format" });
    }

    const { data, error } = await sb
      .from("veteran_knowledge")
      .update({ approved })
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data);
  }

  return res.status(405).end();
}

// pages/api/sessions.js
// CRUD API for chat sessions — requires Supabase JWT auth

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};

const VALID_HATS = new Set(["lawyer", "social", "psycho", "events", "veteran"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSupabase(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export default async function handler(req, res) {
  const sb = getSupabase(req);
  if (!sb) return res.status(401).json({ error: "לא מאומת" });

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return res.status(401).json({ error: "לא מאומת" });

  // GET — list sessions (latest first) or single session
  if (req.method === "GET") {
    const { id } = req.query;
    if (id) {
      if (!UUID_REGEX.test(id)) return res.status(400).json({ error: "ID לא תקין" });
      const { data, error } = await sb
        .from("chat_sessions")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (error) return res.status(404).json({ error: "לא נמצא" });
      return res.json(data);
    }
    const { data, error } = await sb
      .from("chat_sessions")
      .select("id, hat, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data || []);
  }

  // POST — create session
  if (req.method === "POST") {
    const { hat, title, messages } = req.body || {};
    if (!hat || !VALID_HATS.has(hat)) return res.status(400).json({ error: "בחירה לא תקינה" });
    if (title && (typeof title !== "string" || title.length > 200)) return res.status(400).json({ error: "כותרת לא תקינה" });
    if (messages && (!Array.isArray(messages) || messages.length > 100)) return res.status(400).json({ error: "הודעות לא תקינות" });
    const { data, error } = await sb
      .from("chat_sessions")
      .insert({ user_id: user.id, hat, title: title || null, messages: messages || [] })
      .select()
      .single();
    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data);
  }

  // PUT — update session (messages, title)
  if (req.method === "PUT") {
    const { id, messages, title } = req.body || {};
    if (!id || !UUID_REGEX.test(id)) return res.status(400).json({ error: "ID לא תקין" });
    const updates = {};
    if (messages !== undefined) {
      if (!Array.isArray(messages) || messages.length > 100) return res.status(400).json({ error: "הודעות לא תקינות" });
      updates.messages = messages;
    }
    if (title !== undefined) {
      if (typeof title !== "string" || title.length > 200) return res.status(400).json({ error: "כותרת לא תקינה" });
      updates.title = title;
    }
    const { data, error } = await sb
      .from("chat_sessions")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data);
  }

  // DELETE — delete session
  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id || !UUID_REGEX.test(id)) return res.status(400).json({ error: "ID לא תקין" });
    const { error } = await sb
      .from("chat_sessions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}

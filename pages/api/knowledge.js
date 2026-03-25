// pages/api/knowledge.js
// API for veteran knowledge sharing — read (public), write+vote (auth required)

import { createClient } from "@supabase/supabase-js";
import { getUserSupabase } from "./lib/supabase-admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const config = {
  api: { bodyParser: { sizeLimit: "100kb" } },
};

function getAnonSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

const VALID_CATEGORIES = ["ועדות רפואיות", "בירוקרטיה", "טיפול נפשי", "תעסוקה", "דיור", "לימודים", "כללי"];

// Simple per-user rate limit for writes (5 submissions per hour)
const writeRateMap = new Map();
const WRITE_LIMIT = 5;
const WRITE_WINDOW = 60 * 60 * 1000;

function isWriteLimited(userId) {
  const now = Date.now();
  const cutoff = now - WRITE_WINDOW;
  const timestamps = (writeRateMap.get(userId) || []).filter(t => t > cutoff);
  if (timestamps.length >= WRITE_LIMIT) {
    writeRateMap.set(userId, timestamps);
    return true;
  }
  timestamps.push(now);
  writeRateMap.set(userId, timestamps);
  return false;
}

// Cleanup every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - WRITE_WINDOW;
  for (const [uid, ts] of writeRateMap) {
    const valid = ts.filter(t => t > cutoff);
    if (valid.length === 0) writeRateMap.delete(uid);
    else writeRateMap.set(uid, valid);
  }
}, 10 * 60_000);

// Strip HTML tags to prevent XSS
function sanitize(str) {
  return str.replace(/<[^>]*>/g, "").trim();
}

export default async function handler(req, res) {
  // GET — public (approved knowledge + featured articles)
  if (req.method === "GET") {
    const sb = getAnonSupabase();
    if (!sb) return res.status(500).json({ error: "לא מוגדר" });

    const { category, featured, mine } = req.query;

    // Return featured knowledge_articles summaries
    if (featured === "1") {
      const { data, error } = await sb
        .from("knowledge_articles")
        .select("id, slug, title_he, summary, category, keywords")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return res.json([]);
      return res.json(data || []);
    }

    // Return user's own submissions (all statuses) — requires auth cookie
    if (mine === "1") {
      const userSb = getUserSupabase(req, res);
      if (!userSb) return res.json([]);
      const { data: { user } } = await userSb.auth.getUser();
      if (!user) return res.json([]);
      const { data, error } = await userSb
        .from("veteran_knowledge")
        .select("id, category, title, content, upvotes, approved, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return res.json([]);
      return res.json(data || []);
    }

    let query = sb
      .from("veteran_knowledge")
      .select("id, category, title, content, upvotes, created_at")
      .eq("approved", true)
      .order("upvotes", { ascending: false })
      .limit(100);

    if (category && typeof category === "string" && category !== "הכל") {
      if (VALID_CATEGORIES.includes(category)) {
        query = query.eq("category", category);
      }
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data || []);
  }

  // POST — create knowledge (auth required)
  if (req.method === "POST") {
    const sb = getUserSupabase(req, res);
    if (!sb) return res.status(401).json({ error: "לא מאומת" });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return res.status(401).json({ error: "לא מאומת" });

    if (isWriteLimited(user.id)) {
      return res.status(429).json({ error: "יותר מדי בקשות. נסה שוב מאוחר יותר." });
    }

    const { category, title, content } = req.body || {};
    if (typeof category !== "string" || typeof title !== "string" || typeof content !== "string") {
      return res.status(400).json({ error: "קלט לא תקין" });
    }

    const cleanTitle = sanitize(title);
    const cleanContent = sanitize(content);

    if (!cleanTitle || !cleanContent) return res.status(400).json({ error: "חסרים שדות" });
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: "קטגוריה לא חוקית" });
    if (cleanTitle.length < 3 || cleanTitle.length > 100) return res.status(400).json({ error: "כותרת לא תקינה" });
    if (cleanContent.length < 10 || cleanContent.length > 2000) return res.status(400).json({ error: "תוכן לא תקין" });

    const { data, error } = await sb
      .from("veteran_knowledge")
      .insert({ user_id: user.id, category, title: cleanTitle, content: cleanContent, approved: true })
      .select()
      .single();
    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data);
  }

  // PATCH — vote (auth required)
  if (req.method === "PATCH") {
    const sb = getUserSupabase(req, res);
    if (!sb) return res.status(401).json({ error: "לא מאומת" });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return res.status(401).json({ error: "לא מאומת" });

    const { knowledge_id } = req.body || {};
    if (!knowledge_id || typeof knowledge_id !== "string") return res.status(400).json({ error: "חסר ID" });
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(knowledge_id)) {
      return res.status(400).json({ error: "ID לא תקין" });
    }

    // Check if already voted
    const { data: existing } = await sb
      .from("knowledge_votes")
      .select("*")
      .eq("user_id", user.id)
      .eq("knowledge_id", knowledge_id)
      .maybeSingle();

    if (existing) {
      // Remove vote
      await sb.from("knowledge_votes").delete().eq("user_id", user.id).eq("knowledge_id", knowledge_id);
      await sb.rpc("decrement_upvotes", { kid: knowledge_id }).catch(() => {});
      return res.json({ voted: false });
    } else {
      // Add vote
      await sb.from("knowledge_votes").insert({ user_id: user.id, knowledge_id });
      await sb.rpc("increment_upvotes", { kid: knowledge_id }).catch(() => {});
      return res.json({ voted: true });
    }
  }

  return res.status(405).end();
}

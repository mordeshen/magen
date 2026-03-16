// GET /api/plans — מסלולים פעילים (public)
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: "not configured" });

  const sb = createClient(url, key);
  const { data } = await sb
    .from("subscription_plans")
    .select("id, name, price, token_limit, daily_token_limit, period_days, model, max_tokens, features")
    .eq("active", true)
    .order("price", { ascending: true });

  res.json(data || []);
}

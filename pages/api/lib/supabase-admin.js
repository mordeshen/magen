import { createClient } from "@supabase/supabase-js";

let adminClient = null;

export function getAdminSupabase() {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  adminClient = createClient(url, key);
  return adminClient;
}

export function getUserSupabase(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

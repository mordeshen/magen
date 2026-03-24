import crypto from "crypto";
import { getAdminSupabase, getUserSupabase } from "./lib/supabase-admin";

const SECRET = process.env.PAIR_TOKEN_SECRET || "magen-pair-secret-2026";

// --- Token helpers ---

export function generatePairToken(phone) {
  const payload = JSON.stringify({ phone, exp: Date.now() + 10 * 60 * 1000 });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(b64).digest("base64url");
  return b64 + "." + sig;
}

function verifyPairToken(raw) {
  const dotIdx = raw.indexOf(".");
  if (dotIdx < 0) return { error: "invalid token format" };

  const b64 = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);

  const expected = crypto.createHmac("sha256", SECRET).update(b64).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { error: "invalid signature" };
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return { error: "malformed payload" };
  }

  if (!data.phone || !data.exp) return { error: "missing fields" };
  if (Date.now() > data.exp) return { error: "token expired" };

  return { data };
}

function maskPhone(phone) {
  // "whatsapp:+972501234567" → "+972***4567"
  const num = phone.replace("whatsapp:", "");
  if (num.length < 7) return num;
  return num.slice(0, 4) + "***" + num.slice(-4);
}

// --- Handler ---

export default async function handler(req, res) {
  // GET /api/pair?token=XXX — validate token only
  if (req.method === "GET") {
    const { token } = req.query;
    if (!token) return res.status(400).json({ valid: false, reason: "missing token" });

    const result = verifyPairToken(token);
    if (result.error) return res.json({ valid: false, reason: result.error });

    return res.json({ valid: true, phone_masked: maskPhone(result.data.phone) });
  }

  // POST /api/pair — pair phone to authenticated user
  if (req.method === "POST") {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "missing token" });

    const result = verifyPairToken(token);
    if (result.error) return res.status(400).json({ error: result.error });

    const { phone } = result.data;

    // Authenticate user via cookie
    const userSupa = getUserSupabase(req, res);
    if (!userSupa) return res.status(500).json({ error: "auth not configured" });

    const { data: { user }, error: authErr } = await userSupa.auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: "not authenticated" });

    const admin = getAdminSupabase();

    // Check if phone already paired
    const { data: existing, error: lookupErr } = await admin
      .from("whatsapp_pairings")
      .select("user_id, email")
      .eq("phone", phone)
      .maybeSingle();

    if (lookupErr) {
      console.error("pair lookup error:", lookupErr);
      return res.status(500).json({ error: "database error" });
    }

    // Already paired to same user — idempotent success
    if (existing && existing.user_id === user.id) {
      const profile = user.user_metadata || {};
      return res.json({ ok: true, name: profile.name || profile.full_name || null });
    }

    // Already paired to different user — reject
    if (existing) {
      return res.status(409).json({ error: "phone already paired to another account" });
    }

    // Insert new pairing
    const { error: insertErr } = await admin
      .from("whatsapp_pairings")
      .insert({
        phone,
        user_id: user.id,
        email: user.email,
      });

    if (insertErr) {
      console.error("pair insert error:", insertErr);
      return res.status(500).json({ error: "failed to save pairing" });
    }

    const profile = user.user_metadata || {};
    return res.json({ ok: true, name: profile.name || profile.full_name || null });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}

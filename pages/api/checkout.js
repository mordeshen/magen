// POST /api/checkout — יוצר pending_purchase, קורא ל-Make.com webhook שיוצר Grow payment link
import { getAdminSupabase, getUserSupabase } from "./lib/supabase-admin";

const PLAN_PRICES = { one_time: 500, monthly: 2900, premium: 5000 }; // אגורות
const PLAN_NAMES = { one_time: "חד-פעמי", monthly: "חודשי", premium: "פרימיום" };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  console.log("[checkout] start");

  let user;
  try {
    const userSb = getUserSupabase(req, res);
    if (!userSb) {
      console.log("[checkout] no user supabase client");
      return res.status(401).json({ error: "unauthorized" });
    }
    const { data: { user: u } } = await userSb.auth.getUser();
    if (!u) {
      console.log("[checkout] no user from JWT");
      return res.status(401).json({ error: "unauthorized" });
    }
    user = u;
  } catch (e) {
    console.error("[checkout] auth error:", e.message);
    return res.status(401).json({ error: "unauthorized" });
  }

  const { plan_id } = req.body || {};
  if (!plan_id || !PLAN_PRICES[plan_id]) {
    console.log("[checkout] invalid plan:", plan_id);
    return res.status(400).json({ error: "invalid plan" });
  }

  console.log("[checkout] user:", user.email, "plan:", plan_id);

  let admin;
  try {
    admin = getAdminSupabase();
  } catch (e) {
    console.error("[checkout] admin supabase error:", e.message);
    return res.status(500).json({ error: "server_config_error" });
  }

  const amount = PLAN_PRICES[plan_id]; // אגורות
  const amountNIS = amount / 100;      // שקלים — Grow מקבל בשקלים

  // Create pending purchase
  const { data: pending, error: pendingErr } = await admin
    .from("pending_purchases")
    .insert({
      user_id: user.id,
      email: user.email,
      plan_id,
      amount,
    })
    .select()
    .single();

  if (pendingErr) {
    console.error("[checkout] pending_purchases insert error:", pendingErr.message || pendingErr);
    return res.status(500).json({ error: "internal" });
  }

  console.log("[checkout] pending created:", pending.id);

  // Call Make.com webhook → Grow: Create Payment Link → returns URL
  const makeUrl = process.env.MAKE_WEBHOOK_URL;
  const makeKey = process.env.MAKE_WEBHOOK_API_KEY;
  if (!makeUrl || !makeKey) {
    console.error("[checkout] Make.com keys missing");
    return res.status(500).json({ error: "payment not configured" });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");

  try {
    const makeRes = await fetch(makeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-make-apikey": makeKey,
      },
      body: JSON.stringify({
        fullName: user.user_metadata?.full_name || user.email,
        phone: user.user_metadata?.phone || user.phone || "0500000000",
        email: user.email,
        amount: amountNIS,
        title: `מגן — מסלול ${PLAN_NAMES[plan_id]}`,
        paymentId: pending.id,
        successUrl: `${siteUrl}/?payment=success`,
        failureUrl: `${siteUrl}/?payment=failed`,
      }),
    });

    if (!makeRes.ok) {
      const errText = await makeRes.text();
      console.error("[checkout] Make.com error:", makeRes.status, errText);
      throw new Error(`Make.com failed: ${makeRes.status}`);
    }

    const makeData = await makeRes.json();
    console.log("[checkout] Make response:", JSON.stringify(makeData));

    const paymentUrl = makeData.url;
    if (!paymentUrl) {
      console.error("[checkout] No payment URL in Make response");
      throw new Error("No payment URL returned");
    }

    // Save Grow payment link ID if returned
    if (makeData.id) {
      await admin
        .from("pending_purchases")
        .update({ gi_doc_id: makeData.id })
        .eq("id", pending.id);
    }

    console.log("[checkout] payment URL created");
    res.json({ paymentUrl });
  } catch (err) {
    console.error("[checkout] error:", err.message || err);
    res.status(500).json({ error: "payment_error", message: "שגיאה ביצירת התשלום" });
  }
}

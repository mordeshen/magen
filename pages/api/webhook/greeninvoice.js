// POST /api/webhook/greeninvoice — Webhook from Make.com after Grow payment approved
// Flow: User pays on Grow → Grow notifies Make (Scenario 2) → Make approves → Make calls this endpoint
import { getAdminSupabase } from "../lib/supabase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = req.body;
  if (!payload) return res.status(400).end();

  // Verify Make.com webhook secret
  const webhookSecret = process.env.MAKE_WEBHOOK_SECRET;
  if (webhookSecret && req.headers["x-make-secret"] !== webhookSecret) {
    console.warn("[webhook] invalid secret");
    return res.status(401).json({ error: "unauthorized" });
  }

  console.log("[webhook] received:", JSON.stringify(payload).slice(0, 200));

  const admin = getAdminSupabase();

  // Extract paymentId — our pending_purchases.id passed through Make.com → Grow → back
  const paymentId = payload.paymentId || payload.pluginId || payload.custom?.paymentId;
  if (!paymentId) {
    console.warn("[webhook] no paymentId in payload");
    return res.status(200).json({ ok: true, skipped: true });
  }

  // Idempotency — check if already fulfilled
  const { data: pending } = await admin
    .from("pending_purchases")
    .select("*")
    .eq("id", paymentId)
    .eq("fulfilled", false)
    .maybeSingle();

  if (!pending) {
    console.warn("[webhook] no unfulfilled pending purchase for:", paymentId);
    return res.status(200).json({ ok: true, not_found: true });
  }

  // Extract Grow transaction details
  const transactionId = payload.transactionId || payload.asmachta || "";

  // Mark fulfilled
  await admin
    .from("pending_purchases")
    .update({
      fulfilled: true,
      gi_doc_id: transactionId || paymentId,
    })
    .eq("id", pending.id);

  console.log("[webhook] fulfilled:", pending.id, "plan:", pending.plan_id);

  // Credit user based on plan
  const { plan_id, user_id } = pending;

  if (plan_id === "one_time") {
    // Add 200K tokens to balance
    await admin
      .from("user_subscriptions")
      .update({
        plan_id: "one_time",
        token_balance: 200000,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    await admin.from("token_transactions").insert({
      user_id, amount: 200000, type: "purchase", description: "חד-פעמי — 200K טוקנים",
    });
  } else if (plan_id === "monthly" || plan_id === "premium") {
    const end = new Date();
    end.setDate(end.getDate() + 30);

    await admin
      .from("user_subscriptions")
      .update({
        plan_id,
        subscription_start: new Date().toISOString(),
        subscription_end: end.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    await admin.from("token_transactions").insert({
      user_id, amount: 0, type: "purchase",
      description: `מסלול ${plan_id} — 30 ימים`,
    });
  }

  console.log("[webhook] user credited:", user_id);
  res.status(200).json({ ok: true });
}

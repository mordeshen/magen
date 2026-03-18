// GET /api/subscription — מנוי + יתרה + features
import { getAdminSupabase, getUserSupabase } from "./lib/supabase-admin";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const userSb = getUserSupabase(req, res);
  if (!userSb) return res.status(401).json({ error: "unauthorized" });

  const { data: { user } } = await userSb.auth.getUser();
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const admin = getAdminSupabase();

  // Get or create subscription
  let { data: sub } = await admin
    .from("user_subscriptions")
    .select("*, subscription_plans(*)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) {
    // Auto-create free subscription
    await admin.from("user_subscriptions").insert({
      user_id: user.id, plan_id: "free", daily_tokens_used: 0, daily_reset_date: new Date().toISOString().split("T")[0],
    });
    const { data: newSub } = await admin
      .from("user_subscriptions")
      .select("*, subscription_plans(*)")
      .eq("user_id", user.id)
      .single();
    sub = newSub;
  }

  const plan = sub.subscription_plans;

  // Daily reset check
  const today = new Date().toISOString().split("T")[0];
  if (sub.daily_reset_date < today) {
    await admin.from("user_subscriptions")
      .update({ daily_tokens_used: 0, daily_reset_date: today, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    sub.daily_tokens_used = 0;
  }

  // Expiry check
  let expired = false;
  if (sub.subscription_end && new Date(sub.subscription_end) < new Date()) {
    expired = true;
    await admin.from("user_subscriptions")
      .update({ plan_id: "free", updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
  }

  // Compute features
  const unlimited = plan.id === "monthly" || plan.id === "premium";
  let remaining;
  if (unlimited && !expired) {
    remaining = -1; // unlimited
  } else if (plan.id === "one_time") {
    remaining = sub.token_balance;
  } else {
    remaining = Math.max(0, (plan.daily_token_limit || 50000) - sub.daily_tokens_used);
  }

  res.json({
    plan_id: expired ? "free" : plan.id,
    plan_name: expired ? "חינם" : plan.name,
    token_balance: sub.token_balance,
    daily_tokens_used: sub.daily_tokens_used,
    remaining,
    unlimited: unlimited && !expired,
    subscription_end: sub.subscription_end,
    expired,
    features: {
      model: expired ? "claude-sonnet-4-6" : plan.model,
      max_tokens: expired ? 1024 : plan.max_tokens,
      ...(plan.features || {}),
    },
  });
}

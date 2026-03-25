// POST /api/webhook/greeninvoice — Webhook from Make.com after Grow payment approved
// Flow: User pays on Grow → Grow notifies Make (Scenario 2) → Make approves → Make calls this endpoint
// After fulfillment, creates invoice via Morning (Green Invoice) API and sends to user's email
import { getAdminSupabase } from "../lib/supabase-admin";

const PLAN_NAMES = { one_time: "חד-פעמי", monthly: "חודשי", premium: "פרימיום" };

// Get Morning/Green Invoice JWT token
async function getMorningToken() {
  const keyId = process.env.GI_API_KEY_ID;
  const keySecret = process.env.GI_API_KEY_SECRET;
  if (!keyId || !keySecret) return null;

  const base = process.env.GI_SANDBOX === "true"
    ? "https://sandbox.d.greeninvoice.co.il"
    : "https://api.greeninvoice.co.il";

  const res = await fetch(`${base}/api/v1/account/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: keyId, secret: keySecret }),
  });

  if (!res.ok) {
    console.error("[invoice] token failed:", res.status, await res.text());
    return null;
  }

  const { token } = await res.json();
  return { token, base };
}

// Create invoice and send to email
async function createInvoice({ email, fullName, amount, planId, transactionId }) {
  const auth = await getMorningToken();
  if (!auth) {
    console.warn("[invoice] skipped — no Morning credentials");
    return null;
  }

  const { token, base } = auth;
  const amountNIS = amount / 100; // pending_purchases stores in agorot

  const body = {
    type: 305, // חשבונית מס קבלה
    lang: "he",
    currency: "ILS",
    client: {
      name: fullName || email,
      emails: email ? [email] : [],
    },
    income: [
      {
        catalogNum: `magen-${planId}`,
        description: `מגן — מסלול ${PLAN_NAMES[planId] || planId}`,
        quantity: 1,
        price: amountNIS,
        currency: "ILS",
        vatType: 0, // פטור ממע"מ
      },
    ],
    payment: [
      {
        type: 3, // כרטיס אשראי
        price: amountNIS,
        currency: "ILS",
      },
    ],
    remarks: `עסקה: ${transactionId || "N/A"}`,
  };

  const res = await fetch(`${base}/api/v1/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[invoice] create failed:", res.status, errText);
    return null;
  }

  const doc = await res.json();
  console.log("[invoice] created:", doc.id, "number:", doc.number);
  return doc;
}

// Send failure alert email via Morning API (uses document remarks hack) or fallback log
async function sendFailureAlert({ reason, paymentId, email, plan_id, amount, transactionId }) {
  console.error(`[ALERT] Invoice failed — reason: ${reason}, payment: ${paymentId}, user: ${email}, plan: ${plan_id}, amount: ${amount}, txn: ${transactionId}`);

  // Try sending via a simple fetch to a mailto-style webhook, or use Supabase edge function
  // For now: use the Supabase admin to insert an alert record, and send email via Morning
  const auth = await getMorningToken();
  if (!auth) return; // can't even send alert

  const { token, base } = auth;
  try {
    await fetch(`${base}/api/v1/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: 100, // הצעת מחיר — לא חשבונית אמיתית, רק כדי לשלוח מייל
        lang: "he",
        currency: "ILS",
        client: {
          name: "מרדכי — התראת מערכת",
          emails: [process.env.ADMIN_EMAIL || "mordechay.shenvald@gmail.com"],
        },
        income: [{
          description: `[נדרשת פעולה] חשבונית לא נוצרה — ${reason}`,
          quantity: 1,
          price: 0,
          currency: "ILS",
          vatType: 0,
        }],
        remarks: `paymentId: ${paymentId}\nemail: ${email}\nplan: ${plan_id}\namount: ${amount} אגורות\ntransactionId: ${transactionId}\nreason: ${reason}`,
      }),
    });
  } catch (e) {
    console.error("[alert] failed to send alert email:", e.message);
  }
}

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

  // Create invoice via Morning (Green Invoice) — non-blocking
  try {
    const invoice = await createInvoice({
      email: pending.email,
      fullName: payload.fullName || pending.email,
      amount: pending.amount,
      planId: plan_id,
      transactionId,
    });

    if (invoice) {
      await admin
        .from("pending_purchases")
        .update({ gi_doc_id: invoice.id || transactionId })
        .eq("id", pending.id);
    } else {
      // Invoice creation returned null — send alert
      await sendFailureAlert({
        reason: "Morning API returned null",
        paymentId, email: pending.email, plan_id, amount: pending.amount, transactionId,
      });
    }
  } catch (err) {
    console.error("[invoice] error:", err.message);
    await sendFailureAlert({
      reason: err.message,
      paymentId, email: pending.email, plan_id, amount: pending.amount, transactionId,
    }).catch(() => {});
  }

  res.status(200).json({ ok: true });
}

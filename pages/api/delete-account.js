import { getAdminSupabase } from "./lib/supabase-admin";
import { alertDev } from "./lib/alert";

export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const supabase = getAdminSupabase();
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return res.status(401).json({ error: "invalid token" });

  const userId = user.id;

  try {
    // Get WhatsApp phone numbers before deleting pairings
    const { data: pairings } = await supabase
      .from("whatsapp_pairings")
      .select("phone")
      .eq("user_id", userId);

    const phones = (pairings || []).map(p => p.phone);

    // Delete all user data from every table (order matters for FK constraints)
    const tables = [
      "case_reminders",
      "knowledge_votes",
      "token_transactions",
      "pending_purchases",
      "user_subscriptions",
      "chat_sessions",
      "user_memory",
      "medical_events",
      "injuries",
      "legal_cases",
      "user_rights",
      "whatsapp_pairings",
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId);
      if (error) console.warn(`[delete-account] ${table}: ${error.message}`);
    }

    // Delete WhatsApp conversations by phone number
    for (const phone of phones) {
      await supabase.from("whatsapp_conversations").delete().eq("phone", phone);
    }

    // Delete veteran_knowledge authored by this user
    await supabase.from("veteran_knowledge").delete().eq("user_id", userId);

    // Delete profile (might cascade some of the above, but we're explicit)
    await supabase.from("profiles").delete().eq("id", userId);

    // Delete the auth user itself
    const { error: deleteAuthErr } = await supabase.auth.admin.deleteUser(userId);
    if (deleteAuthErr) {
      console.error("[delete-account] auth delete failed:", deleteAuthErr.message);
      await alertDev("delete-account", "מחיקת auth נכשלה", { error: deleteAuthErr.message, userId });
      return res.status(500).json({ error: "partial deletion — contact support" });
    }

    console.log(`[delete-account] user ${userId} fully deleted`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[delete-account] error:", err);
    await alertDev("delete-account", "קריסה במחיקת חשבון", { error: err.message, userId });
    return res.status(500).json({ error: "deletion failed" });
  }
}

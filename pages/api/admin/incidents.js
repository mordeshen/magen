import { getAdminSupabase } from "../lib/supabase-admin";
import { authenticateDashboard } from "../lib/dashboard-auth";

export default async function handler(req, res) {
  const auth = await authenticateDashboard(req, res);
  if (auth.error) {
    const code = auth.error === "not_authenticated" ? 401 : 403;
    return res.status(code).json({ error: auth.error });
  }

  const admin = getAdminSupabase();

  if (req.method === "GET") {
    const { status, severity, limit = 50 } = req.query;
    let query = admin
      .from("analytics_critical_incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(parseInt(limit), 100));

    if (status) query = query.eq("status", status);
    if (severity) query = query.gte("severity", parseInt(severity));

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ incidents: data || [] });
  }

  if (req.method === "PATCH") {
    const { id, status, reviewed_by } = req.body;
    if (!id || !status) return res.status(400).json({ error: "id and status required" });

    const validStatuses = ["new", "reviewed", "escalated", "resolved"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const update = { status };
    if (status !== "new") {
      update.reviewed_at = new Date().toISOString();
      if (reviewed_by) update.reviewed_by = reviewed_by;
    }

    const { data, error } = await admin
      .from("analytics_critical_incidents")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ incident: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// pages/api/admin/analytics.js
// Admin analytics API — returns anonymous aggregate metrics only

import { getAdminSupabase } from "../lib/supabase-admin";

const ADMIN_KEY = process.env.ADMIN_API_KEY || "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);

function isAdmin(req) {
  const headerKey = req.headers["x-admin-key"];
  if (ADMIN_KEY && headerKey === ADMIN_KEY) return true;
  const email = req.headers["x-admin-email"];
  if (email && ADMIN_EMAILS.includes(email)) return true;
  return false;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ error: "Unauthorized" });

  const admin = getAdminSupabase();
  const view = req.query.view || "daily";

  try {
    switch (view) {
      case "daily": {
        const { data, error } = await admin
          .from("v_daily_summary")
          .select("*")
          .limit(30);
        if (error) throw error;
        return res.json({ data });
      }

      case "categories": {
        const { data, error } = await admin
          .from("v_category_breakdown")
          .select("*");
        if (error) throw error;
        return res.json({ data });
      }

      case "personas": {
        const { data, error } = await admin
          .from("v_persona_stats")
          .select("*");
        if (error) throw error;
        return res.json({ data });
      }

      case "hourly": {
        const { data, error } = await admin
          .from("v_hourly_distribution")
          .select("*");
        if (error) throw error;
        return res.json({ data });
      }

      case "summary": {
        // All views at once for the dashboard
        const [daily, categories, personas, hourly] = await Promise.all([
          admin.from("v_daily_summary").select("*").limit(30),
          admin.from("v_category_breakdown").select("*"),
          admin.from("v_persona_stats").select("*"),
          admin.from("v_hourly_distribution").select("*"),
        ]);
        return res.json({
          daily: daily.data || [],
          categories: categories.data || [],
          personas: personas.data || [],
          hourly: hourly.data || [],
        });
      }

      default:
        return res.status(400).json({ error: "Unknown view" });
    }
  } catch (err) {
    console.error("Analytics API error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

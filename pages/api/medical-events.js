// pages/api/medical-events.js
// POST — add medical event (surgery, diagnosis, committee, etc.)

import { getUserSupabase } from "./lib/supabase-admin";

export const config = {
  api: { bodyParser: { sizeLimit: "100kb" } },
};

const VALID_EVENT_TYPES = new Set([
  "injury", "surgery", "hospitalization", "diagnosis",
  "treatment", "committee", "milestone",
]);

export default async function handler(req, res) {
  const sb = getUserSupabase(req, res);
  if (!sb) return res.status(401).json({ error: "לא מאומת" });

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return res.status(401).json({ error: "לא מאומת" });

  if (req.method === "POST") {
    const { event_date, event_type, title, title_en, description,
            icon, related_injury_ids, severity } = req.body || {};

    if (!event_date) return res.status(400).json({ error: "חסר תאריך" });
    if (!event_type || !VALID_EVENT_TYPES.has(event_type)) {
      return res.status(400).json({ error: "סוג אירוע לא תקין" });
    }
    if (!title || typeof title !== "string" || title.length > 200) {
      return res.status(400).json({ error: "כותרת חסרה או ארוכה מדי" });
    }

    const { data, error } = await sb
      .from("medical_events")
      .insert({
        user_id: user.id,
        event_date,
        event_type,
        title: title.trim(),
        title_en: title_en ? title_en.trim().slice(0, 200) : null,
        description: description ? description.trim().slice(0, 2000) : null,
        icon: icon || "•",
        related_injury_ids: Array.isArray(related_injury_ids) ? related_injury_ids : [],
        severity: severity || "moderate",
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.status(201).json({ event: data });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "חסר ID" });

    const { error } = await sb
      .from("medical_events")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}

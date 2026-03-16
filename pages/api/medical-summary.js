// pages/api/medical-summary.js
// GET — injuries + medical events for current user
// POST — add new injury

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const config = {
  api: { bodyParser: { sizeLimit: "100kb" } },
};

const VALID_ZONES = new Set([
  "head", "chest-left", "chest-right", "abdomen", "pelvis",
  "shoulder-left", "shoulder-right", "arm-left", "arm-right",
  "knee-left", "knee-right", "ankle-left", "ankle-right", "back",
]);

const VALID_SEVERITIES = new Set(["severe", "moderate", "mild"]);
const VALID_STATUSES = new Set(["chronic", "active_treatment", "post_surgical", "healed", "monitoring"]);

function getSupabase(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export default async function handler(req, res) {
  const sb = getSupabase(req);
  if (!sb) return res.status(401).json({ error: "לא מאומת" });

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return res.status(401).json({ error: "לא מאומת" });

  // GET — return injuries + events
  if (req.method === "GET") {
    const [injResult, evtResult] = await Promise.all([
      sb.from("injuries").select("*").eq("user_id", user.id).order("injury_date", { ascending: true }),
      sb.from("medical_events").select("*").eq("user_id", user.id).order("event_date", { ascending: true }),
    ]);

    const injuries = (injResult.data || []).map(inj => ({
      id: inj.id,
      zone: inj.body_zone,
      label: inj.label,
      hebrewLabel: inj.hebrew_label,
      severity: inj.severity,
      status: inj.status,
      details: inj.details,
      date: inj.injury_date ? new Date(inj.injury_date).toLocaleDateString("he-IL") : "",
      disabilityPercent: inj.disability_percent || 0,
      pairedOrgan: inj.paired_organ || false,
    }));

    const events = (evtResult.data || []).map(evt => ({
      id: evt.id,
      date: evt.event_date,
      type: evt.event_type,
      title: evt.title,
      titleEn: evt.title_en,
      description: evt.description,
      icon: evt.icon || "•",
      injuries: evt.related_injury_ids || [],
    }));

    return res.json({ injuries, events });
  }

  // POST — add injury
  if (req.method === "POST") {
    const { body_zone, label, hebrew_label, details, severity, status,
            injury_date, disability_percent, paired_organ, case_id } = req.body || {};

    if (!body_zone || !VALID_ZONES.has(body_zone)) {
      return res.status(400).json({ error: "מיקום פגיעה לא תקין" });
    }
    if (!label || typeof label !== "string" || label.length > 100) {
      return res.status(400).json({ error: "שם פגיעה חסר או ארוך מדי" });
    }
    if (!hebrew_label || typeof hebrew_label !== "string" || hebrew_label.length > 200) {
      return res.status(400).json({ error: "שם פגיעה בעברית חסר" });
    }
    if (severity && !VALID_SEVERITIES.has(severity)) {
      return res.status(400).json({ error: "חומרה לא תקינה" });
    }
    if (status && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: "סטטוס לא תקין" });
    }
    if (disability_percent !== undefined && (disability_percent < 0 || disability_percent > 100)) {
      return res.status(400).json({ error: "אחוזי נכות לא תקינים" });
    }

    const { data, error } = await sb
      .from("injuries")
      .insert({
        user_id: user.id,
        case_id: case_id || null,
        body_zone,
        label: label.trim(),
        hebrew_label: hebrew_label.trim(),
        details: details ? details.trim().slice(0, 2000) : null,
        severity: severity || "moderate",
        status: status || "active_treatment",
        injury_date: injury_date || null,
        disability_percent: disability_percent || 0,
        paired_organ: !!paired_organ,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.status(201).json({ injury: data });
  }

  // DELETE — remove injury
  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "חסר ID" });

    const { error } = await sb
      .from("injuries")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}

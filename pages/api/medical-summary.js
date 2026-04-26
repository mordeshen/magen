// pages/api/medical-summary.js
// GET — injuries + medical events for current user
// POST — add new injury

import { getUserSupabase } from "./lib/supabase-admin";
import { matchRights } from "../../lib/rights-matcher";
import allRights from "../../data/rights.json";

export const config = {
  api: { bodyParser: { sizeLimit: "100kb" } },
};

function calcWeightedDisabilityServer(injuries) {
  const sorted = [...injuries].sort((a, b) => (b.disabilityPercent || 0) - (a.disabilityPercent || 0));
  const paired = sorted.filter(i => i.pairedOrgan);
  const regular = sorted.filter(i => !i.pairedOrgan);
  let remaining = 100, total = 0;
  for (const inj of regular) {
    const p = inj.disabilityPercent || 0;
    const contribution = (p / 100) * remaining;
    total += contribution;
    remaining -= contribution;
  }
  for (const inj of paired) total += inj.disabilityPercent || 0;
  return Math.round(total);
}

const VALID_ZONES = new Set([
  "head", "chest-left", "chest-right", "abdomen", "pelvis",
  "shoulder-left", "shoulder-right", "arm-left", "arm-right",
  "knee-left", "knee-right", "ankle-left", "ankle-right", "back",
]);

const VALID_SEVERITIES = new Set(["severe", "moderate", "mild"]);
const VALID_STATUSES = new Set(["chronic", "active_treatment", "post_surgical", "healed", "monitoring"]);

export default async function handler(req, res) {
  const sb = getUserSupabase(req, res);
  if (!sb) return res.status(401).json({ error: "לא מאומת" });

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return res.status(401).json({ error: "לא מאומת" });

  // GET — return injuries + events + legalCase + profile
  if (req.method === "GET") {
    const [injResult, evtResult, lcResult, profResult] = await Promise.all([
      sb.from("injuries").select("*").eq("user_id", user.id).order("injury_date", { ascending: true }),
      sb.from("medical_events").select("*").eq("user_id", user.id).order("event_date", { ascending: true }),
      sb.from("legal_cases").select("stage, injury_types, injury_type, disability_percent, representative_name, representative_org, committee_date, notes").eq("user_id", user.id).maybeSingle(),
      sb.from("profiles").select("first_name, disability_percent, city").eq("id", user.id).maybeSingle(),
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

    const lc = lcResult.data;
    const legalCase = lc ? {
      stage: lc.stage,
      injuryTypes: lc.injury_types || (lc.injury_type ? [lc.injury_type] : []),
      disabilityPercent: lc.disability_percent,
      representative: lc.representative_name ? `${lc.representative_name}${lc.representative_org ? ` (${lc.representative_org})` : ""}` : null,
      committeeDate: lc.committee_date,
      notes: lc.notes,
    } : null;

    const prof = profResult.data;
    const profile = prof ? {
      name: prof.first_name,
      disabilityPercent: prof.disability_percent,
      city: prof.city,
    } : null;

    const officialPercent = legalCase?.disabilityPercent ?? profile?.disabilityPercent;
    const disabilityPercent = officialPercent ?? calcWeightedDisabilityServer(injuries);
    const injuryTypes = legalCase?.injuryTypes || [];
    const rawInjuries = (injResult.data || []).map(i => ({ body_zone: i.body_zone, hebrew_label: i.hebrew_label }));
    const rightsMatch = matchRights(allRights, { injuries: rawInjuries, disabilityPercent, injuryTypes });

    return res.json({ injuries, events, legalCase, profile, eligibleRights: rightsMatch.matched, userInjuryTypes: rightsMatch.userTypes });
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

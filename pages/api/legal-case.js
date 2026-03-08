// pages/api/legal-case.js
// CRUD API for legal case management — requires Supabase JWT auth

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const config = {
  api: { bodyParser: { sizeLimit: "100kb" } },
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STAGES = new Set([
  "NOT_STARTED", "GATHERING_DOCUMENTS", "CLAIM_FILED",
  "COMMITTEE_SCHEDULED", "COMMITTEE_PREPARATION",
  "COMMITTEE_COMPLETED", "DECISION_RECEIVED",
  "APPEAL_CONSIDERATION", "APPEAL_FILED", "RIGHTS_FULFILLMENT",
]);

const VALID_INJURY_TYPES = new Set([
  "orthopedic", "neurological", "ptsd", "hearing", "internal", "other",
]);

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

  // GET — return case + active reminders
  if (req.method === "GET") {
    const { data: legalCase } = await sb
      .from("legal_cases")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    let reminders = [];
    if (legalCase) {
      const { data: rems } = await sb
        .from("case_reminders")
        .select("*")
        .eq("user_id", user.id)
        .eq("dismissed", false)
        .order("due_date", { ascending: true });
      reminders = rems || [];
    }

    return res.json({ legalCase: legalCase || null, reminders });
  }

  // POST — create new case
  if (req.method === "POST") {
    const { stage, injury_types, committee_date, representative_name, representative_phone, representative_org } = req.body || {};

    if (stage && !VALID_STAGES.has(stage)) {
      return res.status(400).json({ error: "שלב לא תקין" });
    }
    if (injury_types) {
      if (!Array.isArray(injury_types) || injury_types.some(t => !VALID_INJURY_TYPES.has(t))) {
        return res.status(400).json({ error: "סוג פגיעה לא תקין" });
      }
    }

    const insertData = { user_id: user.id };
    if (stage) insertData.stage = stage;
    if (injury_types) insertData.injury_types = injury_types;
    if (committee_date) insertData.committee_date = committee_date;
    if (representative_name) insertData.representative_name = representative_name;
    if (representative_phone) insertData.representative_phone = representative_phone;
    if (representative_org) insertData.representative_org = representative_org;

    const { data, error } = await sb
      .from("legal_cases")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "כבר קיים תיק — השתמש ב-PUT לעדכון" });
      }
      return res.status(500).json({ error: "שגיאת שרת" });
    }
    return res.json(data);
  }

  // PUT — update case
  if (req.method === "PUT") {
    const body = req.body || {};
    const updates = {};

    if (body.stage !== undefined) {
      if (!VALID_STAGES.has(body.stage)) return res.status(400).json({ error: "שלב לא תקין" });
      updates.stage = body.stage;
    }
    if (body.injury_types !== undefined) {
      if (body.injury_types && (!Array.isArray(body.injury_types) || body.injury_types.some(t => !VALID_INJURY_TYPES.has(t)))) {
        return res.status(400).json({ error: "סוג פגיעה לא תקין" });
      }
      updates.injury_types = body.injury_types;
    }
    if (body.committee_date !== undefined) updates.committee_date = body.committee_date;
    if (body.disability_percent !== undefined) {
      if (body.disability_percent !== null && (body.disability_percent < 0 || body.disability_percent > 100)) {
        return res.status(400).json({ error: "אחוזי נכות לא תקינים" });
      }
      updates.disability_percent = body.disability_percent;
    }
    if (body.representative_name !== undefined) updates.representative_name = body.representative_name;
    if (body.representative_phone !== undefined) updates.representative_phone = body.representative_phone;
    if (body.representative_org !== undefined) updates.representative_org = body.representative_org;
    if (body.documents !== undefined) updates.documents = body.documents;
    if (body.notes !== undefined) updates.notes = body.notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "אין שדות לעדכון" });
    }

    const { data, error } = await sb
      .from("legal_cases")
      .update(updates)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data);
  }

  // PATCH — update reminder (read/dismissed)
  if (req.method === "PATCH") {
    const { id, read, dismissed } = req.body || {};
    if (!id || !UUID_REGEX.test(id)) return res.status(400).json({ error: "ID לא תקין" });

    const updates = {};
    if (read !== undefined) updates.read = !!read;
    if (dismissed !== undefined) updates.dismissed = !!dismissed;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "אין שדות לעדכון" });
    }

    const { data, error } = await sb
      .from("case_reminders")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: "שגיאת שרת" });
    return res.json(data);
  }

  return res.status(405).end();
}

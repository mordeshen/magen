// =============================================================
// Magen Engine — v14b fine-tuned model + RAG + Opus escalation
// =============================================================
//
// Flow:
//   Step 1: v14b UNDERSTANDS — analyzes user message, outputs:
//           - rag_queries (what to search)
//           - emotional_state, complexity
//           - personal file updates
//   Step 2: RAG RETRIEVES — fetches factual data based on queries
//   Step 3: v14b RESPONDS — answers with RAG data + personal context
//   Step 4: If ESCALATE → Opus handles with full context
//   Step 5: Personal file updated (async)
// =============================================================

import { MODEL_MAGEN, MODEL_OPUS } from "./models";
import { fetchRAG } from "./rag";

// ---- Step 1: v14b analyzes the message ----
async function analyze(userMessage, context) {
  const personalContext = buildPersonalContext(context);

  const system = `אתה מגן — יועץ אישי לפצועי צה"ל.
נתח את ההודעה והחזר JSON בלבד.

${personalContext}
--- משימה ---
הבן מה המשתמש צריך. החזר JSON:
{
  "rag_queries": ["שאילתות חיפוש ממוקדות לבסיס הידע — מה צריך לחפש כדי לענות"],
  "categories": ["כספי","בריאות","משפטי","לימודים","תעסוקה","מיסים","פנאי"],
  "needs_events": false,
  "emotional_state": "neutral|masking|distressed|crisis",
  "complexity": "simple|standard|complex|crisis",
  "escalate": null,
  "memory_updates": [{"key":"מפתח","value":"ערך"}],
  "stage_update": null,
  "injury_detected": null
}

דוגמאות:
- "מה מגיע לי עם 40% נכות?" → rag_queries: ["זכויות נכה 40%", "תגמולים 40 אחוז", "הטבות מס נכות"], categories: ["כספי","מיסים"], memory_updates: [{"key":"אחוזי נכות","value":"40%"}]
- "הכל בסדר, סתם על הארנונה" → rag_queries: ["הנחת ארנונה נכי צהל"], categories: ["מיסים"], emotional_state: "masking"
- "אני לא רואה טעם בכלום" → rag_queries: [], emotional_state: "crisis", escalate: "סימני משבר נפשי, ייתכנו מחשבות אובדניות"
- "יש לי ועדה בעוד שבוע" → rag_queries: ["הכנה לוועדה רפואית", "ייצוג בוועדה"], categories: ["משפטי"], memory_updates: [{"key":"ועדה קרובה","value":"בעוד שבוע"}]

החזר רק JSON, בלי הסברים.`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_MAGEN,
      messages: [
        { role: "system", content: system },
        ...(context.recentMessages || []).slice(-4).map(m => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : "[תוכן מורכב]",
        })),
        { role: "user", content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0,
    }),
  });

  if (!r.ok) throw new Error(`Analyze error ${r.status}`);

  const d = await r.json();
  const text = d.choices?.[0]?.message?.content || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in analysis");

  return {
    brief: JSON.parse(jsonMatch[0]),
    tokens: (d.usage?.prompt_tokens || 0) + (d.usage?.completion_tokens || 0),
  };
}

// ---- Step 3: v14b responds with RAG data ----
async function respond(userMessage, context, ragResults, brief) {
  const parts = [
    `אתה מגן — יועץ אישי לפצועי צה"ל. ישיר, חם, מעשי.`,
  ];

  // Personal context
  const personalCtx = buildPersonalContext(context);
  if (personalCtx) parts.push(personalCtx);

  // RAG results — the factual backbone
  if (ragResults?.rights?.length) {
    parts.push("--- מידע מבסיס הידע (השתמש במידע הזה לתשובה מדויקת) ---");
    ragResults.rights.forEach(r => {
      let line = `• ${r.title}: ${r.details || r.summary}`;
      if (r.practical_tip || r.tip) line += ` | טיפ: ${r.practical_tip || r.tip}`;
      if (r.phone_number) line += ` | טלפון: ${r.phone_number}`;
      if (r.formula_template) line += ` | נוסחה: ${r.formula_template}`;
      parts.push(line);
    });
  }

  if (ragResults?.events?.length) {
    const today = new Date().toISOString().split("T")[0];
    const upcoming = ragResults.events.filter(e => e.date >= today).slice(0, 5);
    if (upcoming.length) {
      parts.push("--- אירועים קרובים ---");
      upcoming.forEach(e => {
        parts.push(`• ${e.title} — ${e.date}${e.time ? ` ${e.time}` : ""} | ${e.location} (${e.city})${e.free ? " | חינם" : ""}${e.registration ? ` | הרשמה: ${e.registration}` : ""}`);
      });
    }
  }

  if (ragResults?.veteran?.length) {
    parts.push("--- חכמת ותיקים ---");
    ragResults.veteran.forEach(v => parts.push(`• ${v.title}: ${v.content}`));
  }

  // Emotional state hint (from analysis)
  if (brief.emotional_state === "masking") {
    parts.push("--- הערה פנימית: המשתמש ככל הנראה ממזער. ענה על השאלה אבל בדוק בעדינות. ---");
  } else if (brief.emotional_state === "distressed") {
    parts.push("--- הערה פנימית: המשתמש במצוקה. הכר ברגש לפני מידע. ---");
  }

  parts.push("קו חם: *8944 (נפש אחת) | *6500 (מוקד פצועים)");

  const system = parts.join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_MAGEN,
      messages: [
        { role: "system", content: system },
        ...(context.recentMessages || []).slice(-6).map(m => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : "[תוכן מורכב]",
        })),
        { role: "user", content: userMessage },
      ],
      max_tokens: 800,
      temperature: 0.3,
    }),
  });

  if (!r.ok) throw new Error(`Respond error ${r.status}`);

  const d = await r.json();
  return {
    text: d.choices?.[0]?.message?.content || "",
    tokens: (d.usage?.prompt_tokens || 0) + (d.usage?.completion_tokens || 0),
  };
}

// ---- Build personal context string ----
function buildPersonalContext(context) {
  const parts = [];

  if (!context.profile && !context.legalCase && !context.injuries?.length && !context.memory?.length) {
    return "";
  }

  parts.push("--- מה ידוע על המשתמש ---");

  if (context.profile) {
    const p = context.profile;
    const bits = [];
    if (p.name) bits.push(`שם: ${p.name}`);
    if (p.city) bits.push(`עיר: ${p.city}`);
    if (p.disability_percent != null) bits.push(`אחוזי נכות: ${p.disability_percent}%`);
    if (p.claim_status === "before_recognition") bits.push(`מצב: לפני הכרה — ${p.claim_stage || "תחילת דרך"}`);
    else if (p.claim_status === "after_recognition") bits.push("מצב: מוכר");
    if (bits.length) parts.push(bits.join(" | "));
  }

  if (context.legalCase) {
    const lc = context.legalCase;
    const STAGES = {
      NOT_STARTED: "טרם התחיל", GATHERING_DOCUMENTS: "איסוף מסמכים",
      CLAIM_FILED: "תביעה הוגשה", COMMITTEE_SCHEDULED: "ועדה נקבעה",
      COMMITTEE_PREPARATION: "הכנה לוועדה", COMMITTEE_COMPLETED: "ועדה הסתיימה",
      DECISION_RECEIVED: "התקבלה החלטה", APPEAL_CONSIDERATION: "שקילת ערעור",
      APPEAL_FILED: "ערעור הוגש", RIGHTS_FULFILLMENT: "מימוש זכויות",
    };
    parts.push(`שלב בתהליך: ${STAGES[lc.stage] || lc.stage}`);
    if (lc.committee_date) {
      const days = Math.round((new Date(lc.committee_date) - new Date()) / 86400000);
      if (days >= 0) parts.push(`ועדה בעוד ${days} ימים (${lc.committee_date})`);
    }
    if (lc.representative_name) parts.push(`מייצג: ${lc.representative_name}`);
  }

  if (context.injuries?.length) {
    parts.push("פגיעות מוכרות: " + context.injuries.map(i =>
      `${i.hebrew_label} (${i.severity}${i.disability_percent ? `, ${i.disability_percent}%` : ""})`
    ).join(", "));
  }

  if (context.memory?.length) {
    parts.push("מידע משיחות קודמות: " + context.memory.map(m => `${m.key}: ${m.value}`).join(" | "));
  }

  parts.push("אל תשאל שוב דברים שכבר ידועים.");
  return parts.join("\n");
}

// ---- Opus escalation ----
async function callOpus(systemPrompt, recentMessages, userMessage, escalateReason) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_OPUS,
      max_tokens: 1500,
      system: systemPrompt + `\n\n--- הערה מהמערכת ---\nזוהה מצב שדורש טיפול מעמיק: ${escalateReason}.\nתן תשובה מלאה, רגישה ומקצועית.`,
      messages: [
        ...(recentMessages || []).slice(-6),
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!r.ok) throw new Error(`Opus error ${r.status}`);

  const d = await r.json();
  return {
    text: d.content?.[0]?.text || "",
    tokens: (d.usage?.input_tokens || 0) + (d.usage?.output_tokens || 0),
  };
}

// ---- Update personal file in Supabase ----
async function updatePersonalFile(supabase, userId, updates) {
  if (!supabase || !userId) return;

  try {
    if (updates.memory_updates?.length) {
      for (const mem of updates.memory_updates) {
        await supabase.from("user_memory").upsert({
          user_id: userId,
          key: mem.key,
          value: mem.value,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,key" });
      }
      console.log(`[magen] Memory: +${updates.memory_updates.length} items`);
    }

    if (updates.stage_update) {
      await supabase.from("legal_cases")
        .update({ stage: updates.stage_update, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      console.log(`[magen] Stage → ${updates.stage_update}`);
    }

    if (updates.injury_detected) {
      await supabase.from("injuries").insert({
        user_id: userId,
        ...updates.injury_detected,
        created_at: new Date().toISOString(),
      });
      console.log(`[magen] Injury added: ${updates.injury_detected.hebrew_label}`);
    }
  } catch (err) {
    console.error("[magen] Personal file error:", err?.message);
  }
}

// ---- Main entry point ----
export async function magenChat(userMessage, context, supabase) {
  // === Step 1: v14b ANALYZES ===
  let analysis;
  try {
    analysis = await analyze(userMessage, context);
  } catch (err) {
    console.error("[magen] Analysis failed:", err.message);
    return null; // Caller falls back to legacy
  }

  const brief = analysis.brief;
  console.log(`[magen] Analysis: state=${brief.emotional_state}, complexity=${brief.complexity}, queries=${brief.rag_queries?.length || 0}`);

  // === Escalate immediately if crisis ===
  if (brief.escalate || brief.complexity === "crisis") {
    console.log(`[magen] → Opus: ${brief.escalate || "crisis detected"}`);
    try {
      const personalCtx = buildPersonalContext(context);
      const opusResult = await callOpus(
        `אתה מגן — יועץ אישי לפצועי צה"ל. ישיר, חם, מעשי.\n${personalCtx}\nקו חם: *8944 (נפש אחת) | *6500 (מוקד פצועים)`,
        context.recentMessages, userMessage,
        brief.escalate || "המשתמש במשבר"
      );

      // Update personal file from analysis
      updatePersonalFile(supabase, context.userId, brief).catch(() => {});

      return {
        reply: opusResult.text,
        tokens: analysis.tokens + opusResult.tokens,
        layer: "opus",
      };
    } catch (err) {
      console.error("[magen] Opus failed:", err.message);
      // Don't return null — try v14b as fallback even for crisis
    }
  }

  // === Step 2: RAG RETRIEVES ===
  const ragQuery = {
    rag_queries: brief.rag_queries || [userMessage],
    categories: brief.categories || [],
    hat: "magen",
    intent: brief.needs_events ? "events_query" : "rights_query",
  };

  const ragResults = await fetchRAG(ragQuery, supabase);
  console.log(`[magen] RAG: ${ragResults.rights?.length || 0} rights, ${ragResults.events?.length || 0} events, ${ragResults.veteran?.length || 0} veteran`);

  // === Step 3: v14b RESPONDS with RAG data ===
  let response;
  try {
    response = await respond(userMessage, context, ragResults, brief);
  } catch (err) {
    console.error("[magen] Response failed:", err.message);
    return null;
  }

  // === Step 4: Update personal file (async) ===
  updatePersonalFile(supabase, context.userId, brief).catch(() => {});

  return {
    reply: response.text,
    tokens: analysis.tokens + response.tokens,
    layer: "magen",
  };
}

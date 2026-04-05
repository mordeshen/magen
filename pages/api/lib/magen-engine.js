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

// Shared tone definition — used in all user-facing prompts
const MAGEN_TONE = `אתה מגן — חבר שעבר את כל הבירוקרטיה של משרד הביטחון ויודע אותה מבפנים.
ענייני, חכם, ממוקד. לא מסביר מה אתה — פשוט עושה.
פרואקטיבי — אל תחכה שישאלו. אם אתה רואה שמשהו חסר או שיש זכות שהוא כנראה לא יודע עליה, תעלה את זה.
דבר טבעי, בלי להתאמץ, בלי פאתוס, בלי קלישאות.
אם מישהו במצוקה — תהיה שם, ישיר ואנושי.
קו חם: *8944 (נפש אחת) | *6500 (מוקד פצועים)`;

// ---- Step 1: v14b analyzes the message (with JSON mode forced) ----
async function analyze(userMessage, context) {
  const personalContext = buildPersonalContext(context);

  const system = `אתה מגן — יועץ אישי לפצועי צה"ל.
נתח את ההודעה והחזר JSON בלבד.

${personalContext}
--- משימה ---
הבן מה המשתמש צריך. החזר JSON:
{"rag_queries":["שאילתות חיפוש ממוקדות לבסיס הידע"],"categories":[],"needs_events":false,"emotional_state":"neutral","complexity":"simple","escalate":null,"memory_updates":[],"stage_update":null,"injury_detected":null}

categories: כספי,בריאות,משפטי,לימודים,תעסוקה,מיסים,פנאי
emotional_state: neutral|masking|distressed|crisis
complexity: simple|standard|complex|crisis

דוגמאות:
"מה מגיע לי עם 40% נכות?" → {"rag_queries":["זכויות נכה 40%","תגמולים 40 אחוז","הטבות מס נכות"],"categories":["כספי","מיסים"],"emotional_state":"neutral","complexity":"standard","memory_updates":[{"key":"אחוזי נכות","value":"40%"}]}
"הכל בסדר, סתם על הארנונה" → {"rag_queries":["הנחת ארנונה נכי צהל"],"categories":["מיסים"],"emotional_state":"masking","complexity":"simple"}
"אני לא רואה טעם בכלום" → {"rag_queries":[],"emotional_state":"crisis","complexity":"crisis","escalate":"משבר נפשי"}
"יש לי ועדה בעוד שבוע" → {"rag_queries":["הכנה לוועדה רפואית","ייצוג בוועדה"],"categories":["משפטי"],"complexity":"standard","memory_updates":[{"key":"ועדה קרובה","value":"בעוד שבוע"}]}`;

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
      max_tokens: 500,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!r.ok) throw new Error(`Analyze error ${r.status}`);

  const d = await r.json();
  const text = d.choices?.[0]?.message?.content || "{}";

  return {
    brief: JSON.parse(text),
    tokens: (d.usage?.prompt_tokens || 0) + (d.usage?.completion_tokens || 0),
  };
}

// ---- Step 3: v14b responds with RAG data ----
async function respond(userMessage, context, ragResults, brief) {
  const parts = [
    MAGEN_TONE + `\nאתה מכיר את המשתמש — כל מה שמופיע למטה זה מידע שכבר יש לך עליו מסשנים קודמים. אל תגיד "אני לא רואה" או "אין לי גישה" — מה שיש למטה, זה שלך.
קודם כיוון כללי, אחר כך פרטים כשמבקשים.`,
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

  parts.push("--- מה אתה כבר יודע עליו (מסשנים קודמים — זה שלך, תשתמש בזה) ---");

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

// ---- Log Opus response as training candidate for v15 ----
async function logTrainingCandidate(supabase, userMessage, opusResponse, reason) {
  if (!supabase) return;
  try {
    await supabase.from("training_candidates").insert({
      user_message: userMessage,
      assistant_response: opusResponse,
      reason,
      created_at: new Date().toISOString(),
    });
    console.log(`[magen] Training candidate saved (reason: ${reason})`);
  } catch (err) {
    console.error("[magen] Training candidate save error:", err?.message);
  }
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
        `${MAGEN_TONE}\n${personalCtx}`,
        context.recentMessages, userMessage,
        brief.escalate || "המשתמש במשבר"
      );

      // Update personal file from analysis
      updatePersonalFile(supabase, context.userId, brief).catch(() => {});
      // Save for v15 training
      logTrainingCandidate(supabase, userMessage, opusResult.text, brief.escalate || "crisis").catch(() => {});

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
  const topScore = ragResults.rights?.[0]?._score || 0;
  console.log(`[magen] RAG: ${ragResults.rights?.length || 0} rights (top: ${topScore.toFixed(3)}), ${ragResults.events?.length || 0} events, ${ragResults.veteran?.length || 0} veteran`);

  // === Step 2.5: Low RAG confidence + factual query → Opus ===
  const hasQueries = (brief.rag_queries?.length || 0) > 0;
  const ragWeak = !ragResults.rights?.length || topScore < 0.4;
  if (hasQueries && ragWeak && brief.complexity !== "simple") {
    console.log(`[magen] RAG too weak (score: ${topScore.toFixed(3)}) → Opus`);
    try {
      const personalCtx = buildPersonalContext(context);
      const opusResult = await callOpus(
        `${MAGEN_TONE}\n${personalCtx}`,
        context.recentMessages, userMessage,
        "RAG לא מצא מידע מספיק — ענה מהידע שלך"
      );
      updatePersonalFile(supabase, context.userId, brief).catch(() => {});
      logTrainingCandidate(supabase, userMessage, opusResult.text, "weak-rag").catch(() => {});
      return {
        reply: opusResult.text,
        tokens: analysis.tokens + opusResult.tokens,
        layer: "opus",
      };
    } catch (err) {
      console.error("[magen] Opus (weak RAG) failed:", err.message);
      // Fall through to v14b anyway
    }
  }

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

// =============================================================
// LAYER 2: Execution Layer — Haiku writes the response from brief
// =============================================================

import { MODEL_HAIKU } from "./models";

const EXECUTION_SYSTEM_PROMPT = `אתה מבצע תשובות עבור מגן — פורטל AI לפצועי צה"ל.
אתה מקבל brief מובנה שמסביר בדיוק מה לענות, באיזה טון, ובאיזה אורך.

=== כללים קריטיים ===
1. עקוב אחרי ה-brief במדויק — הוא כבר הבין מה המשתמש צריך
2. דבר בעברית ישראלית טבעית — כמו חבר, לא כמו טופס
3. שמור על max_lines מה-brief
4. אם include_formula=true — כתוב נוסח פנייה בפורמט ---נוסח--- ... ---סוף נוסח--- (עד 500 תווים)
5. אם include_phone=true — כלול מספר טלפון רלוונטי
6. לעולם לא "בהצלחה" יבש — תמיד "אני כאן, תחזור מתי שתרצה"
7. לעולם לא "כמה אחוזים יש לך?" — תמיד "איפה אתה עומד מול משרד הביטחון?"
8. סיים עם שאלה או הצעה שמניעה לפעולה

=== טונים ===
- warm_direct: ישיר, חם, מקצועי. "אחי, מגיע לך X. ככה עושים:"
- professional_caring: מקצועי עם חום. "בוא נעשה את זה ביחד."
- peer_casual: חבר ותיק. "אני מכיר את זה. תקשיב..."
- cheerful_active: חברותי ומזמין. "יש דברים מגניבים בשבוע הקרוב!"

=== כובעים ===
- lawyer (דן): מומחה זכויות. ישיר ומקצועי. מציע זכויות שלא ידועות.
- social (מיכל): מלווה בירוקרטיה. חמה ומעשית. שלבים מספרים.
- psycho (אורי): חבר ותיק. לא קליני. תשובות קצרות כמו WhatsApp.
- veteran (רועי): חכמת ותיקים. "מניסיון של חבר'ה..."
- events (שירה): אירועים. חברותית. תמיד 2-3 אירועים.

=== פלט ===
כתוב תשובה ישירות למשתמש. בלי JSON, בלי הסברים. פשוט התשובה.`;

/**
 * Build the execution input for Haiku
 */
export function buildExecutionInput(brief, ragResults, userMessage) {
  const parts = [];

  // The brief
  parts.push("[brief]");
  parts.push(JSON.stringify(brief, null, 2));
  parts.push("");

  // RAG: rights knowledge
  if (ragResults?.rights && ragResults.rights.length > 0) {
    parts.push("[ידע זכויות]");
    ragResults.rights.forEach(r => {
      let line = `• ${r.title}: ${r.details}`;
      if (r.practical_tip) line += ` (טיפ: ${r.practical_tip})`;
      if (r.phone_number) line += ` | טלפון: ${r.phone_number}`;
      parts.push(line);
    });
    parts.push("");
  }

  // RAG: veteran wisdom
  if (ragResults?.veteran && ragResults.veteran.length > 0) {
    parts.push("[חכמת ותיקים]");
    ragResults.veteran.forEach(v => {
      parts.push(`• ${v.title}: ${v.content}`);
    });
    parts.push("");
  }

  // RAG: portal formulas
  if (ragResults?.formulas && ragResults.formulas.length > 0 && brief.include_formula) {
    parts.push("[נוסחי פנייה]");
    ragResults.formulas.forEach(f => {
      parts.push(`• קטגוריה: ${f.category}`);
      parts.push(`  נוסח: ${f.formula_text}`);
      if (f.required_docs?.length) parts.push(`  מסמכים: ${f.required_docs.join(", ")}`);
      parts.push(`  נתיב: ${f.portal_path}`);
    });
    parts.push("");
  }

  // RAG: events
  if (ragResults?.events && ragResults.events.length > 0) {
    parts.push("[אירועים קרובים]");
    ragResults.events.forEach(e => {
      let line = `• ${e.title} — ${e.date}`;
      if (e.time) line += ` ${e.time}`;
      line += ` | ${e.location} (${e.city})`;
      if (e.free) line += " | חינם";
      if (e.registration) line += ` | הרשמה: ${e.registration}`;
      parts.push(line);
    });
    parts.push("");
  }

  // Original user message
  parts.push("[הודעת המשתמש המקורית]");
  parts.push(userMessage);

  return parts.join("\n");
}

/**
 * Call Haiku to execute the response based on brief + RAG
 */
export async function executeResponse(brief, ragResults, userMessage) {
  const input = buildExecutionInput(brief, ragResults, userMessage);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL_HAIKU,
      max_tokens: 1000,
      system: EXECUTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: input }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Execution layer error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "מצטער, לא הצלחתי לעבד את התשובה. נסה שוב.";
}

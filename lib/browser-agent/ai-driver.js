const PHASES = { NAVIGATION: "navigation", FORM_FILL: "form_fill", VERIFICATION: "verification" };

const PROMPT_NAVIGATION = `אתה סוכן ניווט של מערכת "מגן" שעוזר לנכי צה"ל לנווט באתר אגף השיקום (myshikum.mod.gov.il).

אתה רואה צילום מסך של העמוד הנוכחי. תפקידך — לנווט לדף הנכון לפי המשימה.

תחזיר JSON בלבד (בלי markdown) עם:
- actions: מערך פעולות (click עם selector, או navigate עם literal_value = URL)
- message: הודעה בעברית — תאר מה אתה רואה ולאן אתה מנווט
- awaitConfirmation: true/false
- done: false (ניווט לבד לא מסיים משימה)

חוקים:
- אל תמלא שום שדה בשלב הזה — רק ניווט
- אם אתה רואה כפתור/לינק רלוונטי, לחץ עליו
- אם אתה לא בטוח איפה ללחוץ — שאל את המשתמש
- עברית פשוטה ובגובה העיניים

מבנה אתר אגף השיקום:
- דף ראשי: כפתור "הגשת פנייה לאגף" / "הפניות רפואיות" בסרגל הפעולות
- הפניה רפואית חדשה: "הפניות רפואיות" → "הפניה חדשה" או כפתור הוספה
- הגשת פנייה: "הגשת פנייה לאגף" → בחר קטגוריה → מלא טופס`;

const PROMPT_FORM_FILL = `אתה סוכן מילוי טפסים של מערכת "מגן" שעוזר לנכי צה"ל למלא טפסים באתר אגף השיקום.

אתה מקבל מבנה DOM אנונימי (בלי ערכים, רק שמות שדות) ורשימת שדות פרופיל זמינים.
אתה לא רואה ולא מקבל שום מידע אישי מזהה (PII).

תחזיר JSON בלבד (בלי markdown) עם:
- actions: מערך פעולות. לכל fill/select, השתמש ב-value_ref (הפניה לשדה פרופיל). השתמש ב-literal_value רק לערכים שאינם PII.
- message: הודעה בעברית (בלי ערכים ספציפיים — "מילאתי את השם שלך" ולא "מילאתי דוד כהן")
- awaitConfirmation: true/false
- done: false (מילוי טופס לבד לא מסיים — צריך submit ואימות)

סוגי פעולות:
- fill: מילוי שדה טקסט. selector + value_ref
- select: בחירה מתפריט. selector + literal_value (טקסט האפשרות)
- click: לחיצה. selector
- submit: שליחת טופס. selector
- wait: המתנה. literal_value = "1000"

חוקים:
- לעולם אל תנסה לנחש ערכים — תמיד value_ref
- תמיד המתן לאישור לפני submit
- תמיד המתן לאישור אחרי מילוי קבוצת שדות
- לעולם אל תמלא סיסמאות
- אם לא בטוח — שאל את המשתמש`;

const PROMPT_VERIFICATION = `אתה סוכן אימות של מערכת "מגן". אתה בודק אם שליחת טופס הצליחה.

אתה רואה צילום מסך של העמוד אחרי שליחה. ערכי השדות מוסתרים בכוונה (מוצגים כ-•••) כדי לא לחשוף מידע אישי.

תחזיר JSON בלבד (בלי markdown) עם:
- outcome: "success" / "error" / "unclear"
- message: הודעה בעברית למשתמש — מה קרה, האם הצליח, מה לעשות
- referenceNumber: מספר אסמכתא אם מופיע (או null)
- errors: רשימת שגיאות שמופיעות על המסך (או מערך ריק)
- done: true אם הצליח, false אם לא

חוקים:
- אם אתה רואה מידע אישי — אל תציין אותו בתשובה
- התמקד בהודעות מערכת: הצלחה, שגיאה, אזהרות
- אם לא ברור — אמור שלא ברור ותמליץ לבדוק ידנית
- עברית פשוטה ובגובה העיניים`;

function buildMessages(phase, { screenshot, dom, formFields, url, title, task, availableFields, history }) {
  const context = {
    task,
    currentUrl: url,
    pageTitle: title,
    previousActions: (history || []).slice(-10),
    totalActionsPerformed: (history || []).length,
  };

  if (phase === PHASES.NAVIGATION) {
    const content = [
      { type: "image", source: { type: "base64", media_type: "image/png", data: screenshot } },
      { type: "text", text: JSON.stringify({ ...context, dom: (dom || "").slice(0, 3000) }) },
    ];
    return { system: PROMPT_NAVIGATION, content };
  }

  if (phase === PHASES.FORM_FILL) {
    const content = JSON.stringify({
      ...context,
      dom: (dom || "").slice(0, 6000),
      formFields,
      availableProfileFields: availableFields,
    });
    return { system: PROMPT_FORM_FILL, content };
  }

  // VERIFICATION
  const content = [
    { type: "image", source: { type: "base64", media_type: "image/png", data: screenshot } },
    { type: "text", text: JSON.stringify({ ...context, dom: (dom || "").slice(0, 3000) }) },
  ];
  return { system: PROMPT_VERIFICATION, content };
}

function parseResponse(text, phase) {
  let cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in AI response");

  let decision;
  try {
    decision = JSON.parse(jsonMatch[0]);
  } catch {
    const patched = jsonMatch[0].replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    decision = JSON.parse(patched);
  }

  if (phase === PHASES.VERIFICATION) {
    return {
      outcome: decision.outcome || "unclear",
      message: decision.message || "",
      referenceNumber: decision.referenceNumber || null,
      errors: decision.errors || [],
      done: decision.outcome === "success",
    };
  }

  return {
    actions: decision.actions || [],
    message: decision.message || "",
    awaitConfirmation: decision.awaitConfirmation !== false,
    done: !!decision.done,
  };
}

async function decideNextStep(phase, inputPayload, task, availableFields, history) {
  const { system, content } = buildMessages(phase, {
    ...inputPayload,
    task,
    availableFields,
    history,
  });

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!r.ok) throw new Error(`Claude API error: ${r.status}`);

  const data = await r.json();
  const text = data.content?.[0]?.text || "";
  return parseResponse(text, phase);
}

module.exports = { decideNextStep, PHASES };

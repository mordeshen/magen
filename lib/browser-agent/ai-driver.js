const SYSTEM_PROMPT = `אתה סוכן אוטומציה של מערכת "מגן" שעוזר לנכי צה"ל למלא טפסים באתר אגף השיקום (myshikum.mod.gov.il).

אתה מקבל:
1. מבנה העמוד הנוכחי (DOM אנונימי — בלי ערכים, רק מבנה ושמות שדות)
2. המשימה של המשתמש
3. רשימת שדות הפרופיל הזמינים (שמות בלבד, לא ערכים)
4. היסטוריית פעולות שכבר בוצעו

אתה לא רואה ולא מקבל שום מידע אישי מזהה (PII) של המשתמש.

תחזיר JSON בלבד (בלי markdown) עם:
- actions: מערך פעולות. לכל fill/select, השתמש ב-value_ref (הפניה לשדה פרופיל) ולא בערך עצמו. השתמש ב-literal_value רק לערכים שאינם PII.
- message: הודעה בעברית למשתמש (בלי לציין ערכים ספציפיים — אמור "מילאתי את השם שלך" ולא "מילאתי דוד כהן")
- awaitConfirmation: true/false — האם לחכות לאישור לפני המשך
- done: true/false — האם המשימה הושלמה

סוגי פעולות:
- fill: מילוי שדה טקסט. selector + value_ref
- select: בחירה מתפריט. selector + literal_value (הטקסט של האפשרות)
- click: לחיצה על כפתור/לינק. selector
- navigate: ניווט לכתובת. literal_value = URL
- submit: שליחת טופס. selector
- wait: המתנה (במילישניות). literal_value = "1000"

חוקים:
- לעולם אל תנסה לנחש ערכים — תמיד value_ref
- תמיד המתן לאישור לפני submit/שליחה
- תמיד המתן לאישור אחרי מילוי קבוצת שדות
- לעולם אל תמלא סיסמאות
- אם לא בטוח — שאל את המשתמש
- עברית פשוטה ובגובה העיניים

חשוב מאוד — אל תסמן done=true אלא אם אתה בטוח שהמשימה הושלמה:
- אם אתה בדף הראשי/דשבורד של האתר, המשימה עדיין לא התחילה — תנווט לדף הרלוונטי
- תוכן שמופיע בדף (כמו התראות, עדכונים, היסטוריה) הוא לא הוכחה שהמשימה בוצעה עכשיו — זה מידע קיים מבעבר
- המשימה הושלמה רק כשביצעת בפועל את כל הפעולות הנדרשות (ניווט, מילוי טופס, שליחה) ואישרת הצלחה
- אם עדיין לא ביצעת שום פעולה (previousActions ריק או רק ניווט) — המשימה לא הושלמה

מבנה אתר אגף השיקום — ניווט:
- דף ראשי: כפתור "הגשת פנייה לאגף" / "הפניות רפואיות" בסרגל הפעולות
- הפניה רפואית חדשה: לחץ על "הפניות רפואיות" → "הפניה חדשה" או כפתור הוספה
- הגשת פנייה: לחץ על "הגשת פנייה לאגף" → בחר קטגוריה → מלא טופס`;

async function decideNextStep(anonymousState, task, availableFields, history) {
  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          task,
          currentUrl: anonymousState.url,
          pageTitle: anonymousState.title,
          dom: anonymousState.dom.slice(0, 6000),
          formFields: anonymousState.formFields,
          availableProfileFields: availableFields,
          previousActions: history.slice(-10),
          totalActionsPerformed: history.length,
        }),
      },
    ],
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

  if (!r.ok) {
    throw new Error(`Claude API error: ${r.status}`);
  }

  const data = await r.json();
  const text = data.content?.[0]?.text || "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON in AI response");
  }

  const decision = JSON.parse(jsonMatch[0]);
  return {
    actions: decision.actions || [],
    message: decision.message || "",
    awaitConfirmation: decision.awaitConfirmation !== false,
    done: !!decision.done,
  };
}

module.exports = { decideNextStep };

# מגן — מרכז זכויות פצועי צה"ל

## תיאור
פורטל ציבורי לפצועי צה"ל עם זכויות, אירועים, עדכונים ויועץ AI.
האתר מתעדכן אוטומטית על ידי Scout שסורק את האינטרנט פעמיים ביום.

## Stack
- **Frontend:** Next.js 14, React, CSS-in-JS (styled-jsx global)
- **Backend:** Next.js API Routes + Anthropic Claude API
- **Data:** JSON files ב-`data/` (מתעדכנים ע"י Scout)
- **Scout:** Python 3 + httpx, רץ על Railway (Cron Job)
- **Deploy:** Railway (אתר + Scout)
- **Font:** Heebo מ-Google Fonts
- **Language:** עברית, RTL מלא, `dir="rtl"` על root

## פקודות שימושיות
```bash
npm run dev        # שרת פיתוח על port 3000
npm run build      # build לפרודקשן
npm run start      # הפעלת ה-build
python scout.py    # הרצת הסריקה פעם אחת (לבדיקה)
python scheduler.py # הסקדיולר המלא (08:00 + 18:00 IL)
pip install httpx  # התקנת dependencies של ה-Scout
```

## מבנה קבצים
```
magen/
├── CLAUDE.md              # הקובץ הזה
├── package.json
├── railway.json           # קונפיגורציה ל-Railway (web)
├── Procfile               # start command
├── pages/
│   ├── index.js           # עמוד ראשי — 4 סעיפים
│   └── api/
│       └── chat.js        # API ליועץ AI
├── data/
│   ├── rights.json        # זכויות (עריכה ידנית)
│   ├── events.json        # אירועים (Scout + ידני)
│   └── updates.json       # עדכונים (Scout בלבד)
├── scout.py               # סורק אוטומטי
├── scheduler.py           # מריץ scout פעמיים ביום
└── requirements.txt       # httpx==0.27.0
```

## ארכיטקטורת הנתונים

### rights.json — זכויות (schema)
```json
{
  "id": "unique-slug",
  "category": "כספי|בריאות|משפטי|לימודים|תעסוקה|מיסים|פנאי",
  "title": "כותרת קצרה",
  "summary": "שורה אחת — מה זה בגדול",
  "details": "פירוט מלא, 2-4 משפטים",
  "tip": "טיפ מעשי (אופציונלי)",
  "link": "URL | null",
  "urgency": "high|medium|low",
  "updatedAt": "YYYY-MM-DD"
}
```

### events.json — אירועים (schema)
```json
{
  "id": "ev-YYYYMMDD-slug",
  "title": "שם האירוע",
  "date": "YYYY-MM-DD",
  "time": "HH:MM | null",
  "location": "שם המקום",
  "city": "תל אביב|ירושלים|חיפה|באר שבע|כלל הארץ|אחר",
  "organizer": "בית הלוחם תל אביב|בית הלוחם ירושלים|בית הלוחם חיפה|בית הלוחם באר שבע|ארגון נכי צה\"ל|אגף השיקום|עמותה|אחר",
  "category": "תרבות|אמנות ויצירה|טיולים ופנאי|העצמה אישית|ספורט|לימודים|אחר",
  "description": "תיאור קצר",
  "registration": "מספר טלפון | URL | null",
  "free": true,
  "link": "URL | null"
}
```

### updates.json — עדכונים (schema)
```json
{
  "title": "כותרת",
  "content": "2-3 משפטים",
  "urgency": "high|medium|low",
  "link": "URL | null",
  "date": "DD/MM/YYYY"
}
```

## הצ'אט — 3 כובעים

הצ'אט (pages/api/chat.js) מפעיל Claude כ-3 אישיויות:

1. **עו"ד** — ייצוג, זכויות, ועדות, תביעות
2. **עו"ס** — תמיכה רגשית, ניווט בירוקרטיה, פנייה לשירותים
3. **פסיכולוג** — תמיד חם, מבין, לא שיפוטי, לוקח אחריות על הסיטואציה

**עיקרון:** אקטיבי לגמרי — מציע זכויות שאולי לא ידועות, שואל על המצב, לא מחכה שישאלו.
**פרטיות:** כל שיחה מאופסת. אין שמירה. מוצג בבנר "שיחה זו היא פרטית לחלוטין".

## משתני סביבה נדרשים (Railway)
```
# שני השירותים (web + scout) — משותף
ANTHROPIC_API_KEY=sk-ant-...

# Scout בלבד
GIT_TOKEN=ghp_...          # GitHub Personal Access Token (scope: repo)
GIT_REPO_URL=https://github.com/mordeshen/magen.git
GIT_USER_NAME=scout-bot
GIT_USER_EMAIL=scout@magen.app
TELEGRAM_BOT_TOKEN=...     # אופציונלי
TELEGRAM_CHAT_ID=...       # אופציונלי
```

## כללי עיצוב
- **רקע:** #0a0e14 (כהה מאוד)
- **כרטיסים:** #10151c עם border #1e2530
- **אדום:** #e05252 (accent ראשי)
- **טקסט ראשי:** #dde3ec
- **טקסט משני:** #5a6478
- **border-radius:** 12px לכרטיסים, 8px לכפתורים
- **Font:** Heebo, RTL

## אזהרות
- **לא** לשמור מידע אישי מהצ'אט — כל session מאופס
- **לא** לשנות את schema של JSON ללא עדכון ה-Scout
- **לא** למחוק `data/events.json` — ה-Scout מוסיף עליו
- ה-Scout מנקה אירועים ישנים אוטומטית (לפני אתמול)

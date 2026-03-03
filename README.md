# 🛡️ מגן — מרכז זכויות פצועי צה"ל

## Claude Code

פרויקט זה בנוי לעבודה עם **Claude Code**.

```bash
# עבודה עם Claude Code:
cd magen
claude  # מפעיל Claude Code, קורא את CLAUDE.md אוטומטית
```

Claude Code יקרא את `CLAUDE.md` בכל שיחה — כולל stack, schema, כללי עיצוב.

---

## מה יש

| סעיף | תוכן |
|------|------|
| זכויות | 9+ זכויות + חיפוש + סינון |
| אירועים | לוח + מיון לפי **מארגן** + עיר + קטגוריה |
| עדכונים | נסרקים אוטומטית פעמיים ביום |
| יועץ AI | **עו"ד + עו"ס + פסיכולוג** + בנר פרטיות |

---

## דיפלוי — 3 שלבים

### 1. GitHub
```bash
git init && git add . && git commit -m "init magen"
# צור repo: github.com/new → magen
git remote add origin https://github.com/YOUR/magen.git
git push -u origin main
```

### 2. Vercel (האתר)
1. [vercel.com](https://vercel.com) → Import → `magen`
2. Framework: Next.js (אוטומטי)
3. Env: `ANTHROPIC_API_KEY=sk-ant-...`
4. Deploy ✅

### 3. Render (ה-Scout)
1. [render.com](https://render.com) → Background Worker → Repo: `magen`
2. Build: `pip install httpx`
3. Start: `python scheduler.py`
4. Env vars:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | מפתח Anthropic |
| `GIT_TOKEN` | GitHub PAT (scope: repo) |
| `GIT_REPO_URL` | `https://github.com/YOUR/magen.git` |
| `GIT_USER_NAME` | שם משתמש |
| `GIT_USER_EMAIL` | אימייל |
| `TELEGRAM_BOT_TOKEN` | (אופציונלי) |
| `TELEGRAM_CHAT_ID` | (אופציונלי) |

---

## עריכת תוכן ב-Claude Code

```
claude
> הוסף זכות חדשה: מענק נסיעות לנכים
> עדכן את האירוע ev-20260305-teatro-tla — שנה התאריך ל-2026-03-12
> הוסף מארגן "עמותת ידיד" לרשימת המארגנים
```

---

## עלויות
Vercel + Render + GitHub = **חינם** | Claude API = **~$1-2/חודש**

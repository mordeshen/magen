# מגן — מרכז זכויות פצועי צה"ל

## Claude Code

פרויקט זה בנוי לעבודה עם **Claude Code**.

```bash
cd magen
claude  # מפעיל Claude Code, קורא את CLAUDE.md אוטומטית
```

---

## מה יש

| סעיף | תוכן |
|------|------|
| זכויות | 12 זכויות + חיפוש + סינון |
| אירועים | לוח + מיון לפי **מארגן** + עיר + קטגוריה |
| עדכונים | נסרקים אוטומטית פעמיים ביום |
| יועץ AI | **עו"ד + עו"ס + פסיכולוג** + בנר פרטיות |

---

## דיפלוי — Railway (הכל במקום אחד)

### 1. GitHub (כבר מוכן)
```
https://github.com/mordeshen/magen.git
```

### 2. Railway — שירות Web (האתר)
1. [railway.com](https://railway.app) → New Project → Deploy from GitHub → `mordeshen/magen`
2. Railway יזהה Next.js אוטומטית
3. הגדר Environment Variable:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | מפתח Anthropic |
| `PORT` | `3000` |

4. Deploy → האתר עולה עם דומיין `*.up.railway.app`

### 3. Railway — Cron Job (ה-Scout)
1. באותו Project → New Service → GitHub Repo → `mordeshen/magen`
2. שנה את סוג השירות ל-**Cron Job**
3. Cron Schedule: `0 5,15 * * *` (= 08:00 + 18:00 שעון ישראל)
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `python scout.py`
6. Env vars:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | מפתח Anthropic |
| `GIT_TOKEN` | GitHub PAT (scope: repo) |
| `GIT_REPO_URL` | `https://github.com/mordeshen/magen.git` |
| `GIT_USER_NAME` | `scout-bot` |
| `GIT_USER_EMAIL` | `scout@magen.app` |
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
Railway + GitHub = **חינם (Hobby tier)** | Claude API = **~$1-2/חודש**

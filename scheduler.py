"""
מגן — Scheduler
מריץ את scout.py פעמיים ביום: 08:00 + 18:00 שעון ישראל
שולח סיכום פידבקים למייל: 09:00 שעון ישראל
תזכורות חד-פעמיות למייל לפי תאריך
"""

import time, subprocess, os, json
from datetime import datetime, timezone, timedelta, date

try:
    import httpx
except ImportError:
    httpx = None

IL = timezone(timedelta(hours=3))
RUN_HOURS = {8, 18}
FEEDBACK_HOUR = 9

# תזכורות חד-פעמיות — כשהתאריך מגיע, נשלח מייל ומסמנים כ-sent
REMINDERS = [
    {
        "id": "gh-pat-renewal-2026",
        "date": "2026-05-28",
        "subject": "🔑 מגן — תזכורת: לחדש GitHub Personal Access Token",
        "body": "היי,\n\nה-Personal Access Token (classic) של GitHub יפוג בעוד 5 ימים (2026-06-02).\n\nמה לעשות:\n1. נכנסים ל-GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)\n2. לוחצים על הטוקן הקיים → Regenerate token\n3. בוחרים תוקף חדש (90 ימים או יותר)\n4. מעתיקים את הטוקן החדש\n5. מעדכנים ב-Railway → שירות Scout → Variables → GIT_TOKEN\n\nבלי זה ה-Scout לא יוכל לדחוף עדכונים ל-GitHub.\n\n— מגן 🛡️",
    },
]
SENT_FILE = "sent_reminders.json"


def now_il():
    return datetime.now(IL)


def run_scout():
    print(f"\n🕐 [{now_il().strftime('%H:%M')}] מפעיל Scout...")
    try:
        subprocess.run(["python", "scout.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Scout נכשל: {e}")


def send_feedback_digest():
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    secret = os.environ.get("FEEDBACK_CRON_SECRET", "")
    if not app_url or not secret:
        print("⚠️  חסר APP_URL או FEEDBACK_CRON_SECRET — מדלג על פידבק")
        return
    url = f"{app_url}/api/feedback-digest?key={secret}"
    print(f"\n📬 [{now_il().strftime('%H:%M')}] שולח סיכום פידבקים...")
    try:
        if httpx:
            r = httpx.get(url, timeout=30)
            print(f"  📬 תגובה: {r.status_code} — {r.text[:200]}")
        else:
            import urllib.request
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                print(f"  📬 תגובה: {resp.status} — {resp.read(200).decode()}")
    except Exception as e:
        print(f"  ⚠️  שגיאה בשליחת פידבק: {e}")


def load_sent():
    try:
        return set(json.loads(open(SENT_FILE).read()))
    except Exception:
        return set()


def save_sent(s):
    open(SENT_FILE, "w").write(json.dumps(list(s)))


def check_reminders():
    resend_key = os.environ.get("RESEND_API_KEY", "")
    admin_email = os.environ.get("ADMIN_EMAIL", "")
    if not resend_key or not admin_email:
        return

    today_str = str(now_il().date())
    sent = load_sent()

    for rem in REMINDERS:
        if rem["id"] in sent:
            continue
        if rem["date"] > today_str:
            continue

        print(f"\n🔔 [{now_il().strftime('%H:%M')}] שולח תזכורת: {rem['subject']}")
        try:
            import urllib.request
            data = json.dumps({
                "from": "מגן <feedback@resend.dev>",
                "to": [admin_email],
                "subject": rem["subject"],
                "text": rem["body"],
            }).encode()
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=data,
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                print(f"  🔔 נשלח: {resp.status}")
            sent.add(rem["id"])
            save_sent(sent)
        except Exception as e:
            print(f"  ⚠️  שגיאה: {e}")


def main():
    print("🛡️  מגן Scheduler — Scout 08:00+18:00 | פידבק 09:00 IL")
    last_scout = None
    last_feedback = None

    while True:
        t = now_il()
        h = t.hour
        today = t.date()

        if h in RUN_HOURS and last_scout != (today, h):
            run_scout()
            last_scout = (today, h)

        if h == FEEDBACK_HOUR and last_feedback != today:
            send_feedback_digest()
            check_reminders()
            last_feedback = today

        time.sleep(60)


if __name__ == "__main__":
    main()

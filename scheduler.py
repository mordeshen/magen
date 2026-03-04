"""
מגן — Scheduler
מריץ את scout.py פעמיים ביום: 08:00 + 18:00 שעון ישראל
שולח סיכום פידבקים למייל: 09:00 שעון ישראל
"""

import time, subprocess, os
from datetime import datetime, timezone, timedelta

try:
    import httpx
except ImportError:
    httpx = None

IL = timezone(timedelta(hours=3))
RUN_HOURS = {8, 18}
FEEDBACK_HOUR = 9


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
            last_feedback = today

        time.sleep(60)


if __name__ == "__main__":
    main()

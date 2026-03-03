"""
מגן — Scheduler
מריץ את scout.py פעמיים ביום: 08:00 + 18:00 שעון ישראל
"""

import time, subprocess, os
from datetime import datetime, timezone, timedelta

IL = timezone(timedelta(hours=3))
RUN_HOURS = {8, 18}


def now_il():
    return datetime.now(IL)


def run_scout():
    print(f"\n🕐 [{now_il().strftime('%H:%M')}] מפעיל Scout...")
    try:
        subprocess.run(["python", "scout.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Scout נכשל: {e}")


def main():
    print("🛡️  מגן Scheduler — 08:00 + 18:00 IL")
    last_run = None

    while True:
        t = now_il()
        h = t.hour
        today = t.date()

        if h in RUN_HOURS and last_run != (today, h):
            run_scout()
            last_run = (today, h)

        time.sleep(60)


if __name__ == "__main__":
    main()

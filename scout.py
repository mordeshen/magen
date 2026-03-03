"""
מגן — Scout אוטומטי v2
מחפש עדכונים + אירועים (עם שדה organizer)
כותב ל-data/*.json ודוחף ל-GitHub → Vercel redeploy
"""

import os, json, hashlib, httpx, asyncio, subprocess
from datetime import datetime, date, timedelta
from pathlib import Path

API_KEY   = os.environ["ANTHROPIC_API_KEY"]
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")
DATA      = Path("data")
SEEN_FILE = Path("seen_hashes.json")
MODEL     = "claude-sonnet-4-6"

# ── prompts ────────────────────────────────────────────────

UPDATES_PROMPT = """אתה סוכן סריקה לזכויות פצועי צה"ל.

זהה מידע חדש מהחודש האחרון: מענקים, שינויי חוק, הטבות שנפתחו, מועדי הגשה.

אם אין מידע חדש: ענה בדיוק: NO_NEW_UPDATES

אחרת — JSON בלבד (ללא markdown):
[{
  "title": "כותרת קצרה",
  "content": "2-3 משפטים מעשיים",
  "urgency": "high|medium|low",
  "link": "URL|null"
}]"""

EVENTS_PROMPT = """אתה סוכן שמאתר אירועים וסדנאות לנכי צה"ל.

חפש אירועים מהחודשיים הקרובים בבתי הלוחם, אגף השיקום, עמותות לפצועים.

אם אין אירועים חדשים: ענה בדיוק: NO_NEW_EVENTS

אחרת — JSON בלבד:
[{
  "id": "ev-YYYYMMDD-slug",
  "title": "שם האירוע",
  "date": "YYYY-MM-DD",
  "time": "HH:MM|null",
  "location": "שם המקום המדויק",
  "city": "תל אביב|ירושלים|חיפה|באר שבע|כלל הארץ|אחר",
  "organizer": "בית הלוחם תל אביב|בית הלוחם ירושלים|בית הלוחם חיפה|בית הלוחם באר שבע|ארגון נכי צה\"ל|אגף השיקום|עמותה|אחר",
  "category": "תרבות|אמנות ויצירה|טיולים ופנאי|העצמה אישית|ספורט|לימודים|אחר",
  "description": "תיאור קצר ומועיל",
  "registration": "טלפון|URL|null",
  "free": true,
  "link": "URL|null"
}]"""

# ── helpers ────────────────────────────────────────────────

def load_json(f, default):
    try:
        return json.loads(Path(f).read_text(encoding="utf-8"))
    except:
        return default

def save_json(f, data):
    Path(f).parent.mkdir(exist_ok=True)
    Path(f).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def load_seen():
    return set(load_json(SEEN_FILE, []))

def save_seen(s):
    SEEN_FILE.write_text(json.dumps(list(s)[-300:]))

def hsh(s):
    return hashlib.md5(str(s).encode()).hexdigest()

# ── claude ─────────────────────────────────────────────────

async def ask_claude(client, system_prompt, user_msg):
    r = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODEL, "max_tokens": 1500,
            "system": system_prompt,
            "tools": [{"type": "web_search_20250305", "name": "web_search"}],
            "messages": [{"role": "user", "content": user_msg}],
        },
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    return "".join(
        b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
    ).strip()

def extract_list(text):
    try:
        s, e = text.find("["), text.rfind("]") + 1
        if s >= 0 and e > s:
            return json.loads(text[s:e])
    except:
        pass
    return None

# ── scan functions ─────────────────────────────────────────

async def scan_updates(client, seen):
    today = date.today().strftime("%d/%m/%Y")
    text = await ask_claude(client, UPDATES_PROMPT,
        f"תאריך: {today}. חפש עדכוני זכויות פצועי צה\"ל חדשים — "
        f"מענקים, תגמולים, ייצוג משפטי, הטבות, שינויי חוק.")

    if "NO_NEW_UPDATES" in text:
        return 0

    items = extract_list(text)
    if not items:
        return 0

    new_items = [i for i in items if hsh(i.get("title","")) not in seen]
    if not new_items:
        return 0

    date_str = date.today().strftime("%d/%m/%Y")
    for i in new_items:
        i["date"] = date_str
        seen.add(hsh(i.get("title","")))

    updates = new_items + load_json(DATA / "updates.json", [])
    save_json(DATA / "updates.json", updates[:60])
    print(f"  📰 {len(new_items)} עדכונים חדשים")
    return len(new_items)


async def scan_events(client, seen):
    today_str = str(date.today())
    cutoff    = str(date.today() - timedelta(days=1))

    text = await ask_claude(client, EVENTS_PROMPT,
        f"תאריך: {date.today().strftime('%d/%m/%Y')}. "
        f"חפש אירועים וסדנאות לנכי צה\"ל בחודשיים הקרובים — "
        f"בתי הלוחם (ת\"א, ירושלים, חיפה, ב\"ש), ארגון נכי צה\"ל, אגף השיקום.")

    if "NO_NEW_EVENTS" in text:
        return 0

    items = extract_list(text)
    if not items:
        return 0

    existing = load_json(DATA / "events.json", [])
    # נקה ישנים
    existing = [e for e in existing if e.get("date", "") >= cutoff]
    exist_ids = {e["id"] for e in existing}

    added = 0
    for item in items:
        if item.get("date", "") < today_str:
            continue
        if item["id"] in exist_ids:
            continue
        if hsh(item["id"]) in seen:
            continue
        # ודא שדה organizer
        if "organizer" not in item:
            item["organizer"] = "אחר"
        existing.append(item)
        seen.add(hsh(item["id"]))
        added += 1

    existing.sort(key=lambda e: e.get("date", ""))
    save_json(DATA / "events.json", existing)
    print(f"  📅 {added} אירועים חדשים")
    return added


async def send_telegram(client, n_updates, n_events):
    if not BOT_TOKEN or not CHAT_ID or (n_updates + n_events) == 0:
        return
    parts = []
    if n_updates: parts.append(f"📰 {n_updates} עדכוני זכויות חדשים")
    if n_events:  parts.append(f"📅 {n_events} אירועים חדשים")
    msg = (f"🛡️ *מגן — עדכון חדש*\n"
           f"_{date.today().strftime('%d/%m/%Y')}_\n\n"
           + "\n".join(parts) +
           "\n\nבקר באתר לפרטים.")
    await client.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": CHAT_ID, "text": msg, "parse_mode": "Markdown"},
        timeout=20,
    )


def git_push():
    try:
        subprocess.run(["git", "add", "data/"], check=True)
        subprocess.run(["git", "commit", "-m", f"scout: {date.today()}"], check=True)
        subprocess.run(["git", "push"], check=True)
        print("  🚀 Git pushed → Vercel redeploy")
    except subprocess.CalledProcessError as e:
        print(f"  ⚠️  Git: {e}")


async def run():
    print(f"\n🔍 [{datetime.now().strftime('%H:%M')}] Scout מתחיל...")
    seen = load_seen()

    async with httpx.AsyncClient() as client:
        n_u = await scan_updates(client, seen)
        n_e = await scan_events(client, seen)
        total = n_u + n_e

        if total == 0:
            print("💤 אין חדש")
            return

        save_seen(seen)
        await send_telegram(client, n_u, n_e)
        git_push()
        print(f'✅ סה"כ: {n_u} עדכונים + {n_e} אירועים')


if __name__ == "__main__":
    asyncio.run(run())

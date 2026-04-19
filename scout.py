"""
מגן — Scout אוטומטי v3
סורק אתרים ישירות + חיפוש web → עדכונים + אירועים
כותב ל-data/*.json ודוחף ל-GitHub → Railway redeploy
"""

import os, json, hashlib, httpx, asyncio, subprocess, re
from datetime import datetime, date, timedelta
from pathlib import Path
from html.parser import HTMLParser

API_KEY   = os.environ["ANTHROPIC_API_KEY"]
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")
DATA      = Path("data")
SEEN_FILE = Path("seen_hashes.json")
MODEL     = "claude-sonnet-4-6"

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

# ── בתי הלוחם — WordPress sites ──────────────────────────
BEIT_HALOHEM_SITES = [
    {"url": "https://bh-tla.inz.org.il/אירועים-וחדשות/", "city": "תל אביב", "organizer": "בית הלוחם תל אביב"},
    {"url": "https://bh-j.inz.org.il/אירועים-וחדשות/",  "city": "ירושלים", "organizer": "בית הלוחם ירושלים"},
    {"url": "https://bh-h.inz.org.il/אירועים-וחדשות/",  "city": "חיפה",    "organizer": "בית הלוחם חיפה"},
    {"url": "https://bh-bs.inz.org.il/אירועים-וחדשות/",  "city": "באר שבע", "organizer": "בית הלוחם באר שבע"},
]

# ── prompts ────────────────────────────────────────────────

UPDATES_PROMPT = """אתה סוכן סריקה לזכויות פצועי צה"ל.

חפש מידע חדש מהחודש האחרון:
- מענקים, שינויי חוק, הטבות שנפתחו, מועדי הגשה
- עדכונים מאגף השיקום, משרד הביטחון, ביטוח לאומי
- שינויים בזכויות נכי צה"ל, ותיקי מערכות
- עדכוני ארגון נכי צה"ל, נט"ל (natal.org.il)
- חקיקה חדשה שנוגעת לנפגעי פעולות איבה או נכי צה"ל

אם אין מידע חדש: ענה בדיוק: NO_NEW_UPDATES

אחרת — JSON בלבד (ללא markdown):
[{
  "title": "כותרת קצרה",
  "content": "2-3 משפטים מעשיים",
  "urgency": "high|medium|low",
  "link": "URL|null"
}]"""

EVENTS_PROMPT = """אתה סוכן שמאתר אירועים וסדנאות לנכי צה"ל.

חפש אירועים מהחודשיים הקרובים:
- בתי הלוחם (ת"א, ירושלים, חיפה, ב"ש): bh-tla.inz.org.il, bh-j.inz.org.il, bh-h.inz.org.il, bh-bs.inz.org.il
- ארגון נכי צה"ל (inz.org.il)
- אגף השיקום (shikum.mod.gov.il)
- עמותות: נט"ל (natal.org.il), עמותת חברים לרפואה, עמותת א.ל.י
- מרפאות "חוזרים לחיים"
- פעילויות ספורט, תרבות, טיולים, סדנאות, ערבי תרבות

חשוב מאוד לגבי link:
- חפש את הלינק הספציפי לעמוד האירוע עצמו, לא לדף הבית.
- אם אין לינק ישיר — שים null. עדיף null מאשר לינק לדף הבית.

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
  "link": "URL ספציפי לאירוע | null (לעולם לא לדף הבית!)"
}]"""

SCRAPE_PROCESS_PROMPT = """אתה מעבד תוכן גולמי מאתר בית הלוחם.

חלץ אירועים עתידיים מהתוכן הבא. כל אירוע חייב להיות **בעתיד** (אחרי {today}).

מידע על המקור:
- עיר: {city}
- מארגן: {organizer}

החזר JSON בלבד (ללא markdown). אם אין אירועים עתידיים — החזר [].

[{{
  "id": "ev-YYYYMMDD-slug-קצר-באנגלית",
  "title": "שם האירוע בעברית",
  "date": "YYYY-MM-DD",
  "time": "HH:MM|null",
  "location": "{organizer}",
  "city": "{city}",
  "organizer": "{organizer}",
  "category": "תרבות|אמנות ויצירה|טיולים ופנאי|העצמה אישית|ספורט|לימודים|אחר",
  "description": "תיאור קצר — מה האירוע, למי מתאים",
  "registration": "טלפון|URL|null",
  "free": true,
  "link": "URL ספציפי לאירוע | null"
}}]"""

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
    SEEN_FILE.write_text(json.dumps(list(s)[-500:]))

def hsh(s):
    return hashlib.md5(str(s).encode()).hexdigest()

# ── HTML text extractor ───────────────────────────────────

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer", "header"):
            self.skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer", "header"):
            self.skip = False

    def handle_data(self, data):
        if not self.skip:
            t = data.strip()
            if t:
                self.text.append(t)

def html_to_text(html, max_chars=8000):
    """Extract visible text from HTML, limited to max_chars."""
    extractor = TextExtractor()
    try:
        extractor.feed(html)
    except:
        pass
    text = "\n".join(extractor.text)
    return text[:max_chars]

# ── claude ─────────────────────────────────────────────────

async def ask_claude(client, system_prompt, user_msg, use_search=False):
    payload = {
        "model": MODEL, "max_tokens": 2000,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_msg}],
    }
    if use_search:
        payload["tools"] = [{"type": "web_search_20250305", "name": "web_search"}]

    r = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json=payload,
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

# ── scrape Beit HaLochim sites ────────────────────────────

async def scrape_beit_halohem(client, site, seen):
    """Scrape a Beit HaLochim WordPress events page directly."""
    url = site["url"]
    city = site["city"]
    organizer = site["organizer"]

    try:
        r = await client.get(url, timeout=30, follow_redirects=True,
                             headers={"User-Agent": BROWSER_UA})
        if r.status_code != 200:
            print(f"    ⚠️  {organizer}: HTTP {r.status_code}")
            return []
        html = r.text
    except Exception as e:
        print(f"    ⚠️  {organizer}: {e}")
        return []

    # Extract text from HTML
    text = html_to_text(html)
    if len(text) < 100:
        print(f"    ⚠️  {organizer}: תוכן ריק")
        return []

    # Send to Claude for processing (no web search, just text processing)
    today_str = str(date.today())
    prompt = SCRAPE_PROCESS_PROMPT.format(
        today=today_str, city=city, organizer=organizer
    )
    try:
        result = await ask_claude(client, prompt,
            f"תוכן מאתר {organizer}:\n\n{text}", use_search=False)
    except Exception as e:
        print(f"    ⚠️  {organizer}: Claude error: {e}")
        return []

    items = extract_list(result)
    if not items:
        return []

    # Filter and deduplicate
    new_events = []
    for item in items:
        if not item.get("id") or not item.get("date"):
            continue
        if item["date"] < today_str:
            continue
        if hsh(item["id"]) in seen:
            continue
        # Ensure organizer
        item["organizer"] = item.get("organizer", organizer)
        item["city"] = item.get("city", city)
        new_events.append(item)
        seen.add(hsh(item["id"]))

    if new_events:
        print(f"    ✅ {organizer}: {len(new_events)} אירועים")
    return new_events

# ── scan functions ─────────────────────────────────────────

async def scan_updates(client, seen):
    today = date.today().strftime("%d/%m/%Y")
    text = await ask_claude(client, UPDATES_PROMPT,
        f"תאריך: {today}. חפש עדכוני זכויות פצועי צה\"ל חדשים — "
        f"מענקים, תגמולים, ייצוג משפטי, הטבות, שינויי חוק. "
        f"חפש גם באתר אגף השיקום (shikum.mod.gov.il), "
        f"ארגון נכי צה\"ל (inz.org.il), ונט\"ל (natal.org.il).",
        use_search=True)

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

    # Phase 1: Direct scraping of Beit HaLochim sites
    print("  🏠 סורק בתי לוחם...")
    scraped_events = []
    for site in BEIT_HALOHEM_SITES:
        events = await scrape_beit_halohem(client, site, seen)
        scraped_events.extend(events)

    # Phase 2: Web search for additional events
    print("  🔍 חיפוש אירועים נוספים...")
    text = await ask_claude(client, EVENTS_PROMPT,
        f"תאריך: {date.today().strftime('%d/%m/%Y')}. "
        f"חפש אירועים וסדנאות לנכי צה\"ל בחודשיים הקרובים — "
        f"בתי הלוחם (ת\"א, ירושלים, חיפה, ב\"ש), ארגון נכי צה\"ל, אגף השיקום, "
        f"נט\"ל, עמותות, מרפאות חוזרים לחיים.",
        use_search=True)

    search_events = []
    if "NO_NEW_EVENTS" not in text:
        items = extract_list(text)
        if items:
            for item in items:
                if not item.get("id") or not item.get("date"):
                    continue
                if item["date"] < today_str:
                    continue
                if hsh(item["id"]) in seen:
                    continue
                if "organizer" not in item:
                    item["organizer"] = "אחר"
                search_events.append(item)
                seen.add(hsh(item["id"]))

    # Merge: scraped + search results
    all_new = scraped_events + search_events

    if not all_new:
        return 0

    # Load existing, clean old, add new, sort
    existing = load_json(DATA / "events.json", [])
    existing = [e for e in existing if e.get("date", "") >= cutoff]
    exist_ids = {e["id"] for e in existing}

    added = 0
    for item in all_new:
        if item["id"] not in exist_ids:
            existing.append(item)
            exist_ids.add(item["id"])
            added += 1

    existing.sort(key=lambda e: e.get("date", ""))
    save_json(DATA / "events.json", existing)
    print(f"  📅 {added} אירועים חדשים (סריקה: {len(scraped_events)}, חיפוש: {len(search_events)})")
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
    token    = os.environ.get("GIT_TOKEN", "")
    repo_url = os.environ.get("GIT_REPO_URL", "")
    user     = os.environ.get("GIT_USER_NAME", "scout-bot")
    email    = os.environ.get("GIT_USER_EMAIL", "scout@magen.app")

    if not token or not repo_url:
        print("  ⚠️  Git: חסר GIT_TOKEN או GIT_REPO_URL — מדלג על push")
        return

    try:
        # Configure git identity
        subprocess.run(["git", "config", "user.name", user], check=True)
        subprocess.run(["git", "config", "user.email", email], check=True)

        # Build authenticated remote URL: https://TOKEN@github.com/user/repo.git
        # GIT_REPO_URL is expected as https://github.com/user/repo.git
        auth_url = repo_url.replace("https://", f"https://{token}@")
        subprocess.run(["git", "remote", "set-url", "origin", auth_url], check=True)

        subprocess.run(["git", "add", "data/"], check=True)
        result = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            capture_output=True,
        )
        if result.returncode == 0:
            print("  💤 Git: אין שינויים לדחיפה")
            return

        subprocess.run(["git", "commit", "-m", f"scout: {date.today()}"], check=True)
        subprocess.run(["git", "push", "origin", "main"], check=True)
        print("  🚀 Git pushed → redeploy")
    except subprocess.CalledProcessError as e:
        print(f"  ⚠️  Git: {e}")


async def run():
    print(f"\n🔍 [{datetime.now().strftime('%H:%M')}] Scout v3 מתחיל...")
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

import { useState, useEffect, useRef } from "react";
import Head from "next/head";

// ─── Utilities ────────────────────────────────────────────

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "long" });
}

function daysUntil(str) {
  const now = new Date(); now.setHours(0,0,0,0);
  const d   = new Date(str + "T00:00:00");
  const diff = Math.round((d - now) / 86400000);
  if (diff < 0) return null;
  if (diff === 0) return "היום!";
  if (diff === 1) return "מחר";
  if (diff <= 7)  return `בעוד ${diff} ימים`;
  return null;
}

const URGENCY = {
  high:   { label: "חשוב לממש", color: "#e05252", bg: "rgba(224,82,82,.13)" },
  medium: { label: "שווה לבדוק", color: "#d4a017", bg: "rgba(212,160,23,.13)" },
  low:    { label: "לתשומת לב",  color: "#3fb97a", bg: "rgba(63,185,122,.13)"  },
};

const RCATS = ["הכל","כספי","בריאות","משפטי","לימודים","תעסוקה","מיסים","פנאי"];
const CITIES = ["הכל","תל אביב","ירושלים","חיפה","באר שבע","כלל הארץ"];
const ECATS  = ["הכל","תרבות","אמנות ויצירה","טיולים ופנאי","העצמה אישית","ספורט","לימודים"];
const ORGANIZERS = [
  "הכל",
  "בית הלוחם תל אביב",
  "בית הלוחם ירושלים",
  "בית הלוחם חיפה",
  "בית הלוחם באר שבע",
  "ארגון נכי צה\"ל",
  "אגף השיקום",
  "עמותה",
];

// ─── RightCard ─────────────────────────────────────────────

function RightCard({ r, open, onToggle }) {
  const u = URGENCY[r.urgency];
  return (
    <div className={`card ${open?"open":""}`} onClick={onToggle}>
      <div className="card-row">
        <span className="badge cat-badge">{r.category}</span>
        <span className="badge urg-badge" style={{ color: u.color, background: u.bg }}>{u.label}</span>
      </div>
      <h3 className="card-h">{r.title}</h3>
      <p className="card-sub">{r.summary}</p>
      {open && (
        <div className="card-body">
          <p>{r.details}</p>
          {r.tip && <div className="tip-box">💡 {r.tip}</div>}
          {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className="ext-link" onClick={e=>e.stopPropagation()}>למידע נוסף ←</a>}
        </div>
      )}
      <span className="chev">{open?"▲":"▼"}</span>
    </div>
  );
}

// ─── EventCard ─────────────────────────────────────────────

const ORG_COLORS = {
  "בית הלוחם תל אביב":    { color: "#4a8fdd", bg: "rgba(74,143,221,.12)" },
  "בית הלוחם ירושלים":    { color: "#a78bfa", bg: "rgba(167,139,250,.12)" },
  "בית הלוחם חיפה":       { color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  "בית הלוחם באר שבע":    { color: "#fb923c", bg: "rgba(251,146,60,.12)"  },
  "ארגון נכי צה\"ל":       { color: "#f472b6", bg: "rgba(244,114,182,.12)" },
  "אגף השיקום":            { color: "#e05252", bg: "rgba(224,82,82,.12)"   },
  "עמותה":                 { color: "#a3a3a3", bg: "rgba(163,163,163,.1)"  },
};

function OrgBadge({ organizer }) {
  const s = ORG_COLORS[organizer] || { color: "#a3a3a3", bg: "rgba(163,163,163,.1)" };
  return <span className="badge org-badge" style={{ color: s.color, background: s.bg }}>{organizer}</span>;
}

function EventCard({ ev }) {
  const soon = daysUntil(ev.date);
  return (
    <div className="ev-card">
      <div className="ev-top">
        <OrgBadge organizer={ev.organizer || "אחר"} />
        <span className="badge cat-badge">{ev.category}</span>
        {ev.free && <span className="badge free-badge">חינם</span>}
        {soon && <span className="badge soon-badge">{soon}</span>}
      </div>
      <h3 className="ev-h">{ev.title}</h3>
      <div className="ev-meta">
        <span>📅 {formatDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}</span>
        <span>📍 {ev.location}</span>
      </div>
      <p className="ev-desc">{ev.description}</p>
      <div className="ev-foot">
        {ev.registration && <span className="ev-reg">📞 {ev.registration}</span>}
        {ev.link && <a href={ev.link} target="_blank" rel="noopener noreferrer" className="ext-link">פרטים ←</a>}
      </div>
    </div>
  );
}

// ─── Chat ──────────────────────────────────────────────────

const HATS = [
  { id:"lawyer",  icon:"⚖",  label:"עו\"ד",    desc:"זכויות משפטיות, ועדות, תביעות" },
  { id:"social",  icon:"🤝",  label:"עו\"ס",    desc:"תמיכה, ניווט בירוקרטיה, שירותים" },
  { id:"psycho",  icon:"💙",  label:"פסיכולוג", desc:"רגש, מצב נפשי, עיבוד חוויות" },
];

function Chat({ rights }) {
  const [hat, setHat]         = useState("lawyer");
  const [msgs, setMsgs]       = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner]   = useState(true);
  const bottom = useRef(null);

  // Initialize greeting when hat changes (only if no messages yet)
  useEffect(() => {
    const greetings = {
      lawyer:  "שלום, אני כאן בכובע עורך הדין שלך ⚖️\n\nלא צריך להבין בחוק — בשביל זה אני כאן. אני אעזור לך להבין מה מגיע לך, צעד אחרי צעד. אם יש משהו להגיש — נעשה את זה ביחד.\n\nספר לי: כמה אחוזי נכות הוכרו לך, ומה הביא אותך לכאן?",
      social:  "שלום, אני כאן בתפקיד העו\"ס שלך 🤝\n\nאני יודע שהבירוקרטיה מתישה. לא צריך להתמודד עם זה לבד — אני אלווה אותך צעד אחרי צעד. טפסים, שיחות טלפון, פניות — נעשה את זה ביחד.\n\nספר לי: מה הכי לוחץ עליך עכשיו?",
      psycho:  "שלום, אני שמח שבאת לדבר 💙\n\nהמקום הזה הוא שלך — בלי שיפוט, בלי לחץ. לפעמים הדבר הכי קשה הוא פשוט להתחיל לדבר, ואתה כבר עושה את זה.\n\nאיך אתה מרגיש היום?",
    };
    setMsgs([{ role: "assistant", content: greetings[hat] }]);
  }, [hat]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    const newMsgs = [...msgs, { role: "user", content: text }];
    setMsgs(newMsgs);
    setLoading(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs, hat, rights }),
      });
      const d = await r.json();
      setMsgs(m => [...m, { role: "assistant", content: d.reply || "שגיאה." }]);
    } catch {
      setMsgs(m => [...m, { role: "assistant", content: "שגיאה בחיבור. נסה שוב." }]);
    }
    setLoading(false);
  }

  const curHat = HATS.find(h => h.id === hat);

  return (
    <div className="chat-outer">
      {/* Privacy banner */}
      {banner && (
        <div className="privacy-banner">
          <span className="prv-icon">🔒</span>
          <span>שיחה זו היא <strong>פרטית לחלוטין</strong> — המידע שתשתף לא נשמר, לא מועבר ולא מזוהה. כל שיחה מאופסת.</span>
          <button className="prv-close" onClick={() => setBanner(false)}>✕</button>
        </div>
      )}

      {/* Hat selector */}
      <div className="hat-row">
        <span className="hat-label">דבר עם:</span>
        {HATS.map(h => (
          <button key={h.id} className={`hat-btn ${hat===h.id?"active":""}`} onClick={() => setHat(h.id)} title={h.desc}>
            <span className="hat-icon">{h.icon}</span>
            <span className="hat-name">{h.label}</span>
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div className="chat-wrap">
        <div className="chat-hdr">
          <div className="chat-ava">{curHat.icon}</div>
          <div>
            <div className="chat-name">{curHat.label} — יועץ מגן</div>
            <div className="chat-sub">{curHat.desc}</div>
          </div>
          <div className="chat-online">● מחובר</div>
        </div>

        <div className="chat-msgs">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" && <div className="msg-ava">{curHat.icon}</div>}
              <div className="bubble">{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="msg assistant">
              <div className="msg-ava">{curHat.icon}</div>
              <div className="bubble typing"><span/><span/><span/></div>
            </div>
          )}
          <div ref={bottom}/>
        </div>

        <div className="chat-inp-row">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key==="Enter" && !e.shiftKey && send()}
            placeholder={`כתוב ל${curHat.label}...`}
            className="chat-inp" disabled={loading}/>
          <button onClick={send} disabled={loading||!input.trim()} className="chat-send">←</button>
        </div>
      </div>

      <p className="chat-disclaimer">⚠️ המידע הוא לצרכי אינפורמציה בלבד ואינו מחליף ייעוץ מקצועי מוסמך.</p>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────

export default function Home({ rights, updates, events }) {
  const [view,      setView]      = useState("rights");
  const [openId,    setOpenId]    = useState(null);
  const [rCat,      setRCat]      = useState("הכל");
  const [rSearch,   setRSearch]   = useState("");
  const [eCity,     setECity]     = useState("הכל");
  const [eCat,      setECat]      = useState("הכל");
  const [eOrg,      setEOrg]      = useState("הכל");
  const [showPast,  setShowPast]  = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // Organizers that actually have events
  const orgCounts = {};
  events.forEach(e => { if (e.organizer) orgCounts[e.organizer] = (orgCounts[e.organizer]||0)+1; });
  const activeOrgs = ORGANIZERS.filter(o => o === "הכל" || orgCounts[o]);

  const filteredRights = rights
    .filter(r => rCat === "הכל" || r.category === rCat)
    .filter(r => !rSearch || r.title.includes(rSearch) || r.summary.includes(rSearch))
    .sort((a,b) => ({high:0,medium:1,low:2}[a.urgency] - {high:0,medium:1,low:2}[b.urgency]));

  const filteredEvents = events
    .filter(e => eCity === "הכל" || e.city === eCity || e.city === "כלל הארץ")
    .filter(e => eCat  === "הכל" || e.category === eCat)
    .filter(e => eOrg  === "הכל" || e.organizer === eOrg)
    .filter(e => showPast ? true : e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date));

  const upcomingCount = events.filter(e => e.date >= today).length;

  const NAV = [
    { id:"rights",  icon:"◫", label:"זכויות" },
    { id:"events",  icon:"◉", label:"אירועים", badge: upcomingCount||null },
    { id:"updates", icon:"◎", label:"עדכונים", badge: updates.length||null },
    { id:"chat",    icon:"◇", label:"יועץ AI" },
  ];

  return (
    <>
      <Head>
        <title>מגן — זכויות פצועי צה״ל</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <meta name="description" content="מרכז זכויות, אירועים ויועץ AI לפצועי צה״ל"/>
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
      </Head>

      <div className="root" dir="rtl">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-main">מגן<span className="logo-en">MAGEN</span></div>
            <div className="logo-sub">זכויות פצועי צה״ל</div>
          </div>

          <nav>
            {NAV.map(n => (
              <button key={n.id} className={`nav-btn ${view===n.id?"active":""}`} onClick={()=>setView(n.id)}>
                <span className="nav-icon">{n.icon}</span>
                <span className="nav-lbl">{n.label}</span>
                {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
              </button>
            ))}
          </nav>

          <div className="sb-footer">
            <a href="tel:*6500" className="hotline">📞 מוקד פצועים <strong>*6500</strong></a>
            <a href="tel:*8944" className="hotline red">🆘 נפש אחת <strong>*8944</strong></a>
            <a href="https://mod.gov.il/" target="_blank" rel="noopener noreferrer" className="hotline">🌐 אגף השיקום</a>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main">

          {/* RIGHTS */}
          {view==="rights" && <>
            <div className="pg-hdr">
              <h1>זכויות והטבות</h1>
              <p>{rights.length} זכויות מרכזיות • מתעדכן אוטומטית</p>
            </div>
            <div className="filters">
              <input value={rSearch} onChange={e=>setRSearch(e.target.value)} placeholder="חיפוש זכות..." className="srch"/>
              <div className="chips">
                {RCATS.map(c=><button key={c} className={`chip ${rCat===c?"on":""}`} onClick={()=>setRCat(c)}>{c}</button>)}
              </div>
            </div>
            <div className="stack">
              {filteredRights.map(r=>(
                <RightCard key={r.id} r={r} open={openId===r.id} onToggle={()=>setOpenId(openId===r.id?null:r.id)}/>
              ))}
              {!filteredRights.length && <div className="empty">לא נמצאו תוצאות</div>}
            </div>
          </>}

          {/* EVENTS */}
          {view==="events" && <>
            <div className="pg-hdr">
              <h1>אירועים וסדנאות</h1>
              <p>{upcomingCount} אירועים קרובים • כל בתי הלוחם</p>
            </div>

            {/* Organizer legend */}
            <div className="org-legend">
              {activeOrgs.map(o => {
                const s = o === "הכל" ? null : ORG_COLORS[o];
                return (
                  <button key={o}
                    className={`org-chip ${eOrg===o?"on":""}`}
                    style={eOrg===o && s ? { color: s.color, borderColor: s.color, background: s.bg } : {}}
                    onClick={()=>setEOrg(o)}>
                    {o !== "הכל" && s && <span className="org-dot" style={{ background: s.color }}/>}
                    {o}
                    {o !== "הכל" && orgCounts[o] ? <span className="org-count">{orgCounts[o]}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="filters">
              <div className="chips">
                {CITIES.map(c=><button key={c} className={`chip ${eCity===c?"on":""}`} onClick={()=>setECity(c)}>{c}</button>)}
              </div>
              <div className="chips" style={{marginTop:6}}>
                {ECATS.map(c=><button key={c} className={`chip ${eCat===c?"on":""}`} onClick={()=>setECat(c)}>{c}</button>)}
              </div>
              <label className="past-toggle">
                <input type="checkbox" checked={showPast} onChange={e=>setShowPast(e.target.checked)}/> הצג אירועים שעברו
              </label>
            </div>

            <div className="ev-grid">
              {filteredEvents.map(e=><EventCard key={e.id} ev={e}/>)}
              {!filteredEvents.length && <div className="empty">אין אירועים קרובים לסינון זה</div>}
            </div>
          </>}

          {/* UPDATES */}
          {view==="updates" && <>
            <div className="pg-hdr">
              <h1>עדכונים שוטפים</h1>
              <p>נסרקים אוטומטית פעמיים ביום</p>
            </div>
            {updates.length===0
              ? <div className="empty-state"><div className="empty-icon">◎</div><p>הסוכן יתחיל לאסוף עדכונים בקרוב.</p></div>
              : <div className="stack">
                  {updates.map((u,i)=>(
                    <div key={i} className={`update-card ${u.urgency||"low"}`}>
                      <div className="upd-top">
                        <span className="badge urg-badge" style={{ color: URGENCY[u.urgency||"low"].color, background: URGENCY[u.urgency||"low"].bg }}>{URGENCY[u.urgency||"low"].label}</span>
                        <span className="upd-date">{u.date}</span>
                      </div>
                      <h3>{u.title}</h3>
                      <p>{u.content}</p>
                      {u.link && <a href={u.link} target="_blank" rel="noopener noreferrer" className="ext-link">קרא עוד →</a>}
                    </div>
                  ))}
                </div>
            }
          </>}

          {/* CHAT */}
          {view==="chat" && <>
            <div className="pg-hdr">
              <h1>יועץ AI אישי</h1>
              <p>עו"ד · עו"ס · פסיכולוג — פרטי, אקטיבי, בשבילך</p>
            </div>
            <Chat rights={rights}/>
          </>}

        </main>
      </div>

      <style jsx global>{`
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
        body { background:#0a0e14; color:#dde3ec; font-family:'Heebo',sans-serif; }

        /* ── Layout ── */
        .root { display:flex; min-height:100vh; }

        /* ── Sidebar ── */
        .sidebar {
          width:230px; flex-shrink:0; background:#10151c; border-left:1px solid #1e2530;
          display:flex; flex-direction:column; padding:28px 14px;
          position:sticky; top:0; height:100vh; overflow-y:auto;
        }
        .logo { margin-bottom:28px; }
        .logo-main { font-size:28px; font-weight:900; color:#e05252; letter-spacing:-1px; line-height:1; }
        .logo-en { font-size:10px; font-weight:700; color:#e0525250; letter-spacing:4px; margin-right:8px; vertical-align:middle; }
        .logo-sub { font-size:10px; color:#3a4255; margin-top:5px; letter-spacing:.5px; }
        nav { display:flex; flex-direction:column; gap:3px; flex:1; }
        .nav-btn {
          display:flex; align-items:center; gap:9px; padding:10px 12px; border-radius:9px;
          border:none; background:transparent; color:#5a6478; font-family:'Heebo',sans-serif;
          font-size:14px; cursor:pointer; text-align:right; transition:.15s;
        }
        .nav-btn:hover { background:#1a2030; color:#c8d0de; }
        .nav-btn.active { background:#1a2030; color:#e05252; font-weight:700; }
        .nav-icon { font-size:14px; }
        .nav-lbl { flex:1; }
        .nav-badge { background:#e05252; color:#fff; font-size:10px; font-weight:700; padding:1px 6px; border-radius:20px; }
        .sb-footer { border-top:1px solid #1e2530; padding-top:12px; display:flex; flex-direction:column; gap:5px; }
        .hotline { font-size:12px; padding:8px 10px; border-radius:7px; background:#1a2030; color:#5a6478; text-decoration:none; display:block; transition:.15s; }
        .hotline:hover { color:#c8d0de; }
        .hotline.red { color:#e05252; }

        /* ── Main ── */
        .main { flex:1; padding:36px 44px; max-width:900px; overflow-y:auto; }
        .pg-hdr { margin-bottom:22px; }
        .pg-hdr h1 { font-size:26px; font-weight:900; letter-spacing:-.5px; }
        .pg-hdr p { font-size:13px; color:#5a6478; margin-top:5px; }

        /* ── Filters ── */
        .filters { margin-bottom:20px; }
        .srch {
          width:100%; max-width:320px; padding:9px 14px; background:#10151c;
          border:1px solid #1e2530; border-radius:8px; color:#dde3ec;
          font-family:'Heebo',sans-serif; font-size:14px; direction:rtl; outline:none; margin-bottom:10px;
        }
        .srch:focus { border-color:#e05252; }
        .srch::placeholder { color:#3a4255; }
        .chips { display:flex; flex-wrap:wrap; gap:6px; }
        .chip {
          padding:5px 13px; border-radius:20px; border:1px solid #1e2530;
          background:transparent; color:#5a6478; font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; transition:.15s;
        }
        .chip:hover { border-color:#e05252; color:#c8d0de; }
        .chip.on { background:rgba(224,82,82,.12); border-color:#e05252; color:#e05252; font-weight:700; }
        .past-toggle { font-size:12px; color:#5a6478; margin-top:10px; display:flex; align-items:center; gap:6px; cursor:pointer; }

        /* ── Organizer legend ── */
        .org-legend { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:14px; }
        .org-chip {
          display:flex; align-items:center; gap:6px; padding:6px 13px; border-radius:20px;
          border:1px solid #1e2530; background:transparent; color:#5a6478;
          font-family:'Heebo',sans-serif; font-size:12px; cursor:pointer; transition:.15s;
        }
        .org-chip:hover { border-color:#2a3040; color:#c8d0de; }
        .org-chip.on { font-weight:700; }
        .org-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .org-count { background:#1e2530; color:#5a6478; font-size:10px; padding:1px 6px; border-radius:10px; }

        /* ── Badges ── */
        .badge { font-size:11px; font-weight:700; padding:3px 8px; border-radius:5px; white-space:nowrap; }
        .cat-badge { background:#1a2030; color:#5a6478; }
        .urg-badge { }
        .free-badge { background:rgba(63,185,122,.15); color:#3fb97a; }
        .soon-badge { background:rgba(224,82,82,.15); color:#e05252; animation:pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.7} }
        .org-badge { }
        .ext-link { display:inline-block; margin-top:10px; font-size:13px; color:#4a8fdd; text-decoration:none; font-weight:600; }
        .ext-link:hover { text-decoration:underline; }

        /* ── Rights cards ── */
        .stack { display:flex; flex-direction:column; gap:10px; }
        .card {
          background:#10151c; border:1px solid #1e2530; border-radius:12px;
          padding:18px 22px; cursor:pointer; transition:.2s; position:relative;
        }
        .card:hover { border-color:#2a3040; }
        .card.open { border-color:rgba(224,82,82,.3); }
        .card-row { display:flex; gap:8px; margin-bottom:9px; flex-wrap:wrap; }
        .card-h { font-size:16px; font-weight:800; margin-bottom:5px; line-height:1.4; }
        .card-sub { font-size:13.5px; color:#5a6478; line-height:1.6; }
        .card-body { margin-top:14px; padding-top:14px; border-top:1px solid #1e2530; font-size:14px; color:#b0bbc8; line-height:1.75; }
        .tip-box { margin-top:12px; background:#1a2030; border:1px solid #2a3040; border-radius:8px; padding:11px 14px; font-size:13px; line-height:1.6; }
        .chev { position:absolute; left:20px; top:22px; font-size:9px; color:#3a4255; }
        .card.open .chev { top:20px; }

        /* ── Event cards ── */
        .ev-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
        .ev-card { background:#10151c; border:1px solid #1e2530; border-radius:12px; padding:18px 20px; transition:.2s; }
        .ev-card:hover { border-color:#2a3040; }
        .ev-top { display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap; }
        .ev-h { font-size:15px; font-weight:800; margin-bottom:8px; line-height:1.4; }
        .ev-meta { font-size:12.5px; color:#5a6478; margin-bottom:10px; display:flex; flex-direction:column; gap:4px; }
        .ev-desc { font-size:13.5px; color:#8a96a8; line-height:1.65; }
        .ev-foot { margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
        .ev-reg { font-size:12px; color:#5a6478; }

        /* ── Updates ── */
        .update-card { background:#10151c; border:1px solid #1e2530; border-radius:12px; padding:18px 22px; }
        .upd-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:9px; }
        .upd-date { font-size:11px; color:#3a4255; font-weight:600; }
        .update-card h3 { font-size:15.5px; font-weight:800; margin-bottom:7px; }
        .update-card p { font-size:13.5px; color:#8a96a8; line-height:1.7; }
        .update-card.high { border-right:3px solid #e05252; }
        .update-card.medium { border-right:3px solid #d4a017; }

        /* ── Empty ── */
        .empty { color:#3a4255; padding:40px; text-align:center; font-size:14px; }
        .empty-state { text-align:center; padding:80px 20px; color:#3a4255; }
        .empty-icon { font-size:48px; opacity:.25; margin-bottom:14px; }

        /* ── Chat outer ── */
        .chat-outer { display:flex; flex-direction:column; gap:14px; }

        /* Privacy banner */
        .privacy-banner {
          display:flex; align-items:center; gap:12px;
          background:rgba(74,143,221,.1); border:1px solid rgba(74,143,221,.25);
          border-radius:10px; padding:12px 16px; font-size:13px; color:#8ab4e8; line-height:1.5;
        }
        .prv-icon { font-size:18px; flex-shrink:0; }
        .prv-close { margin-right:auto; background:transparent; border:none; color:#5a6478; cursor:pointer; font-size:16px; padding:2px 6px; }
        .prv-close:hover { color:#c8d0de; }

        /* Hat selector */
        .hat-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .hat-label { font-size:13px; color:#5a6478; font-weight:600; }
        .hat-btn {
          display:flex; align-items:center; gap:7px; padding:9px 16px; border-radius:10px;
          border:1px solid #1e2530; background:#10151c; color:#5a6478;
          font-family:'Heebo',sans-serif; font-size:14px; cursor:pointer; transition:.2s;
        }
        .hat-btn:hover { border-color:#2a3040; color:#c8d0de; background:#13191f; }
        .hat-btn.active { border-color:#e05252; background:rgba(224,82,82,.1); color:#e05252; font-weight:700; }
        .hat-icon { font-size:18px; }
        .hat-name { font-weight:600; }

        /* Chat window */
        .chat-wrap {
          background:#10151c; border:1px solid #1e2530; border-radius:16px; overflow:hidden;
          display:flex; flex-direction:column; height:calc(100vh - 340px); max-height:560px;
        }
        .chat-hdr { display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid #1e2530; }
        .chat-ava { width:38px; height:38px; background:rgba(224,82,82,.1); border:1px solid rgba(224,82,82,.25); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0; }
        .chat-name { font-size:14px; font-weight:700; }
        .chat-sub { font-size:11.5px; color:#5a6478; margin-top:1px; }
        .chat-online { margin-right:auto; font-size:11px; color:#3fb97a; }
        .chat-msgs { flex:1; overflow-y:auto; padding:16px 18px; display:flex; flex-direction:column; gap:12px; }
        .msg { display:flex; gap:8px; align-items:flex-end; }
        .msg.user { flex-direction:row-reverse; }
        .msg-ava { width:28px; height:28px; background:#1a2030; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
        .bubble { max-width:76%; padding:10px 14px; border-radius:16px; font-size:14px; line-height:1.75; white-space:pre-wrap; }
        .msg.user .bubble { background:#1a2030; color:#dde3ec; border-bottom-right-radius:4px; }
        .msg.assistant .bubble { background:#161c26; border:1px solid #1e2530; color:#b0bbc8; border-bottom-left-radius:4px; }
        .typing { display:flex !important; gap:5px; align-items:center; padding:14px 18px !important; }
        .typing span { width:7px; height:7px; background:#5a6478; border-radius:50%; animation:bop 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay:.2s; }
        .typing span:nth-child(3) { animation-delay:.4s; }
        @keyframes bop { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        .chat-inp-row { display:flex; gap:8px; padding:12px 16px; border-top:1px solid #1e2530; }
        .chat-inp { flex:1; padding:9px 14px; background:#0a0e14; border:1px solid #1e2530; border-radius:8px; color:#dde3ec; font-family:'Heebo',sans-serif; font-size:14px; direction:rtl; outline:none; }
        .chat-inp:focus { border-color:#e05252; }
        .chat-inp::placeholder { color:#3a4255; }
        .chat-send { width:40px; height:40px; background:#e05252; border:none; border-radius:8px; color:#fff; font-size:17px; cursor:pointer; transition:.15s; }
        .chat-send:hover:not(:disabled) { background:#c84040; }
        .chat-send:disabled { background:#1e2530; cursor:not-allowed; }
        .chat-disclaimer { font-size:11.5px; color:#3a4255; text-align:center; }

        /* ── Mobile ── */
        @media (max-width:760px) {
          .root { flex-direction:column; }
          .sidebar { width:100%; height:auto; position:static; flex-direction:row; flex-wrap:wrap; padding:10px 12px; gap:6px; border-left:none; border-bottom:1px solid #1e2530; }
          .logo { margin-bottom:0; }
          nav { flex-direction:row; flex:none; }
          .nav-btn { padding:6px 8px; font-size:12px; }
          .sb-footer { flex-direction:row; border-top:none; padding-top:0; }
          .main { padding:16px; }
          .ev-grid { grid-template-columns:1fr; }
          .chat-wrap { height:60vh; }
        }
      `}</style>
    </>
  );
}

export async function getStaticProps() {
  const fs   = require("fs");
  const path = require("path");
  const read = f => JSON.parse(fs.readFileSync(path.join(process.cwd(),"data",f),"utf-8"));
  return {
    props: { rights:read("rights.json"), updates:read("updates.json"), events:read("events.json") },
    revalidate: 1800,
  };
}

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
  high:   { label: "חשוב לממש", color: "#e8734a", bg: "rgba(232,115,74,.12)" },
  medium: { label: "שווה לבדוק", color: "#f4a24e", bg: "rgba(244,162,78,.1)" },
  low:    { label: "לתשומת לב",  color: "#4ecb8a", bg: "rgba(78,203,138,.1)"  },
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
      lawyer:  "שלום, אני כאן בכובע עורך הדין שלך ⚖️\n\nלא צריך להבין בחוק — בשביל זה אני כאן. אני אעזור לך להבין מה מגיע לך, ואם צריך להגיש פנייה לאגף השיקום — אני אכתוב לך את הנוסח המוכן שתעתיק ותדביק באתר.\n\nספר לי: כמה אחוזי נכות הוכרו לך, ומה הביא אותך לכאן?",
      social:  "שלום, אני כאן בתפקיד העו\"ס שלך 🤝\n\nאני יודע שהבירוקרטיה מתישה. לא צריך להתמודד עם זה לבד — אני אלווה אותך צעד אחרי צעד. צריך להגיש פנייה באתר? אני אכתוב לך בדיוק מה להדביק בטופס.\n\nספר לי: מה הכי לוחץ עליך עכשיו?",
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
        body { background:#0c1018; color:#e8e4dc; font-family:'Heebo',sans-serif; letter-spacing:.2px; }
        ::selection { background:rgba(244,162,78,.3); color:#fff; }

        /* ── Layout ── */
        .root { display:flex; min-height:100vh; }

        /* ── Sidebar ── */
        .sidebar {
          width:240px; flex-shrink:0; background:#111820; border-left:1px solid #1e2835;
          display:flex; flex-direction:column; padding:32px 16px;
          position:sticky; top:0; height:100vh; overflow-y:auto;
        }
        .logo { margin-bottom:32px; }
        .logo-main { font-size:30px; font-weight:900; color:#e8734a; letter-spacing:-1px; line-height:1; }
        .logo-en { font-size:10px; font-weight:700; color:rgba(232,115,74,.35); letter-spacing:4px; margin-right:8px; vertical-align:middle; }
        .logo-sub { font-size:10.5px; color:#556070; margin-top:6px; letter-spacing:.5px; }
        nav { display:flex; flex-direction:column; gap:4px; flex:1; }
        .nav-btn {
          display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:10px;
          border:none; background:transparent; color:#6b7a8d; font-family:'Heebo',sans-serif;
          font-size:14px; cursor:pointer; text-align:right; transition:all .2s ease;
        }
        .nav-btn:hover { background:rgba(244,162,78,.08); color:#c8d0de; transform:translateX(-2px); }
        .nav-btn.active { background:rgba(244,162,78,.12); color:#f4a24e; font-weight:700; }
        .nav-icon { font-size:15px; opacity:.7; }
        .nav-btn.active .nav-icon { opacity:1; }
        .nav-lbl { flex:1; }
        .nav-badge { background:linear-gradient(135deg,#e8734a,#f4a24e); color:#fff; font-size:10px; font-weight:700; padding:2px 7px; border-radius:20px; }
        .sb-footer { border-top:1px solid #1e2835; padding-top:14px; display:flex; flex-direction:column; gap:6px; }
        .hotline {
          font-size:12px; padding:10px 12px; border-radius:8px; background:#161e28;
          color:#6b7a8d; text-decoration:none; display:block; transition:all .2s ease;
        }
        .hotline:hover { color:#e8e4dc; background:#1a2430; transform:translateX(-2px); }
        .hotline.red { color:#e8734a; }

        /* ── Main ── */
        .main { flex:1; padding:40px 48px; max-width:920px; overflow-y:auto; }
        .pg-hdr { margin-bottom:28px; }
        .pg-hdr h1 { font-size:28px; font-weight:900; letter-spacing:-.5px; color:#f0ece4; }
        .pg-hdr p { font-size:13.5px; color:#6b7a8d; margin-top:6px; line-height:1.6; }

        /* ── Filters ── */
        .filters { margin-bottom:24px; }
        .srch {
          width:100%; max-width:340px; padding:11px 16px; background:#141c26;
          border:1px solid #1e2835; border-radius:10px; color:#e8e4dc;
          font-family:'Heebo',sans-serif; font-size:14px; direction:rtl; outline:none;
          margin-bottom:12px; transition:all .25s ease;
        }
        .srch:focus { border-color:#f4a24e; box-shadow:0 0 0 3px rgba(244,162,78,.12); }
        .srch::placeholder { color:#455060; }
        .chips { display:flex; flex-wrap:wrap; gap:7px; }
        .chip {
          padding:6px 14px; border-radius:20px; border:1px solid #1e2835;
          background:transparent; color:#6b7a8d; font-family:'Heebo',sans-serif;
          font-size:12.5px; cursor:pointer; transition:all .2s ease;
        }
        .chip:hover { border-color:rgba(244,162,78,.4); color:#c8d0de; background:rgba(244,162,78,.05); }
        .chip.on { background:rgba(244,162,78,.12); border-color:#f4a24e; color:#f4a24e; font-weight:700; }
        .past-toggle { font-size:12.5px; color:#6b7a8d; margin-top:12px; display:flex; align-items:center; gap:7px; cursor:pointer; }

        /* ── Organizer legend ── */
        .org-legend { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
        .org-chip {
          display:flex; align-items:center; gap:7px; padding:7px 14px; border-radius:20px;
          border:1px solid #1e2835; background:transparent; color:#6b7a8d;
          font-family:'Heebo',sans-serif; font-size:12.5px; cursor:pointer; transition:all .2s ease;
        }
        .org-chip:hover { border-color:#2a3545; color:#c8d0de; }
        .org-chip.on { font-weight:700; }
        .org-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .org-count { background:#1e2835; color:#6b7a8d; font-size:10px; padding:2px 7px; border-radius:10px; }

        /* ── Badges ── */
        .badge { font-size:11px; font-weight:700; padding:4px 10px; border-radius:6px; white-space:nowrap; }
        .cat-badge { background:#1a2230; color:#6b7a8d; }
        .urg-badge { }
        .free-badge { background:rgba(63,185,122,.12); color:#4ecb8a; }
        .soon-badge { background:rgba(244,162,78,.12); color:#f4a24e; animation:pulse 2.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.65} }
        .org-badge { }
        .ext-link { display:inline-block; margin-top:12px; font-size:13px; color:#5a9ee6; text-decoration:none; font-weight:600; transition:all .2s ease; }
        .ext-link:hover { color:#f4a24e; }

        /* ── Rights cards ── */
        .stack { display:flex; flex-direction:column; gap:12px; }
        .card {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:22px 26px; cursor:pointer; transition:all .25s ease; position:relative;
        }
        .card:hover { border-color:rgba(244,162,78,.25); transform:translateY(-1px); box-shadow:0 4px 20px rgba(0,0,0,.2); }
        .card.open { border-color:rgba(244,162,78,.35); background:#161e2a; }
        .card-row { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
        .card-h { font-size:16.5px; font-weight:700; margin-bottom:6px; line-height:1.5; color:#f0ece4; }
        .card-sub { font-size:13.5px; color:#7a8a9d; line-height:1.7; }
        .card-body { margin-top:16px; padding-top:16px; border-top:1px solid #1e2835; font-size:14px; color:#b5c0cc; line-height:1.8; }
        .tip-box {
          margin-top:14px; background:rgba(244,162,78,.06); border:1px solid rgba(244,162,78,.15);
          border-radius:10px; padding:14px 16px; font-size:13.5px; line-height:1.7; color:#d4b896;
        }
        .chev { position:absolute; left:22px; top:24px; font-size:9px; color:#455060; transition:transform .25s ease; }
        .card.open .chev { transform:rotate(180deg); }

        /* ── Event cards ── */
        .ev-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
        .ev-card {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:22px 24px; transition:all .25s ease;
        }
        .ev-card:hover { border-color:rgba(244,162,78,.25); transform:translateY(-2px); box-shadow:0 6px 24px rgba(0,0,0,.2); }
        .ev-top { display:flex; gap:7px; margin-bottom:12px; flex-wrap:wrap; }
        .ev-h { font-size:15.5px; font-weight:700; margin-bottom:8px; line-height:1.5; color:#f0ece4; }
        .ev-meta { font-size:12.5px; color:#6b7a8d; margin-bottom:12px; display:flex; flex-direction:column; gap:5px; }
        .ev-desc { font-size:13.5px; color:#8a9aad; line-height:1.7; }
        .ev-foot { margin-top:14px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
        .ev-reg { font-size:12.5px; color:#6b7a8d; }

        /* ── Updates ── */
        .update-card {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:22px 26px; transition:all .25s ease;
        }
        .update-card:hover { border-color:#2a3545; transform:translateY(-1px); }
        .upd-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .upd-date { font-size:11.5px; color:#556070; font-weight:600; }
        .update-card h3 { font-size:16px; font-weight:700; margin-bottom:8px; color:#f0ece4; }
        .update-card p { font-size:13.5px; color:#8a9aad; line-height:1.75; }
        .update-card.high { border-right:3px solid #e8734a; }
        .update-card.medium { border-right:3px solid #f4a24e; }

        /* ── Empty ── */
        .empty { color:#556070; padding:48px; text-align:center; font-size:14.5px; line-height:1.6; }
        .empty-state { text-align:center; padding:80px 20px; color:#556070; }
        .empty-icon { font-size:48px; opacity:.2; margin-bottom:16px; }

        /* ── Chat outer ── */
        .chat-outer { display:flex; flex-direction:column; gap:16px; }

        /* Privacy banner */
        .privacy-banner {
          display:flex; align-items:center; gap:14px;
          background:rgba(78,203,138,.08); border:1px solid rgba(78,203,138,.2);
          border-radius:12px; padding:14px 18px; font-size:13.5px; color:#7cc4a0; line-height:1.6;
        }
        .prv-icon { font-size:18px; flex-shrink:0; }
        .prv-close { margin-right:auto; background:transparent; border:none; color:#6b7a8d; cursor:pointer; font-size:16px; padding:2px 6px; transition:.2s; }
        .prv-close:hover { color:#e8e4dc; }

        /* Hat selector */
        .hat-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .hat-label { font-size:13.5px; color:#6b7a8d; font-weight:600; }
        .hat-btn {
          display:flex; align-items:center; gap:8px; padding:10px 18px; border-radius:12px;
          border:1px solid #1e2835; background:#141c26; color:#6b7a8d;
          font-family:'Heebo',sans-serif; font-size:14px; cursor:pointer; transition:all .25s ease;
        }
        .hat-btn:hover { border-color:rgba(244,162,78,.3); color:#c8d0de; background:#181f2a; transform:translateY(-1px); }
        .hat-btn.active { border-color:#f4a24e; background:rgba(244,162,78,.1); color:#f4a24e; font-weight:700; box-shadow:0 2px 12px rgba(244,162,78,.15); }
        .hat-icon { font-size:18px; }
        .hat-name { font-weight:600; }

        /* Chat window */
        .chat-wrap {
          background:#141c26; border:1px solid #1e2835; border-radius:18px; overflow:hidden;
          display:flex; flex-direction:column; height:calc(100vh - 340px); max-height:580px;
        }
        .chat-hdr { display:flex; align-items:center; gap:14px; padding:16px 20px; border-bottom:1px solid #1e2835; }
        .chat-ava {
          width:40px; height:40px; background:rgba(244,162,78,.1); border:1px solid rgba(244,162,78,.2);
          border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;
        }
        .chat-name { font-size:14.5px; font-weight:700; color:#f0ece4; }
        .chat-sub { font-size:11.5px; color:#6b7a8d; margin-top:2px; }
        .chat-online { margin-right:auto; font-size:11px; color:#4ecb8a; }
        .chat-msgs { flex:1; overflow-y:auto; padding:18px 20px; display:flex; flex-direction:column; gap:14px; }
        .msg { display:flex; gap:10px; align-items:flex-end; animation:msgIn .3s ease; }
        .msg.user { flex-direction:row-reverse; }
        @keyframes msgIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg-ava { width:30px; height:30px; background:#1a2430; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
        .bubble { max-width:76%; padding:12px 16px; border-radius:18px; font-size:14px; line-height:1.8; white-space:pre-wrap; }
        .msg.user .bubble { background:rgba(244,162,78,.12); color:#e8e4dc; border-bottom-right-radius:4px; }
        .msg.assistant .bubble { background:#1a2230; border:1px solid #1e2835; color:#b5c0cc; border-bottom-left-radius:4px; }
        .typing { display:flex !important; gap:6px; align-items:center; padding:16px 20px !important; }
        .typing span { width:7px; height:7px; background:#f4a24e; border-radius:50%; animation:bop 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay:.2s; }
        .typing span:nth-child(3) { animation-delay:.4s; }
        @keyframes bop { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        .chat-inp-row { display:flex; gap:10px; padding:14px 18px; border-top:1px solid #1e2835; }
        .chat-inp {
          flex:1; padding:11px 16px; background:#0c1018; border:1px solid #1e2835; border-radius:10px;
          color:#e8e4dc; font-family:'Heebo',sans-serif; font-size:14px; direction:rtl; outline:none;
          transition:all .25s ease;
        }
        .chat-inp:focus { border-color:#f4a24e; box-shadow:0 0 0 3px rgba(244,162,78,.1); }
        .chat-inp::placeholder { color:#455060; }
        .chat-send {
          width:42px; height:42px; background:linear-gradient(135deg,#e8734a,#f4a24e);
          border:none; border-radius:10px; color:#fff; font-size:17px; cursor:pointer;
          transition:all .2s ease;
        }
        .chat-send:hover:not(:disabled) { transform:scale(1.05); box-shadow:0 4px 16px rgba(244,162,78,.3); }
        .chat-send:disabled { background:#1e2835; cursor:not-allowed; transform:none; box-shadow:none; }
        .chat-disclaimer { font-size:11.5px; color:#455060; text-align:center; }

        /* ── Mobile ── */
        @media (max-width:760px) {
          .root { flex-direction:column; }
          .sidebar {
            width:100%; height:auto; position:static; flex-direction:row;
            flex-wrap:wrap; padding:12px 14px; gap:6px; border-left:none;
            border-bottom:1px solid #1e2835;
          }
          .logo { margin-bottom:0; }
          nav { flex-direction:row; flex:none; }
          .nav-btn { padding:8px 10px; font-size:12.5px; }
          .nav-btn:hover { transform:none; }
          .sb-footer { flex-direction:row; border-top:none; padding-top:0; }
          .main { padding:20px 16px; }
          .pg-hdr h1 { font-size:24px; }
          .ev-grid { grid-template-columns:1fr; }
          .chat-wrap { height:60vh; }
          .card:hover,.ev-card:hover,.update-card:hover { transform:none; }
          .hotline:hover { transform:none; }
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

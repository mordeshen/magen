import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import Head from "next/head";
import { useUser } from "../lib/UserContext";

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

const INTEREST_OPTIONS = ["תרבות","ספורט","אמנות","טיולים","העצמה","לימודים","מוזיקה","יצירה"];
const PROFILE_CITIES = ["תל אביב","ירושלים","חיפה","באר שבע","אחר"];
const CLAIM_STAGES = ["טרם הגשתי תביעה","הגשתי תביעה — ממתין","הכרה עקרונית (03)","ממתין לוועדה רפואית","בערעור"];

// ─── Bookmarklet generator — fills textarea on shikum portal ──

function generateBookmarklet(text) {
  const code = `(function(){try{if(!location.hostname.includes('myshikum.mod.gov.il')){alert('\\u05D9\\u05E9 \\u05DC\\u05E4\\u05EA\\u05D5\\u05D7 \\u05D0\\u05EA \\u05D0\\u05EA\\u05E8 \\u05D0\\u05D2\\u05E3 \\u05D4\\u05E9\\u05D9\\u05E7\\u05D5\\u05DD \\u05E7\\u05D5\\u05D3\\u05DD');return;}var t=document.querySelectorAll('textarea');if(t.length>0){t[0].value=${JSON.stringify(text)};t[0].dispatchEvent(new Event('input',{bubbles:true}));t[0].dispatchEvent(new Event('change',{bubbles:true}));alert('\\u05D4\\u05D8\\u05D5\\u05E4\\u05E1 \\u05DE\\u05D5\\u05DC\\u05D0! \\u05D1\\u05D3\\u05D5\\u05E7 \\u05E9\\u05D4\\u05DB\\u05DC \\u05E0\\u05DB\\u05D5\\u05DF \\u05D5\\u05DC\\u05D7\\u05E5 \\u05E9\\u05DC\\u05D7.');}else{alert('\\u05DC\\u05D0 \\u05DE\\u05E6\\u05D0\\u05EA\\u05D9 \\u05E9\\u05D3\\u05D4 \\u05D8\\u05E7\\u05E1\\u05D8. \\u05D5\\u05D3\\u05D0 \\u05E9\\u05D0\\u05EA\\u05D4 \\u05D1\\u05D3\\u05E3 \\u05D4\\u05E0\\u05DB\\u05D5\\u05DF.')}}catch(e){alert('\\u05E9\\u05D2\\u05D9\\u05D0\\u05D4: '+e.message)}})()`;
  return 'javascript:' + encodeURIComponent(code);
}

// ─── ChatBubbleContent — renders message with copyable נוסח + bookmarklet blocks ──

function ChatBubbleContent({ text }) {
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  if (!text || typeof text !== "string") return text || null;

  // Strip bookmarklet blocks first, collect them
  const bookmarkletBlocks = [];
  const textWithoutBookmarklets = text.replace(/---bookmarklet---([\s\S]*?)---סוף bookmarklet---/g, (_, json) => {
    try {
      const parsed = JSON.parse(json.trim());
      bookmarkletBlocks.push(parsed);
    } catch {}
    return '';
  });

  // Split on ---נוסח--- ... ---סוף נוסח---
  const parts = textWithoutBookmarklets.split(/(---נוסח---[\s\S]*?---סוף נוסח---)/g);
  const hasBlocks = parts.length > 1 || bookmarkletBlocks.length > 0;
  if (!hasBlocks) return text;

  // Track which bookmarklet to show after each nusach
  let bookmarkletIdx = 0;

  return parts.map((part, i) => {
    const match = part.match(/---נוסח---([\s\S]*?)---סוף נוסח---/);
    if (!match) {
      const trimmed = part.trim();
      return trimmed ? <span key={i}>{part}</span> : null;
    }
    const nusach = match[1].trim();
    const bm = bookmarkletBlocks[bookmarkletIdx] || null;
    bookmarkletIdx++;
    const bookmarkletUrl = bm ? generateBookmarklet(bm.text || nusach) : null;
    return (
      <Fragment key={i}>
        <div className="nusach-block">
          <div className="nusach-text">{nusach}</div>
          <button
            className={`nusach-copy ${copiedIdx === i ? "copied" : ""}`}
            onClick={() => {
              navigator.clipboard.writeText(nusach);
              setCopiedIdx(i);
              setTimeout(() => setCopiedIdx(null), 2000);
            }}
          >
            {copiedIdx === i ? "הועתק ✓" : "העתק נוסח 📋"}
          </button>
        </div>
        {bm && bookmarkletUrl && (
          <div className="bookmarklet-block">
            <div className="bookmarklet-header">🪄 מילוי אוטומטי</div>
            <p className="bookmarklet-desc">גרור את הכפתור לסרגל הסימניות, או לחץ עליו כשאתה בדף הנכון:</p>
            <a href={bookmarkletUrl} className="bookmarklet-btn"
               onClick={e => { e.preventDefault(); setShowInstructions(true); }}>
              📋 מלא טופס — {bm.label}
            </a>
            {showInstructions && (
              <div className="bookmarklet-steps">
                <strong>שלבים:</strong>
                <ol>
                  <li>היכנס ל-<a href="https://myshikum.mod.gov.il" target="_blank" rel="noopener noreferrer">myshikum.mod.gov.il</a> והתחבר</li>
                  <li>נווט: {bm.portalPath}</li>
                  <li>גרור את הכפתור הכתום לסרגל הסימניות</li>
                  <li>לחץ על הסימנייה — הטופס יתמלא!</li>
                  <li>בדוק שהכל נכון ← לחץ &quot;שלח&quot;</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </Fragment>
    );
  });
}

// ─── RightCard ─────────────────────────────────────────────

function RightCard({ r, open, onToggle }) {
  const u = URGENCY[r.urgency];
  const { user, userRights, updateRightStatus } = useUser();

  const rightStatus = userRights[r.id] || "not_started";

  function handleStatus(e, status) {
    e.stopPropagation();
    updateRightStatus(r.id, status);
  }

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
          {user && (
            <div className="right-status" onClick={e => e.stopPropagation()}>
              <span className="right-status-label">מצב מימוש:</span>
              <button className={`status-btn ${rightStatus==="not_started"?"active":""}`} onClick={e => handleStatus(e,"not_started")}>לא התחלתי</button>
              <button className={`status-btn in-prog ${rightStatus==="in_progress"?"active":""}`} onClick={e => handleStatus(e,"in_progress")}>בתהליך</button>
              <button className={`status-btn done ${rightStatus==="completed"?"active":""}`} onClick={e => handleStatus(e,"completed")}>מומשה ✓</button>
            </div>
          )}
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
        {ev.link && !/^https?:\/\/[^/]+\/?$/.test(ev.link) && <a href={ev.link} target="_blank" rel="noopener noreferrer" className="ext-link">פרטים ←</a>}
      </div>
    </div>
  );
}

// ─── SidebarProfile ───────────────────────────────────────

function SidebarProfile({ rights, onShowUnstarted, mini, onFeedback, onTerms }) {
  const { user, profile, userRights, loading, signInWithGoogle, signOut, toggleProfilePanel } = useUser();
  const [popupOpen, setPopupOpen] = useState(false);
  const popupRef = useRef(null);

  const totalRights = rights.length;
  const completedRights = Object.values(userRights).filter(s => s === "completed").length;
  const notStarted = totalRights - Object.keys(userRights).length;
  const progressPct = totalRights > 0 ? Math.round((completedRights / totalRights) * 100) : 0;

  // Close popup on outside click
  useEffect(() => {
    if (!popupOpen) return;
    function handleClick(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) setPopupOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popupOpen]);

  const inProgressCount = Object.values(userRights).filter(s => s === "in_progress").length;

  // ── Mini mode (desktop sidebar) ──
  if (mini) {
    if (!user) {
      return (
        <div className="sb-avatar-wrap">
          <button className="sb-mini-avatar anon" onClick={signInWithGoogle} disabled={loading} title="התחבר">
            <span>👤</span>
          </button>
        </div>
      );
    }

    const displayName = profile?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "משתמש";
    const avatar = profile?.avatar_url || user.user_metadata?.avatar_url;

    return (
      <div className="sb-avatar-wrap" ref={popupRef}>
        <button className="sb-mini-avatar" onMouseEnter={() => setPopupOpen(true)} onClick={() => setPopupOpen(!popupOpen)}>
          {avatar ? <img src={avatar} alt="" /> : <span>{displayName[0]}</span>}
        </button>
        {popupOpen && (
          <div className="sb-popup" onMouseLeave={() => setPopupOpen(false)}>
            <div className="sb-popup-header">
              <div className="profile-avatar">
                {avatar ? <img src={avatar} alt="" /> : <span>{displayName[0]}</span>}
              </div>
              <div>
                <div className="profile-name">{displayName}</div>
                {profile?.city && <div className="sb-popup-detail">📍 {profile.city}</div>}
              </div>
            </div>

            {profile?.claim_status === "before_recognition" && profile?.claim_stage && (
              <div className="sb-popup-status">📋 {profile.claim_stage}</div>
            )}
            {profile?.claim_status === "after_recognition" && profile?.disability_percent != null && (
              <div className="sb-popup-status">אחוזי נכות: {profile.disability_percent}%</div>
            )}

            <div className="sb-popup-stats">
              <div className="sb-popup-stat">
                <span className="sb-popup-stat-num done">{completedRights}</span>
                <span className="sb-popup-stat-label">מומשו</span>
              </div>
              <div className="sb-popup-stat">
                <span className="sb-popup-stat-num prog">{inProgressCount}</span>
                <span className="sb-popup-stat-label">בתהליך</span>
              </div>
              <div className="sb-popup-stat">
                <span className="sb-popup-stat-num">{notStarted}</span>
                <span className="sb-popup-stat-label">לא התחילו</span>
              </div>
            </div>

            <div className="progress-section">
              <div className="progress-label">מימוש זכויות: {completedRights}/{totalRights}</div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}/></div>
            </div>
            {notStarted > 0 && <button className="nudge nudge-btn" onClick={() => { setPopupOpen(false); onShowUnstarted(); }}>{notStarted} זכויות שטרם בדקת →</button>}
            <div className="sb-popup-links">
              <button className="sb-popup-link" onClick={toggleProfilePanel}>⚙ הגדרות פרופיל</button>
              <a href="https://shikum.mod.gov.il" target="_blank" rel="noopener noreferrer" className="sb-popup-link">🏢 האזור האישי שלי</a>
              <a href="https://mod.gov.il/" target="_blank" rel="noopener noreferrer" className="sb-popup-link">🌐 אגף השיקום</a>
              <button className="sb-popup-link" onClick={() => { setPopupOpen(false); onTerms(); }}>📋 תנאי שימוש</button>
            </div>
            <button className="signout-link" onClick={signOut}>התנתק</button>
          </div>
        )}
      </div>
    );
  }

  // ── Full mode (mobile menu) ──
  if (!user) {
    return (
      <div className="sb-profile-zone">
        <button className="auth-btn google" onClick={signInWithGoogle} disabled={loading}>
          <span>G</span> התחבר עם Google
        </button>
      </div>
    );
  }

  const displayName = profile?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "משתמש";
  const avatar = profile?.avatar_url || user.user_metadata?.avatar_url;

  return (
    <div className="sb-profile-zone">
      <div className="profile-header">
        <div className="profile-avatar">
          {avatar ? <img src={avatar} alt="" /> : <span>{displayName[0]}</span>}
        </div>
        <div className="profile-name">{displayName}</div>
        <button className="profile-settings-btn" onClick={toggleProfilePanel} title="הגדרות">⚙</button>
      </div>
      <div className="progress-section">
        <div className="progress-label">מימוש זכויות: {completedRights}/{totalRights}</div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}/></div>
      </div>
      {notStarted > 0 && <button className="nudge nudge-btn" onClick={onShowUnstarted}>{notStarted} זכויות שטרם בדקת →</button>}
      <button className="signout-link" onClick={signOut}>התנתק</button>
    </div>
  );
}

// ─── ProfileSettingsPanel ─────────────────────────────────

function ProfileSettingsPanel() {
  const { profile, showProfilePanel, toggleProfilePanel, updateProfile, signOut, clearMemory, clearAllSessions, userMemory, chatSessions } = useUser();
  const [city, setCity] = useState(profile?.city || "");
  const [claimStatus, setClaimStatus] = useState(profile?.claim_status || "");
  const [claimStage, setClaimStage] = useState(profile?.claim_stage || "");
  const [pct, setPct] = useState(profile?.disability_percent ?? "");
  const [interests, setInterests] = useState(profile?.interests || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setCity(profile.city || "");
      setClaimStatus(profile.claim_status || "");
      setClaimStage(profile.claim_stage || "");
      setPct(profile.disability_percent ?? "");
      setInterests(profile.interests || []);
    }
  }, [profile]);

  if (!showProfilePanel) return null;

  function toggleInterest(i) {
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  }

  async function handleSave() {
    setSaving(true);
    await updateProfile({
      city: city || null,
      claim_status: claimStatus || null,
      claim_stage: claimStatus === "before_recognition" ? (claimStage || null) : null,
      disability_percent: claimStatus === "after_recognition" && pct !== "" ? Number(pct) : null,
      interests,
    });
    setSaving(false);
    toggleProfilePanel();
  }

  return (
    <div className="settings-overlay" onClick={toggleProfilePanel}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <h3>הגדרות פרופיל</h3>

        <label className="settings-label">עיר</label>
        <select value={city} onChange={e => setCity(e.target.value)} className="settings-select">
          <option value="">בחר עיר</option>
          {PROFILE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="settings-label">מצב בתביעה</label>
        <select value={claimStatus} onChange={e => { setClaimStatus(e.target.value); }} className="settings-select">
          <option value="">בחר מצב</option>
          <option value="before_recognition">לפני הכרה</option>
          <option value="after_recognition">אחרי הכרה — יש אחוזים</option>
        </select>

        {claimStatus === "before_recognition" && <>
          <label className="settings-label">באיזה שלב אתה?</label>
          <select value={claimStage} onChange={e => setClaimStage(e.target.value)} className="settings-select">
            <option value="">בחר שלב</option>
            {CLAIM_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </>}

        {claimStatus === "after_recognition" && <>
          <label className="settings-label">אחוזי נכות</label>
          <input type="number" min="0" max="100" value={pct} onChange={e => setPct(e.target.value)} placeholder="0-100" className="settings-input"/>
        </>}

        <label className="settings-label">תחומי עניין</label>
        <div className="interest-chips">
          {INTEREST_OPTIONS.map(i => (
            <button key={i} className={`interest-chip ${interests.includes(i)?"on":""}`} onClick={() => toggleInterest(i)}>{i}</button>
          ))}
        </div>

        <label className="settings-label" style={{marginTop:16}}>פרטיות</label>
        <div className="privacy-actions">
          {userMemory.length > 0 && (
            <button className="privacy-btn" onClick={() => { if(confirm("למחוק את כל הזיכרון? השיחות הבאות לא יכירו מידע מסשנים קודמים.")) clearMemory(); }}>
              מחק זיכרון ({userMemory.length} פריטים)
            </button>
          )}
          {chatSessions.length > 0 && (
            <button className="privacy-btn" onClick={() => { if(confirm("למחוק את כל היסטוריית השיחות?")) clearAllSessions(); }}>
              מחק היסטוריית שיחות ({chatSessions.length})
            </button>
          )}
          {userMemory.length === 0 && chatSessions.length === 0 && (
            <p style={{fontSize:12.5,color:"#6b7a8d"}}>אין נתונים שמורים</p>
          )}
        </div>

        <div className="settings-actions">
          <button className="save-btn" onClick={handleSave} disabled={saving}>{saving ? "שומר..." : "שמור"}</button>
          <button className="signout-btn" onClick={signOut}>התנתק</button>
        </div>
      </div>
    </div>
  );
}

// ─── UserTopBar ───────────────────────────────────────────

function UserTopBar({ onProfile }) {
  const { user, profile, loading, signInWithGoogle } = useUser();
  if (loading) return null;

  if (!user) {
    return (
      <button className="user-top-btn" onClick={signInWithGoogle} title="התחבר">
        <div className="user-top-avatar anon">
          <span>👤</span>
        </div>
      </button>
    );
  }

  const displayName = profile?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "משתמש";
  const avatar = profile?.avatar_url || user.user_metadata?.avatar_url;
  const initial = displayName[0];

  return (
    <button className="user-top-btn" onClick={onProfile} title="הפרופיל שלי">
      <div className="user-top-avatar">
        {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
      </div>
    </button>
  );
}

// ─── ProfileView ──────────────────────────────────────────

function ProfileView({ rights, onNavigateToRight }) {
  const { user, profile, userRights, toggleProfilePanel } = useUser();

  if (!user) return <div className="empty">התחבר כדי לראות את הפרופיל שלך</div>;

  const displayName = profile?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "משתמש";
  const avatar = profile?.avatar_url || user.user_metadata?.avatar_url;

  const completed = rights.filter(r => userRights[r.id] === "completed");
  const inProgress = rights.filter(r => userRights[r.id] === "in_progress");
  const notStarted = rights.filter(r => !userRights[r.id] || userRights[r.id] === "not_started");

  return (
    <>
      <div className="pg-hdr">
        <h1>הפרופיל שלי</h1>
      </div>

      <div className="profile-card">
        <div className="profile-card-header">
          <div className="profile-big-avatar">
            {avatar ? <img src={avatar} alt="" /> : <span>{displayName[0]}</span>}
          </div>
          <div>
            <h2 className="profile-card-name">{displayName}</h2>
            {profile?.city && <p className="profile-card-detail">📍 {profile.city}</p>}
            {profile?.claim_status === "before_recognition" && profile?.claim_stage && (
              <p className="profile-card-detail">📋 {profile.claim_stage}</p>
            )}
            {profile?.claim_status === "after_recognition" && profile?.disability_percent != null && (
              <p className="profile-card-detail">אחוזי נכות: {profile.disability_percent}%</p>
            )}
          </div>
          <button className="profile-edit-btn" onClick={toggleProfilePanel}>⚙ עריכה</button>
        </div>
      </div>

      <div className="profile-section">
        <h3 className="profile-section-title">מימוש זכויות</h3>
        <div className="profile-stats">
          <div className="profile-stat">
            <div className="profile-stat-num done">{completed.length}</div>
            <div className="profile-stat-label">מומשו</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-num prog">{inProgress.length}</div>
            <div className="profile-stat-label">בתהליך</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-num">{notStarted.length}</div>
            <div className="profile-stat-label">טרם התחילו</div>
          </div>
        </div>
      </div>

      {inProgress.length > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">בתהליך עכשיו</h3>
          <div className="stack">
            {inProgress.map(r => (
              <div key={r.id} className="profile-right-item prog clickable" onClick={() => onNavigateToRight(r.id)}>
                <span className="badge cat-badge">{r.category}</span>
                <span>{r.title}</span>
                <span className="profile-right-arrow">←</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">מומשו</h3>
          <div className="stack">
            {completed.map(r => (
              <div key={r.id} className="profile-right-item done clickable" onClick={() => onNavigateToRight(r.id)}>
                <span className="badge cat-badge">{r.category}</span>
                <span>{r.title}</span>
                <span className="profile-check">✓</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {notStarted.length > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">שווה לבדוק</h3>
          <p className="profile-section-sub">זכויות שאולי מגיעות לך ועדיין לא בדקת</p>
          <div className="stack">
            {notStarted.slice(0, 5).map(r => (
              <div key={r.id} className="profile-right-item clickable" onClick={() => onNavigateToRight(r.id)}>
                <span className="badge cat-badge">{r.category}</span>
                <span>{r.title}</span>
                <span className="profile-right-arrow">←</span>
              </div>
            ))}
            {notStarted.length > 5 && (
              <button className="profile-more profile-more-btn" onClick={() => onNavigateToRight(null)}>
                ועוד {notStarted.length - 5} זכויות נוספות — לחץ לצפייה →
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── FeedbackModal ────────────────────────────────────────

function FeedbackModal({ open, onClose }) {
  const { user } = useUser();
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  if (!open) return null;

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const { supabase } = await import("../lib/supabase");
      await supabase.from("feedback").insert({
        user_id: user?.id || null,
        message: text.trim(),
        contact_email: email.trim() || null,
        contact_phone: phone.trim() || null,
        page: typeof window !== "undefined" ? window.location.pathname : null,
      });
      setSent(true);
      setText("");
      setEmail("");
      setPhone("");
    } catch {}
    setSending(false);
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        {sent ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🙏</div>
            <h3 style={{ color: "#f5f3ef", marginBottom: 8 }}>תודה!</h3>
            <p style={{ color: "#8a95a7", fontSize: 14 }}>ההודעה שלך התקבלה. אנחנו קוראים הכל.</p>
            <button className="save-btn" style={{ marginTop: 16 }} onClick={onClose}>סגור</button>
          </div>
        ) : (
          <>
            <h3>רעיונות לשימור/שיפור?</h3>
            <p style={{ color: "#8a95a7", fontSize: 13.5, marginBottom: 14, lineHeight: 1.6 }}>
              נשמח לשמוע — מה עובד, מה לא, מה חסר. כל מילה חשובה לנו.
            </p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="כתוב כאן..."
              className="feedback-textarea"
              rows={4}
            />
            <div className="feedback-contact">
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="מייל (אופציונלי)" className="settings-input feedback-input" type="email"/>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="טלפון (אופציונלי)" className="settings-input feedback-input" dir="ltr"/>
            </div>
            <p style={{ color: "#556070", fontSize: 11.5, marginTop: 4 }}>השאר פרטים אם תרצה שנחזור אליך</p>
            <div className="settings-actions">
              <button className="save-btn" onClick={handleSend} disabled={sending || !text.trim()}>
                {sending ? "שולח..." : "שלח"}
              </button>
              <button className="signout-btn" onClick={onClose}>ביטול</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── KnowledgeView ───────────────────────────────────────────

const KNOWLEDGE_CATS = ["הכל", "ועדות רפואיות", "בירוקרטיה", "טיפול נפשי", "תעסוקה", "דיור", "לימודים", "כללי"];

function KnowledgeView() {
  const { user } = useUser();
  const [items, setItems] = useState([]);
  const [kCat, setKCat] = useState("הכל");
  const [loadingK, setLoadingK] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formCat, setFormCat] = useState("כללי");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [voted, setVoted] = useState({});

  useEffect(() => {
    fetchKnowledge();
  }, [kCat]);

  async function fetchKnowledge() {
    setLoadingK(true);
    try {
      const url = kCat === "הכל" ? "/api/knowledge" : `/api/knowledge?category=${encodeURIComponent(kCat)}`;
      const r = await fetch(url);
      const d = await r.json();
      setItems(Array.isArray(d) ? d : []);
    } catch { setItems([]); }
    setLoadingK(false);
  }

  async function handleSubmit() {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSubmitting(true);
    try {
      const { supabase } = await import("../lib/supabase");
      let token;
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise((resolve) => setTimeout(() => resolve(null), 3000))
        ]);
        token = result?.data?.session?.access_token;
      } catch {}
      if (!token) {
        try {
          const storageKey = Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
          if (storageKey) token = JSON.parse(localStorage.getItem(storageKey) || "{}")?.access_token;
        } catch {}
      }
      if (!token) { alert("יש להתחבר כדי לשתף"); setSubmitting(false); return; }

      await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category: formCat, title: formTitle.trim(), content: formContent.trim() }),
      });
      setFormTitle("");
      setFormContent("");
      setShowForm(false);
      alert("תודה! הניסיון שלך יועבר ליועץ AI לאחר אישור.");
    } catch {}
    setSubmitting(false);
  }

  async function handleVote(knowledgeId) {
    try {
      const { supabase } = await import("../lib/supabase");
      let token;
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise((resolve) => setTimeout(() => resolve(null), 3000))
        ]);
        token = result?.data?.session?.access_token;
      } catch {}
      if (!token) {
        try {
          const storageKey = Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
          if (storageKey) token = JSON.parse(localStorage.getItem(storageKey) || "{}")?.access_token;
        } catch {}
      }
      if (!token) return;

      const r = await fetch("/api/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ knowledge_id: knowledgeId }),
      });
      const d = await r.json();
      setVoted(prev => ({ ...prev, [knowledgeId]: d.voted }));
      setItems(prev => prev.map(item =>
        item.id === knowledgeId
          ? { ...item, upvotes: item.upvotes + (d.voted ? 1 : -1) }
          : item
      ));
    } catch {}
  }

  return (
    <>
      <div className="pg-hdr">
        <h1>חכמת ותיקים</h1>
        <p>שתפו ניסיון אמיתי — היועץ AI לומד מכם ומעביר הלאה</p>
      </div>

      <div className="knowledge-explainer">
        <div className="knowledge-explainer-icon">🧠</div>
        <div className="knowledge-explainer-text">
          <strong>איך זה עובד?</strong> אתם משתפים טיפים מהניסיון שלכם, ואחרי אישור — היועץ AI משתמש בהם כדי לעזור לפצועים חדשים. ככה הידע שלכם ממשיך לעזור.
        </div>
      </div>

      {user ? (
        <div style={{marginBottom:20}}>
          <button className="knowledge-share-btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? "ביטול" : "✍️ שתף מהניסיון שלך"}
          </button>
        </div>
      ) : (
        <div className="knowledge-login-hint">התחבר כדי לשתף מהניסיון שלך</div>
      )}

      {showForm && (
        <div className="knowledge-form">
          <label className="knowledge-form-label">בחר קטגוריה:</label>
          <select value={formCat} onChange={e => setFormCat(e.target.value)} className="settings-select" style={{marginBottom:12}}>
            {KNOWLEDGE_CATS.filter(c => c !== "הכל").map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="knowledge-form-label">מה למדת? (כותרת קצרה)</label>
          <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder='למשל: "לא ללכת לוועדה בלי נציג"' className="settings-input" style={{marginBottom:12}}/>
          <label className="knowledge-form-label">ספר בפירוט — מה עשית, מה עבד, מה לא</label>
          <textarea value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="שתף את מה שלמדת מהניסיון שלך... מה היית רוצה שמישהו היה אומר לך בהתחלה?" className="feedback-textarea" rows={4}/>
          <button className="save-btn" style={{marginTop:10,maxWidth:160}} onClick={handleSubmit} disabled={submitting || !formTitle.trim() || !formContent.trim()}>
            {submitting ? "שולח..." : "שלח ליועץ AI"}
          </button>
        </div>
      )}

      <div className="filters" style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginTop:16}}>
        <div className="chips">
          {KNOWLEDGE_CATS.map(c => (
            <button key={c} className={`chip ${kCat===c?"on":""}`} onClick={() => setKCat(c)}>{c}</button>
          ))}
        </div>
      </div>

      {loadingK ? (
        <div className="empty">טוען...</div>
      ) : items.length === 0 ? (
        <div className="empty">אין טיפים בקטגוריה זו עדיין{user ? " — היה הראשון לשתף!" : ""}</div>
      ) : (
        <>
          <p style={{color:"#6b7a8d",fontSize:13,marginTop:12,marginBottom:8}}>טיפים שהיועץ AI כבר למד ({items.length}):</p>
          <div className="stack">
            {items.map(item => (
              <div key={item.id} className="knowledge-card">
                <div className="knowledge-top">
                  <span className="badge cat-badge">{item.category}</span>
                  <span className="knowledge-date">{new Date(item.created_at).toLocaleDateString("he-IL")}</span>
                </div>
                <h3 className="knowledge-title">{item.title}</h3>
                <p className="knowledge-content">{item.content}</p>
                <div className="knowledge-foot">
                  <button
                    className={`knowledge-vote-btn ${voted[item.id] ? "voted" : ""}`}
                    onClick={() => user && handleVote(item.id)}
                    disabled={!user}
                    title={user ? "גם לי עזר" : "התחבר כדי לאשר"}
                  >
                    ✅ {item.upvotes} {item.upvotes === 1 ? "ותיק אישר" : "ותיקים אישרו"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─── TipsView ────────────────────────────────────────────────

const TIPS = [
  {
    icon: "⚖",
    title: "קח עו\"ד או נציג מארגון נכי צה\"ל — חינם",
    content: "ארגון נכי צה\"ל נותן ייצוג חינם בוועדות רפואיות ובערעורים. בנוסף, תוכנית ממשלתית חדשה מציעה ייצוג ב-500 ₪ בלבד. לא ללכת לוועדה לבד!",
    action: "📞 ארגון נכי צה\"ל: 03-5254646",
  },
  {
    icon: "📋",
    title: "הזמן תיק רפואי צבאי מיד",
    content: "התיק הרפואי הצבאי הוא הבסיס לכל תביעה. ככל שתזמין מוקדם יותר — תקבל מוקדם יותר. ההזמנה חינם ומקוונת.",
    action: "🌐 archives.mod.gov.il",
  },
  {
    icon: "🚫",
    title: "אל תלך לוועדה רפואית בלי נציג",
    content: "ועדה רפואית קובעת את אחוזי הנכות שלך, וזה משפיע על כל הזכויות. עם ייצוג — הסיכוי לאחוזים נכונים עולה משמעותית. הם גם יכולים להוריד אחוזים בערעור!",
  },
  {
    icon: "💪",
    title: "אל תמעיט בפגיעה בפני הוועדה",
    content: "יש נטייה טבעית להגיד \"אני בסדר\". בוועדה — תספר בדיוק מה קשה לך ביומיום. זה לא מגזים — זה מדויק. הרופאים צריכים לשמוע את התמונה המלאה.",
  },
  {
    icon: "⏰",
    title: "הגש תביעה מהר — עיכובים עולים כסף",
    content: "תביעה תוך שנה מהשחרור = תגמולים מיום השחרור. אחרי שנה = תגמולים רק מיום ההגשה. כל יום שעובר הוא כסף שאתה מפסיד.",
  },
  {
    icon: "🧠",
    title: "טיפול נפשי זמין גם לפני הכרה רשמית",
    content: "לא צריך לחכות להכרה רשמית כדי לקבל עזרה. מדיניות חדשה מאפשרת טיפול נפשי מיידי. נפש אחת *8944 זמין 24/7, אנונימי, אנשי מקצוע שהיו שם.",
    action: "📞 נפש אחת: *8944",
  },
  {
    icon: "🗂",
    title: "שמור כל מסמך ומספר פנייה",
    content: "כל פנייה, קבלה, מכתב, אישור — שמור! צלם ותשמור בענן. מספרי פניות חשובים למעקב. אם אין תשובה תוך 30 יום — התקשר עם מספר הפנייה.",
  },
  {
    icon: "📞",
    title: "התקשר *6500 לכל שאלה",
    content: "מוקד הפצועים *6500 הוא הכתובת לכל דבר. קצין שיקום, ועדה רפואית, תגמולים, ציוד — הכל מתחיל שם. תגיד: \"אני נכה צה\"ל, מספר תיק ___, ואני צריך...\"",
    action: "📞 מוקד פצועים: *6500",
  },
  {
    icon: "🤝",
    title: "מרכז \"בידיים טובות\" — עזרה חינם בהגשה",
    content: "מרכז \"בידיים טובות\" (מוטה גור 5, פתח תקווה) מסייע חינם בהכנת תיק, הגשת תביעה, וליווי לוועדות רפואיות. שווה לבוא גם אם כבר התחלת תהליך.",
  },
];

function TipsView() {
  return (
    <>
      <div className="pg-hdr">
        <h1>צעדים ראשונים</h1>
        <p>9 דברים שכל פצוע צה"ל חייב לדעת — מניסיון של אלפי חבר'ה שעברו את זה</p>
      </div>
      <div className="tips-grid">
        {TIPS.map((tip, i) => (
          <div key={i} className="tip-card">
            <div className="tip-card-num">{i + 1}</div>
            <div className="tip-card-icon">{tip.icon}</div>
            <h3 className="tip-card-title">{tip.title}</h3>
            <p className="tip-card-content">{tip.content}</p>
            {tip.action && <div className="tip-card-action">{tip.action}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── TermsView ───────────────────────────────────────────────

function TermsView() {
  return (
    <>
      <div className="pg-hdr">
        <h1>תנאי שימוש</h1>
        <p>עודכן לאחרונה: מרץ 2026</p>
      </div>
      <div className="terms-content">
        <div className="terms-section">
          <h3>כללי</h3>
          <p>אתר "שיט.קום" הוא פורטל מידע ציבורי המיועד לפצועי צה"ל ולבני משפחותיהם. השימוש באתר מהווה הסכמה לתנאים המפורטים להלן.</p>
        </div>

        <div className="terms-section">
          <h3>סודיות ופרטיות</h3>
          <p>שיחות עם היועצים הדיגיטליים (דן, מיכל, אורי, שירה) הן פרטיות לחלוטין. תוכן השיחות לא נשמר בשרת, לא מועבר לצד שלישי ולא מזוהה עם המשתמש. כל סשן שיחה מאופס בסיומו.</p>
          <p>מידע פרופיל (עיר, מצב תביעה, תחומי עניין) נשמר באופן מאובטח ומשמש אך ורק להתאמה אישית של התוכן עבורך.</p>
        </div>

        <div className="terms-section">
          <h3>הגבלת אחריות</h3>
          <p>המידע באתר, לרבות תשובות היועצים הדיגיטליים, מוגש לצרכי אינפורמציה כללית בלבד. <strong>אין במידע זה תחליף לייעוץ משפטי, רפואי או מקצועי מוסמך.</strong></p>
          <p>הנהלת האתר אינה אחראית לנזק כלשהו שייגרם כתוצאה מהסתמכות על המידע המופיע באתר.</p>
        </div>

        <div className="terms-section">
          <h3>חובת אימות מול גורם מוסמך</h3>
          <p>לפני ביצוע כל פעולה משפטית, רפואית או כלכלית על סמך מידע מהאתר — <strong>חובה לוודא את המידע מול עורך דין, רופא או גורם מקצועי מוסמך.</strong></p>
          <p>סכומי כסף, אחוזים, תנאי זכאות ומועדים עשויים להשתנות. האתר עושה מאמץ להתעדכן אך אינו מתחייב לדיוק מוחלט.</p>
        </div>

        <div className="terms-section">
          <h3>שימוש ביועצים הדיגיטליים</h3>
          <p>היועצים הדיגיטליים (AI) אינם אנשי מקצוע אמיתיים. הם כלי עזר מבוסס בינה מלאכותית שנועד לכוון, להסביר ולסייע בניווט הבירוקרטיה — לא להחליף ייצוג אנושי.</p>
          <p>במצב חירום נפשי, יש לפנות מיידית לקו "נפש אחת" *8944 (24/7).</p>
        </div>

        <div className="terms-section">
          <h3>זכויות יוצרים</h3>
          <p>תכני האתר, לרבות עיצוב, טקסטים וקוד, מוגנים בזכויות יוצרים. ניתן לשתף מידע מהאתר לצרכים אישיים ולמען קהילת פצועי צה"ל.</p>
        </div>

        <div className="terms-section">
          <h3>יצירת קשר</h3>
          <p>לשאלות בנוגע לתנאי השימוש או לאתר בכלל, ניתן לפנות דרך כפתור "רעיונות לשימור/שיפור?" בתפריט.</p>
        </div>
      </div>
    </>
  );
}

// ─── Chat ──────────────────────────────────────────────────

const HATS = [
  { id:"lawyer",  icon:"⚖",  label:"דן",  name:"דן", desc:"ייעוץ בזכויות ומשפט" },
  { id:"social",  icon:"🤝",  label:"מיכל", name:"מיכל", desc:"ניווט בירוקרטיה ושירותים" },
  { id:"psycho",  icon:"💙",  label:"אורי", name:"אורי", desc:"שיחה אישית ותמיכה" },
  { id:"veteran", icon:"🎖",  label:"רועי", name:"רועי", desc:"חכמת ותיקים" },
  { id:"events",  icon:"🎯",  label:"שירה", name:"שירה", desc:"אירועים ופעילויות" },
];

const HAT_GREETINGS = {
  lawyer:  "היי, אני דן 👋\n\nאני לא עו\"ד, אבל כנראה שאוכל לעזור לך בכל עניין מול משרד הביטחון.\n\nאיפה הדברים עומדים אצלך?",
  social:  "היי, אני מיכל 👋\n\nאני מכירה את כל הבלגן הבירוקרטי מבפנים, ואלווה אותך.\n\nמה הכי לוחץ עליך עכשיו?",
  psycho:  "היי, אני אורי 👋\n\nהכל כאן סודי — אף אחד לא רואה את השיחה.\n\nמה עובר עליך?",
  veteran: "היי, אני רועי 👋\n\nעברתי את כל הדרך — ועדות, ערעורים, בירוקרטיה. אשמח לשתף ממה שלמדתי.\n\nאיפה אתה עומד?",
  events:  "היי, אני שירה 👋\n\nיש אירועים, סדנאות, טיולים — הרבה בחינם.\n\nבאיזה אזור אתה? מה מעניין אותך?",
};

const HAT_DETAILS = {
  lawyer:  "מכיר את כל הזכויות מול משרד הביטחון. יעזור לך להבין מה מגיע לך, איך מגישים ומה עושים אם דחו.",
  social:  "מכירה את כל הבירוקרטיה מבפנים. תלווה אותך בין הגורמים ותעזור שלא תפספס כלום.",
  psycho:  "פה בשבילך, בלי שיפוט. אפשר לדבר על מה שעובר עליך, על קשיים ביומיום, או סתם לשחרר.",
  veteran: "עבר את כל הדרך — ועדות, ערעורים, ניירת. ישתף ממה שלמד כדי שתדע מה לצפות.",
  events:  "תמצא לך אירועים, סדנאות וטיולים — הרבה בחינם. רק תגיד איפה אתה ומה מעניין אותך.",
};

const WELCOME_TIPS = [
  "ידעת? יש לנו רשימת זכויות מעודכנת — אפשר לסנן לפי קטגוריה",
  "בודק אירועים? יש טיולים, סדנאות והרצאות — הרבה בחינם",
  "אפשר לנהל את התיק שלך — לעקוב אחרי שלבים ומסמכים",
  "ב׳חכמת ותיקים׳ יש טיפים ממי שכבר עבר את הדרך",
  "כל שיחה כאן פרטית ומאובטחת — שום דבר לא נשמר",
  "צריך לדבר עם בן אדם? מוקד פצועים *6500, נפש אחת *8944",
];

function FloatingTip() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * WELCOME_TIPS.length));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(prev => (prev + 1) % WELCOME_TIPS.length);
        setVisible(true);
      }, 800);
    }, 8000);
    return () => clearInterval(interval);
  }, [mounted]);

  return (
    <div className={`floating-tip ${visible ? "tip-visible" : "tip-hidden"}`}>
      💡 {WELCOME_TIPS[idx]}
    </div>
  );
}

function WelcomeScreen({ onSelect }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-title">שלום</div>
      <div className="welcome-subtitle">מי תרצה שילווה אותך היום?</div>
      <div className="welcome-grid">
        {HATS.map((h, i) => (
          <button key={h.id} className="welcome-card" style={{ animationDelay: `${i * 0.1}s` }} onClick={() => onSelect(h.id)}>
            <div className="wc-icon-wrap">{h.icon}</div>
            <div className="wc-name">{h.name}</div>
            <div className="wc-role">{h.desc}</div>
            <div className="wc-desc">{HAT_DETAILS[h.id]}</div>
          </button>
        ))}
      </div>
      <FloatingTip />
    </div>
  );
}

function Chat({ rights, events, pendingChatPromptRef, onStageUpdate, initialHat, onBack }) {
  const { user, profile, userRights: chatUserRights, userMemory, chatSessions, saveSession, loadSession, deleteSession, saveMemory, legalCase, saveLegalCase } = useUser();
  const [hat, setHat]         = useState(initialHat || "lawyer");
  const [msgs, setMsgs]       = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner]   = useState(true);
  const [userCity, setUserCity] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [typingText, setTypingText] = useState(null);
  const [placeholder, setPlaceholder] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loginHint, setLoginHint] = useState(false);
  const [featureConfig, setFeatureConfig] = useState([]);
  const [enabledFeatures, setEnabledFeatures] = useState({});
  const [showFeaturePanel, setShowFeaturePanel] = useState(false);
  const bottom = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);
  const hatCacheRef = useRef({}); // { [hatId]: { msgs, sessionId } }
  const activeHatRef = useRef(hat); // track current hat for async safety

  const isPsycho = hat === "psycho";

  // Load feature pricing config
  useEffect(() => {
    fetch("/api/feature-pricing").then(r => r.json()).then(config => {
      setFeatureConfig(config);
      const defaults = {};
      config.forEach(f => { defaults[f.id] = f.always_on || f.enabled_by_default; });
      setEnabledFeatures(defaults);
    }).catch(() => {});
  }, []);

  const estimatedCost = featureConfig
    .filter(f => enabledFeatures[f.id])
    .reduce((sum, f) => sum + f.estimated_tokens, 0);

  // Privacy banner fade out after 15s
  useEffect(() => {
    if (banner) {
      const t = setTimeout(() => setBanner(false), 15000);
      return () => clearTimeout(t);
    }
  }, [banner]);

  // Save current hat state & restore new hat state when switching
  function switchHat(newHat) {
    if (newHat === hat) return;
    // Save current hat conversation to cache
    hatCacheRef.current[hat] = { msgs, sessionId };
    // Restore or initialize new hat
    const cached = hatCacheRef.current[newHat];
    if (cached && cached.msgs.length > 1) {
      setMsgs(cached.msgs);
      setSessionId(cached.sessionId);
    } else {
      setMsgs([{ role: "assistant", content: HAT_GREETINGS[newHat] }]);
      setSessionId(null);
    }
    setLoading(false);
    setTypingText(null);
    setAttachment(null);
    setPlaceholder(getDefaultPlaceholder(newHat));
    activeHatRef.current = newHat;
    setHat(newHat);
  }

  // Initialize first hat greeting
  useEffect(() => {
    setMsgs([{ role: "assistant", content: HAT_GREETINGS[hat] }]);
    setPlaceholder(getDefaultPlaceholder(hat));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle pending chat prompt from LegalCaseView ("שאל את דן")
  useEffect(() => {
    if (pendingChatPromptRef?.current) {
      const prompt = pendingChatPromptRef.current;
      pendingChatPromptRef.current = null;
      if (hat !== "lawyer") switchHat("lawyer");
      setInput(prompt);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function getDefaultPlaceholder(h) {
    switch(h) {
      case "lawyer": return "ספר לי על המצב שלך...";
      case "social": return "מה אתה צריך עזרה בו?";
      case "psycho": return "אפשר לכתוב, להקליט, או פשוט להגיד היי...";
      case "veteran": return "שאל אותי מה שרוצה...";
      case "events": return "מה מעניין אותך?";
      default: return "כתוב כאן...";
    }
  }

  // Update placeholder based on last AI message
  function extractPlaceholder(text) {
    if (!text) return null;
    // Find last question in the text
    const lines = text.split("\n").filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.endsWith("?")) {
        // Shorten if too long
        return line.length > 50 ? line.slice(0, 47) + "..." : line;
      }
    }
    return null;
  }

  const msgsContainerRef = useRef(null);
  useEffect(() => {
    const el = msgsContainerRef.current;
    if (!el) { bottom.current?.scrollIntoView({ behavior: "smooth" }); return; }
    // Auto-scroll only if user is near the bottom (within 150px)
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typingText]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, isPsycho ? 120 : 80) + "px";
    }
  }, [input, isPsycho]);

  // File handling
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("הקובץ גדול מדי (מקסימום 10MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      const preview = file.type.startsWith("image/") ? reader.result : null;
      setAttachment({ base64, media_type: file.type, file_name: file.name, preview });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Voice recording (Speech Recognition)
  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("הדפדפן שלך לא תומך בהקלטה קולית");
      return;
    }
    const recognition = new SR();
    recognition.lang = "he-IL";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    setIsRecording(true);
  }

  // Typing animation for responses
  const animateTyping = useCallback((fullText, onDone) => {
    let i = 0;
    const words = fullText.split(/(\s+)/);
    let displayed = "";
    setTypingText("");

    const interval = setInterval(() => {
      if (i < words.length) {
        displayed += words[i];
        setTypingText(displayed);
        i++;
      } else {
        clearInterval(interval);
        setTypingText(null);
        onDone(fullText);
      }
    }, isPsycho ? 80 : 45); // Comfortable reading speed

    return () => clearInterval(interval);
  }, [isPsycho]);

  async function send() {
    if ((!input.trim() && !attachment) || loading) return;
    const text = input.trim();
    const sendHat = hat; // capture hat at send time
    setInput("");

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    const userMsg = { role: "user", content: text, attachment: attachment ? { preview: attachment.preview, file_name: attachment.file_name, media_type: attachment.media_type } : null };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs);
    setLoading(true);

    const currentAttachment = attachment;
    setAttachment(null);

    try {
      const payload = {
        messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        hat,
        rights,
      };

      if (hat === "events") {
        payload.events = events;
        if (userCity) payload.userCity = userCity;
      }

      if (currentAttachment) {
        payload.attachment = {
          base64: currentAttachment.base64,
          media_type: currentAttachment.media_type,
          file_name: currentAttachment.file_name,
        };
        payload.lastMessageText = text;
      }

      if (user && profile) {
        payload.userProfile = {
          name: profile.name,
          city: profile.city,
          claim_status: profile.claim_status,
          claim_stage: profile.claim_stage,
          disability_percent: profile.disability_percent,
          interests: profile.interests,
        };
      }

      // Send memory for context
      if (user && userMemory.length > 0) {
        payload.memory = userMemory;
      }

      // Send rights status for smart detection
      if (user && Object.keys(chatUserRights).length > 0) {
        payload.userRightsStatus = chatUserRights;
      }

      // Send legal case context
      if (user && legalCase) {
        payload.legalCase = {
          stage: legalCase.stage,
          injury_types: legalCase.injury_types || (legalCase.injury_type ? [legalCase.injury_type] : []),
          committee_date: legalCase.committee_date,
          disability_percent: legalCase.disability_percent,
          representative_name: legalCase.representative_name,
          representative_org: legalCase.representative_org,
        };
      }

      // Request memory extraction and title generation
      if (user) {
        payload.extractMemory = newMsgs.length >= 4;
        payload.generateTitle = !sessionId && newMsgs.length >= 2;
      }

      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      let reply = d.reply || "שגיאה.";

      // Stage detection — parse [STAGE_UPDATE:X] from reply
      const stageMatch = reply.match(/\[STAGE_UPDATE:([A-Z_]+)\]/);
      if (stageMatch && onStageUpdate) {
        reply = reply.replace(/\[STAGE_UPDATE:[A-Z_]+\]/, "").trim();
        onStageUpdate(stageMatch[1]);
      }

      // Submission ref detection — parse [SUBMISSION_REF:X] from reply
      const refMatch = reply.match(/\[SUBMISSION_REF:(\S+)\]/);
      if (refMatch) {
        reply = reply.replace(/\[SUBMISSION_REF:\S+\]/, "").trim();
        const refNumber = refMatch[1];
        // Save reference number to legal case notes if user is logged in
        if (user && legalCase) {
          const existingNotes = legalCase.notes || "";
          const refNote = `מספר פנייה: ${refNumber} (${new Date().toLocaleDateString("he-IL")})`;
          if (!existingNotes.includes(refNumber)) {
            saveLegalCase({ notes: existingNotes ? existingNotes + "\n" + refNote : refNote });
          }
        }
      }

      // Save extracted memory
      if (d.extractedMemory && d.extractedMemory.length > 0) {
        saveMemory(d.extractedMemory);
      }

      // Update placeholder from reply
      const newPh = extractPlaceholder(reply);
      if (newPh) setPlaceholder(newPh);

      const generatedTitle = d.sessionTitle;

      // If user switched hat while waiting, save response to cache instead
      if (activeHatRef.current !== sendHat) {
        const cachedMsgs = hatCacheRef.current[sendHat]?.msgs || newMsgs;
        hatCacheRef.current[sendHat] = {
          msgs: [...cachedMsgs, { role: "assistant", content: reply }],
          sessionId: hatCacheRef.current[sendHat]?.sessionId || null,
        };
        setLoading(false);
        return;
      }

      // Typing animation
      setLoading(false);
      animateTyping(reply, (finalText) => {
        setMsgs(m => {
          const updated = [...m, { role: "assistant", content: finalText }];
          // Show login hint for non-logged-in users
          if (!user && updated.length <= 3 && !loginHint) {
            setLoginHint(true);
            setTimeout(() => setLoginHint(false), 6000);
          }
          // Auto-save session for logged-in users
          if (user && updated.length >= 3) {
            const sessData = {
              id: sessionId || undefined,
              hat: sendHat,
              title: generatedTitle || (sessionId ? undefined : text.slice(0, 40)),
              messages: updated.map(msg => ({ role: msg.role, content: msg.content })),
            };
            saveSession(sessData).then(saved => {
              if (saved && !sessionId) setSessionId(saved.id);
            });
          }
          // Update hat cache
          hatCacheRef.current[sendHat] = { msgs: updated, sessionId };
          return updated;
        });
      });
    } catch {
      if (activeHatRef.current === sendHat) {
        setMsgs(m => [...m, { role: "assistant", content: "שגיאה בחיבור. נסה שוב." }]);
      }
      setLoading(false);
    }
  }

  async function handleLoadSession(sid) {
    const sess = await loadSession(sid);
    if (sess) {
      // Save current hat cache before switching
      hatCacheRef.current[hat] = { msgs, sessionId };
      activeHatRef.current = sess.hat;
      setHat(sess.hat);
      setMsgs(sess.messages || []);
      setSessionId(sess.id);
      setShowHistory(false);
    }
  }

  function handleNewChat() {
    setSessionId(null);
    const greetings = {
      lawyer: "היי, אני דן 👋\n\nאני לא עו\"ד, אבל כנראה שאוכל לעזור לך בכל עניין מול משרד הביטחון.\n\nאיפה הדברים עומדים אצלך?",
      social: "היי, אני מיכל 👋\n\nאני מכירה את כל הבלגן הבירוקרטי מבפנים, ואלווה אותך.\n\nמה הכי לוחץ עליך עכשיו?",
      psycho: "היי, אני אורי 👋\n\nהכל כאן סודי — אף אחד לא רואה את השיחה.\n\nמה עובר עליך?",
      veteran: "היי, אני רועי 👋\n\nעברתי את כל הדרך — ועדות, ערעורים, בירוקרטיה. אשמח לשתף ממה שלמדתי.\n\nאיפה אתה עומד?",
      events: "היי, אני שירה 👋\n\nיש אירועים, סדנאות, טיולים — הרבה בחינם.\n\nבאיזה אזור אתה? מה מעניין אותך?",
    };
    setMsgs([{ role: "assistant", content: greetings[hat] }]);
    setShowHistory(false);
  }

  const curHat = HATS.find(h => h.id === hat);
  const hatSessions = chatSessions.filter(s => s.hat === hat);

  return (
    <div className={`chat-outer ${isPsycho ? "psycho-mode" : ""}`}>
      {/* Privacy banner — fades out */}
      {banner && (
        <div className="privacy-banner">
          <span className="prv-icon">🔒</span>
          <span>שיחה זו היא <strong>פרטית ומאובטחת</strong> — המידע שלך לא מועבר לצד שלישי ולא מזוהה.</span>
          <button className="prv-close" onClick={() => setBanner(false)}>✕</button>
        </div>
      )}

      {/* Hat selector — in psycho mode, moves to corner */}
      <div className={`hat-row ${isPsycho && msgs.length > 1 ? "hat-row-mini" : ""}`}>
        {onBack && !(isPsycho && msgs.length > 1) && <button className="back-welcome-btn" onClick={onBack} title="חזרה לבחירת יועץ">←</button>}
        {!(isPsycho && msgs.length > 1) && <span className="hat-label">דבר עם:</span>}
        {HATS.map(h => (
          <button key={h.id} className={`hat-btn ${hat===h.id?"active":""} ${h.id==="events"?"hat-events":""}`} onClick={() => switchHat(h.id)} title={h.desc}>
            <span className="hat-icon">{h.icon}</span>
            <span className="hat-name">{h.label}</span>
          </button>
        ))}
      </div>

      {/* City selector for events hat */}
      {hat === "events" && (
        <div className="city-row">
          {["תל אביב","ירושלים","חיפה","באר שבע","כלל הארץ"].map(c => (
            <button key={c} className={`city-btn ${userCity===c?"active":""}`} onClick={() => setUserCity(userCity===c?null:c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Chat window */}
      <div className={`chat-wrap ${isPsycho ? "chat-wrap-full" : ""}`}>
        <div className="chat-hdr">
          <div className="chat-ava">{curHat.icon}</div>
          <div>
            <div className="chat-name">{curHat.name} — שיט.קום</div>
            <div className="chat-sub">{curHat.desc}</div>
          </div>
          <button className="feature-toggle-btn" onClick={() => setShowFeaturePanel(!showFeaturePanel)} title="פיצ'רים פעילים">
            ⚡ {showFeaturePanel ? "✕" : `~${(estimatedCost/1000).toFixed(1)}K`}
          </button>
          <div className="chat-online">● מחובר</div>
          {user && (
            <button className="chat-history-btn" onClick={() => setShowHistory(!showHistory)} title="היסטוריית שיחות">
              {showHistory ? "✕" : "📋"}
            </button>
          )}
        </div>

        {/* Feature toggles panel */}
        {showFeaturePanel && (
          <div className="feature-panel">
            <div className="feature-panel-title">פיצ'רים — בחר מה פעיל בשיחה</div>
            {featureConfig.map(f => {
              const isOn = f.always_on || enabledFeatures[f.id];
              return (
                <div key={f.id} className="feature-row">
                  <span className="feature-icon">{f.icon}</span>
                  <div className="feature-info">
                    <span className="feature-label">{f.label}</span>
                    <span className="feature-desc">{f.description}</span>
                  </div>
                  <span className="feature-cost">~{(f.estimated_tokens/1000).toFixed(1)}K</span>
                  {f.always_on ? (
                    <span className="feature-always">תמיד</span>
                  ) : (
                    <label className="feature-switch">
                      <input type="checkbox" checked={isOn} onChange={() => setEnabledFeatures(prev => ({ ...prev, [f.id]: !prev[f.id] }))} />
                      <span className="feature-slider" />
                    </label>
                  )}
                </div>
              );
            })}
            <div className="feature-total">
              עלות משוערת להודעה: <strong>~{(estimatedCost/1000).toFixed(1)}K טוקנים</strong>
            </div>
          </div>
        )}

        {/* Login hint toast */}
        {loginHint && (
          <div className="login-hint-toast">
            💡 התחבר כדי לשמור שיחות ולהמשיך מאיפה שהפסקת
          </div>
        )}

        {/* History drawer */}
        {showHistory && user && (
          <div className="chat-history">
            <div className="history-header">
              <span>שיחות קודמות</span>
              <button className="history-new-btn" onClick={handleNewChat}>+ שיחה חדשה</button>
            </div>
            {hatSessions.length === 0 ? (
              <div className="history-empty">אין שיחות קודמות</div>
            ) : (
              <div className="history-list">
                {hatSessions.map(s => (
                  <div key={s.id} className={`history-item ${sessionId === s.id ? "active" : ""}`}>
                    <button className="history-item-btn" onClick={() => handleLoadSession(s.id)}>
                      <span className="history-title">{s.title || "שיחה ללא כותרת"}</span>
                      <span className="history-date">{new Date(s.updated_at).toLocaleDateString("he-IL")}</span>
                    </button>
                    <button className="history-delete" onClick={() => deleteSession(s.id)} title="מחק">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="chat-msgs" ref={msgsContainerRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" && <div className="msg-ava">{curHat.icon}</div>}
              <div className="bubble">
                {m.attachment && m.role === "user" && (
                  <div className="msg-attachment">
                    {m.attachment.preview ? (
                      <img src={m.attachment.preview} alt="" className="msg-attach-img"/>
                    ) : (
                      <div className="msg-attach-file">📄 {m.attachment.file_name}</div>
                    )}
                  </div>
                )}
                {m.role === "assistant" ? <ChatBubbleContent text={m.content}/> : m.content}
              </div>
            </div>
          ))}
          {/* Typing animation message */}
          {typingText !== null && (
            <div className="msg assistant">
              <div className="msg-ava">{curHat.icon}</div>
              <div className="bubble">{typingText}<span className="typing-cursor">|</span></div>
            </div>
          )}
          {loading && typingText === null && (
            <div className="msg assistant">
              <div className="msg-ava">{curHat.icon}</div>
              <div className="bubble typing"><span/><span/><span/></div>
            </div>
          )}
          <div ref={bottom}/>
        </div>

        {/* Attachment preview */}
        {attachment && (
          <div className="attachment-preview">
            {attachment.preview ? (
              <img src={attachment.preview} alt="" className="attach-thumb"/>
            ) : (
              <span className="attach-file-name">📄 {attachment.file_name}</span>
            )}
            <button className="attach-remove" onClick={() => setAttachment(null)}>✕</button>
          </div>
        )}

        <div className="chat-inp-row">
          {/* Attach button */}
          <button className="attach-btn" onClick={() => fileRef.current?.click()} title="צרף קובץ">📎</button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={handleFile}/>
          {/* Camera button — mobile only */}
          <button className="camera-btn" onClick={() => cameraRef.current?.click()} title="צלם">📷</button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
          {/* Voice button for psycho */}
          {isPsycho && (
            <button className={`voice-btn ${isRecording?"recording":""}`} onClick={toggleRecording} title={isRecording?"הפסק הקלטה":"הקלט"}>
              {isRecording ? "⏹" : "🎤"}
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={placeholder}
            className={`chat-inp ${isPsycho ? "chat-inp-multi" : ""}`}
            disabled={loading || typingText !== null}
            rows={1}
          />
          <button onClick={send} disabled={loading || typingText !== null || (!input.trim() && !attachment)} className="chat-send">←</button>
        </div>
      </div>

      <p className="chat-disclaimer">⚠️ המידע הוא לצרכי אינפורמציה בלבד ואינו מחליף ייעוץ מקצועי מוסמך.</p>
    </div>
  );
}

// ─── StageUpdateToast ──────────────────────────────────────

const STAGE_LABELS_MAP = {
  NOT_STARTED: "טרם התחיל", GATHERING_DOCUMENTS: "איסוף מסמכים",
  CLAIM_FILED: "תביעה הוגשה", COMMITTEE_SCHEDULED: "ועדה נקבעה",
  COMMITTEE_PREPARATION: "הכנה לוועדה", COMMITTEE_COMPLETED: "ועדה הסתיימה",
  DECISION_RECEIVED: "התקבלה החלטה", APPEAL_CONSIDERATION: "שקילת ערעור",
  APPEAL_FILED: "ערעור הוגש", RIGHTS_FULFILLMENT: "מימוש זכויות",
};

function StageUpdateToast({ stageId, onDismiss }) {
  const { saveLegalCase, legalCase } = useUser();
  if (!stageId || !legalCase) return null;

  async function handleUpdate() {
    await saveLegalCase({ stage: stageId });
    onDismiss();
  }

  return (
    <div className="stage-toast">
      <div className="stage-toast-content">
        <span>עדכון שלב: <strong>{STAGE_LABELS_MAP[stageId]}</strong></span>
        <div className="stage-toast-btns">
          <button className="stage-toast-yes" onClick={handleUpdate}>עדכן</button>
          <button className="stage-toast-no" onClick={onDismiss}>לא עכשיו</button>
        </div>
      </div>
    </div>
  );
}

// ─── LegalCaseView ──────────────────────────────────────────

function LegalCaseView({ legalStages, committeePrepData, injuryProfiles, onAskDan }) {
  const { user, legalCase, caseReminders, saveLegalCase, dismissReminder, signInWithGoogle } = useUser();
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState({ injury_types: [], stage: "NOT_STARTED", committee_date: "", representative_name: "", representative_phone: "", representative_org: "" });
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [prepChecked, setPrepChecked] = useState({});

  // Load prep checklist from localStorage
  useEffect(() => {
    if (legalCase?.id) {
      try {
        const saved = localStorage.getItem(`magen-prep-${legalCase.id}`);
        if (saved) setPrepChecked(JSON.parse(saved));
      } catch {}
    }
  }, [legalCase?.id]);

  function togglePrepTask(taskId) {
    setPrepChecked(prev => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      if (legalCase?.id) {
        try { localStorage.setItem(`magen-prep-${legalCase.id}`, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }

  // Not logged in
  if (!user) {
    return (
      <div className="case-section">
        <div className="pg-hdr">
          <h1>התיק שלי</h1>
          <p>ליווי אישי בתהליך המשפטי</p>
        </div>
        <div className="case-login-prompt">
          <div className="case-login-icon">⚖</div>
          <p>התחבר כדי לנהל את התיק המשפטי שלך</p>
          <button className="auth-btn google" onClick={signInWithGoogle}>
            <span>G</span> התחבר עם Google
          </button>
        </div>
      </div>
    );
  }

  // No case — creation wizard
  if (!legalCase) {
    const INJURY_OPTIONS = [
      { id: "orthopedic", label: "אורתופדית", icon: "🦴" },
      { id: "neurological", label: "נוירולוגית", icon: "🧠" },
      { id: "ptsd", label: "פוסט-טראומה", icon: "💜" },
      { id: "hearing", label: "שמיעה/טינטון", icon: "👂" },
      { id: "internal", label: "פנימית", icon: "🫀" },
      { id: "other", label: "אחר", icon: "📋" },
    ];

    async function handleWizardSubmit() {
      const fields = { ...wizardData };
      if (!fields.committee_date) delete fields.committee_date;
      if (!fields.representative_name) delete fields.representative_name;
      if (!fields.representative_phone) delete fields.representative_phone;
      if (!fields.representative_org) delete fields.representative_org;
      await saveLegalCase(fields);
    }

    return (
      <div className="case-section">
        <div className="pg-hdr">
          <h1>התיק שלי</h1>
          <p>בוא נפתח תיק ונתחיל ללוות אותך</p>
        </div>
        <div className="case-wizard">
          {wizardStep === 0 && (
            <div className="wizard-step">
              <h3>מה סוגי הפגיעה? (אפשר לבחור כמה)</h3>
              <div className="wizard-options">
                {INJURY_OPTIONS.map(o => (
                  <button key={o.id} className={`wizard-opt ${wizardData.injury_types.includes(o.id) ? "selected" : ""}`}
                    onClick={() => setWizardData(d => ({
                      ...d,
                      injury_types: d.injury_types.includes(o.id)
                        ? d.injury_types.filter(t => t !== o.id)
                        : [...d.injury_types, o.id]
                    }))}>
                    <span className="wizard-opt-icon">{o.icon}</span>
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
              <button className="wizard-next" disabled={wizardData.injury_types.length === 0} onClick={() => setWizardStep(1)}>המשך →</button>
            </div>
          )}
          {wizardStep === 1 && (
            <div className="wizard-step">
              <h3>באיזה שלב אתה?</h3>
              <div className="wizard-stages">
                {legalStages.map(s => (
                  <button key={s.id} className={`wizard-stage ${wizardData.stage === s.id ? "selected" : ""}`}
                    onClick={() => setWizardData(d => ({ ...d, stage: s.id }))}>
                    <span className="wizard-stage-icon">{s.icon}</span>
                    <div>
                      <div className="wizard-stage-label">{s.label}</div>
                      <div className="wizard-stage-desc">{s.description}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="wizard-nav">
                <button className="wizard-back" onClick={() => setWizardStep(0)}>← חזור</button>
                <button className="wizard-next" onClick={() => setWizardStep(2)}>המשך →</button>
              </div>
            </div>
          )}
          {wizardStep === 2 && (
            <div className="wizard-step">
              <h3>פרטים נוספים (אופציונלי)</h3>
              <label className="wizard-field">
                <span>תאריך ועדה (אם נקבע)</span>
                <input type="date" value={wizardData.committee_date} onChange={e => setWizardData(d => ({ ...d, committee_date: e.target.value }))} />
              </label>
              <label className="wizard-field">
                <span>שם המייצג</span>
                <input type="text" placeholder="עו״ד / ארגון" value={wizardData.representative_name} onChange={e => setWizardData(d => ({ ...d, representative_name: e.target.value }))} />
              </label>
              <label className="wizard-field">
                <span>טלפון המייצג</span>
                <input type="tel" placeholder="050-0000000" value={wizardData.representative_phone} onChange={e => setWizardData(d => ({ ...d, representative_phone: e.target.value }))} />
              </label>
              <label className="wizard-field">
                <span>ארגון מייצג</span>
                <input type="text" placeholder="ארגון נכי צה״ל / אחר" value={wizardData.representative_org} onChange={e => setWizardData(d => ({ ...d, representative_org: e.target.value }))} />
              </label>
              <div className="wizard-nav">
                <button className="wizard-back" onClick={() => setWizardStep(1)}>← חזור</button>
                <button className="wizard-next wizard-submit" onClick={handleWizardSubmit}>פתח תיק</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Case exists — show dashboard ---
  const currentStage = legalStages.find(s => s.id === legalCase.stage) || legalStages[0];
  const currentStageIdx = legalStages.findIndex(s => s.id === legalCase.stage);

  // Committee countdown
  let daysToCommittee = null;
  if (legalCase.committee_date) {
    const today = new Date(); today.setHours(0,0,0,0);
    const cd = new Date(legalCase.committee_date + "T00:00:00");
    daysToCommittee = Math.round((cd - today) / 86400000);
  }

  // Current prep phase
  let currentPrepPhase = null;
  if (daysToCommittee !== null && daysToCommittee >= -30 && daysToCommittee <= 21) {
    for (const phase of committeePrepData.phases) {
      if (daysToCommittee <= phase.daysRange[0] && daysToCommittee >= phase.daysRange[1]) {
        currentPrepPhase = phase;
        break;
      }
    }
    // If between phases, show the closest applicable
    if (!currentPrepPhase && daysToCommittee >= 0) {
      currentPrepPhase = committeePrepData.phases.find(p => daysToCommittee <= p.daysRange[0]) || committeePrepData.phases[0];
    }
    if (!currentPrepPhase && daysToCommittee < 0) {
      currentPrepPhase = committeePrepData.phases[committeePrepData.phases.length - 1];
    }
  }

  // Injury profiles (multiple)
  const activeInjuryTypes = legalCase.injury_types || (legalCase.injury_type ? [legalCase.injury_type] : []);
  const activeInjuryProfiles = activeInjuryTypes
    .map(t => ({ type: t, ...(injuryProfiles[t] || {}) }))
    .filter(p => p.label);

  // Edit modal
  async function handleEditSave() {
    await saveLegalCase(editData);
    setEditMode(false);
  }

  function openEdit() {
    setEditData({
      stage: legalCase.stage,
      injury_types: legalCase.injury_types || (legalCase.injury_type ? [legalCase.injury_type] : []),
      committee_date: legalCase.committee_date || "",
      disability_percent: legalCase.disability_percent ?? "",
      representative_name: legalCase.representative_name || "",
      representative_phone: legalCase.representative_phone || "",
      representative_org: legalCase.representative_org || "",
      notes: legalCase.notes || "",
    });
    setEditMode(true);
  }

  return (
    <div className="case-section">
      <div className="pg-hdr">
        <h1>התיק שלי</h1>
        <p>ליווי אישי בתהליך המשפטי</p>
      </div>

      {/* Timeline */}
      <div className="stage-timeline">
        {legalStages.map((s, i) => (
          <div key={s.id} className={`stage-node ${i === currentStageIdx ? "active" : ""} ${i < currentStageIdx ? "done" : ""}`}>
            <div className="stage-circle">{s.icon}</div>
            <div className="stage-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Current stage info */}
      <div className="case-card">
        <div className="case-card-header">
          <span className="case-card-icon">{currentStage.icon}</span>
          <div>
            <h3>{currentStage.label}</h3>
            <p className="case-card-desc">{currentStage.description}</p>
          </div>
        </div>
        <div className="case-next-action">
          <strong>הצעד הבא:</strong> {currentStage.nextAction}
        </div>
      </div>

      {/* Countdown */}
      {daysToCommittee !== null && daysToCommittee >= 0 && (
        <div className="countdown-card">
          <div className="countdown-number">{daysToCommittee}</div>
          <div className="countdown-text">ימים לוועדה</div>
          <div className="countdown-date">{formatDate(legalCase.committee_date)}</div>
        </div>
      )}
      {daysToCommittee !== null && daysToCommittee < 0 && daysToCommittee >= -30 && (
        <div className="countdown-card countdown-past">
          <div className="countdown-number">{Math.abs(daysToCommittee)}</div>
          <div className="countdown-text">ימים אחרי הוועדה</div>
        </div>
      )}

      {/* Prep Checklist */}
      {currentPrepPhase && (
        <div className="prep-section">
          <h3 className="prep-title">{currentPrepPhase.label} — הכנה לוועדה</h3>
          <p className="prep-desc">{currentPrepPhase.description}</p>
          <div className="prep-tasks">
            {currentPrepPhase.tasks.map(task => (
              <div key={task.id} className={`prep-task ${prepChecked[task.id] ? "checked" : ""}`}>
                <label className="prep-check-label">
                  <input type="checkbox" checked={!!prepChecked[task.id]} onChange={() => togglePrepTask(task.id)} />
                  <span className="prep-task-title">{task.title}</span>
                </label>
                <p className="prep-task-desc">{task.description}</p>
                <button className="prep-ask-btn" onClick={() => onAskDan(task.aiHelpPrompt)}>שאל את דן →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Injury Tips */}
      {activeInjuryProfiles.length > 0 && activeInjuryProfiles.map(ip => (
        <div className="injury-tips" key={ip.type}>
          <h3>טיפים — פגיעה {ip.label}</h3>
          <div className="tip-boxes">
            <div className="tip-box">
              <h4>טיפים חשובים</h4>
              <ul>{ip.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
            <div className="tip-box tip-box-warn">
              <h4>טעויות נפוצות — להימנע!</h4>
              <ul>{ip.commonMistakes.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
            <div className="tip-box">
              <h4>בדיקות רלוונטיות</h4>
              <ul>{ip.relevantTests.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
            <div className="tip-box">
              <h4>רופאים מומלצים</h4>
              <ul>{ip.keyDoctors.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          </div>
        </div>
      ))}

      {/* Reminders */}
      {caseReminders.length > 0 && (
        <div className="case-reminders">
          <h3>תזכורות</h3>
          {caseReminders.map(r => (
            <div key={r.id} className="reminder-card">
              <div className="reminder-header">
                <span className="reminder-type">{r.type === "committee_prep" ? "📅" : r.type === "deadline" ? "⏰" : r.type === "tip" ? "💡" : r.type === "encouragement" ? "💪" : "🏆"}</span>
                <strong>{r.title}</strong>
                <button className="reminder-dismiss" onClick={() => dismissReminder(r.id)}>✕</button>
              </div>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Edit button */}
      <button className="case-edit-btn" onClick={openEdit}>✏ עריכת פרטי התיק</button>

      {/* Edit Modal */}
      {editMode && (
        <div className="case-modal-overlay" onClick={() => setEditMode(false)}>
          <div className="case-modal" onClick={e => e.stopPropagation()}>
            <h3>עריכת תיק</h3>
            <label className="wizard-field">
              <span>שלב נוכחי</span>
              <select value={editData.stage} onChange={e => setEditData(d => ({ ...d, stage: e.target.value }))}>
                {legalStages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <div className="wizard-field">
              <span>סוגי פגיעה</span>
              <div className="edit-injury-grid">
                {[
                  { id: "orthopedic", label: "אורתופדית" },
                  { id: "neurological", label: "נוירולוגית" },
                  { id: "ptsd", label: "פוסט-טראומה" },
                  { id: "hearing", label: "שמיעה/טינטון" },
                  { id: "internal", label: "פנימית" },
                  { id: "other", label: "אחר" },
                ].map(o => (
                  <label key={o.id} className={`edit-injury-opt ${(editData.injury_types || []).includes(o.id) ? "selected" : ""}`}>
                    <input type="checkbox" checked={(editData.injury_types || []).includes(o.id)} onChange={() => setEditData(d => ({
                      ...d,
                      injury_types: (d.injury_types || []).includes(o.id)
                        ? (d.injury_types || []).filter(t => t !== o.id)
                        : [...(d.injury_types || []), o.id]
                    }))} />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="wizard-field">
              <span>תאריך ועדה</span>
              <input type="date" value={editData.committee_date} onChange={e => setEditData(d => ({ ...d, committee_date: e.target.value }))} />
            </label>
            <label className="wizard-field">
              <span>אחוזי נכות</span>
              <input type="number" min="0" max="100" value={editData.disability_percent} onChange={e => setEditData(d => ({ ...d, disability_percent: e.target.value ? parseInt(e.target.value) : "" }))} />
            </label>
            <label className="wizard-field">
              <span>שם המייצג</span>
              <input type="text" value={editData.representative_name} onChange={e => setEditData(d => ({ ...d, representative_name: e.target.value }))} />
            </label>
            <label className="wizard-field">
              <span>טלפון המייצג</span>
              <input type="tel" value={editData.representative_phone} onChange={e => setEditData(d => ({ ...d, representative_phone: e.target.value }))} />
            </label>
            <label className="wizard-field">
              <span>ארגון מייצג</span>
              <input type="text" value={editData.representative_org} onChange={e => setEditData(d => ({ ...d, representative_org: e.target.value }))} />
            </label>
            <label className="wizard-field">
              <span>הערות</span>
              <textarea value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} rows={3} />
            </label>
            <div className="wizard-nav">
              <button className="wizard-back" onClick={() => setEditMode(false)}>ביטול</button>
              <button className="wizard-next wizard-submit" onClick={handleEditSave}>שמור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────

export default function Home({ rights, updates, events, legalStages, committeePrepData, injuryProfiles }) {
  const { userRights: homeUserRights } = useUser();
  const [view,      setView]      = useState("chat");
  const [chatHat,   setChatHat]   = useState(null);
  const pendingChatPromptRef = useRef(null);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [openId,    setOpenId]    = useState(null);
  const [rCat,      setRCat]      = useState("הכל");
  const [rSearch,   setRSearch]   = useState("");
  const [eCity,     setECity]     = useState("הכל");
  const [eCat,      setECat]      = useState("הכל");
  const [eOrg,      setEOrg]      = useState("הכל");
  const [showPast,  setShowPast]  = useState(false);
  const [rStatusFilter, setRStatusFilter] = useState("all"); // "all" or "not_started"
  const [stageToast, setStageToast] = useState(null);

  const today = new Date().toISOString().split("T")[0];

  // Organizers that actually have events
  const orgCounts = {};
  events.forEach(e => { if (e.organizer) orgCounts[e.organizer] = (orgCounts[e.organizer]||0)+1; });
  const activeOrgs = ORGANIZERS.filter(o => o === "הכל" || orgCounts[o]);

  const filteredRights = rights
    .filter(r => rCat === "הכל" || r.category === rCat)
    .filter(r => !rSearch || r.title.includes(rSearch) || r.summary.includes(rSearch))
    .filter(r => rStatusFilter === "all" || !homeUserRights[r.id] || homeUserRights[r.id] === "not_started")
    .sort((a,b) => ({high:0,medium:1,low:2}[a.urgency] - {high:0,medium:1,low:2}[b.urgency]));

  const filteredEvents = events
    .filter(e => eCity === "הכל" || e.city === eCity || e.city === "כלל הארץ")
    .filter(e => eCat  === "הכל" || e.category === eCat)
    .filter(e => eOrg  === "הכל" || e.organizer === eOrg)
    .filter(e => showPast ? true : e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date));

  const upcomingCount = events.filter(e => e.date >= today).length;

  function showUnstartedRights() {
    setView("rights");
    setRStatusFilter("not_started");
    setRCat("הכל");
    setRSearch("");
  }

  const NAV = [
    { id:"chat",    icon:"◇", label:"יועץ AI" },
    { id:"case",    icon:"⚖", label:"התיק שלי" },
    { id:"rights",  icon:"◫", label:"זכויות" },
    { id:"tips",    icon:"💡", label:"צעדים ראשונים" },
    { id:"events",  icon:"◉", label:"אירועים", badge: upcomingCount||null },
    { id:"knowledge", icon:"🎖", label:"חכמת ותיקים" },
    { id:"updates", icon:"◎", label:"עדכונים", badge: updates.length||null },
  ];

  // SVG favicon (shield)
  const faviconSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#f4a24e"/><stop offset="100%" stop-color="#e8734a"/></linearGradient></defs><path d="M32 4 L56 14 L56 30 C56 44 46 54 32 60 C18 54 8 44 8 30 L8 14 Z" fill="url(#g)"/><path d="M32 8 L52 16 L52 30 C52 42 44 51 32 56 C20 51 12 42 12 30 L12 16 Z" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/></svg>`)}`;

  return (
    <>
      <Head>
        <title>שיט.קום — זכויות פצועי צה״ל</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <meta name="description" content="מרכז זכויות, אירועים ויועץ AI לפצועי צה״ל"/>
        <link rel="icon" href={faviconSvg} type="image/svg+xml"/>
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
      </Head>

      <div className="root" dir="rtl">

        {/* ── Mobile Header ── */}
        <div className="mobile-header">
          <div className="logo-icon-row">
            <svg className="logo-svg" viewBox="0 0 36 36" width="24" height="24">
              <defs><linearGradient id="mlg" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stopColor="#f4a24e"/><stop offset="100%" stopColor="#e8734a"/></linearGradient></defs>
              <path d="M18 2 L32 8 L32 17 C32 25 26 31 18 34 C10 31 4 25 4 17 L4 8 Z" fill="url(#mlg)"/>
              <path d="M18 4.5 L30 10 L30 17 C30 24 25 29.5 18 32 C11 29.5 6 24 6 17 L6 10 Z" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8"/>
            </svg>
            <div className="logo-main">שיט<span className="logo-en">.קום</span></div>
          </div>
          <button className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="פתח תפריט">
            <span/><span/><span/>
          </button>
        </div>

        {/* ── Mobile Overlay ── */}
        {menuOpen && <div className="mobile-overlay" onClick={() => setMenuOpen(false)}/>}

        {/* ── Mobile Side Menu ── */}
        <div className={`mobile-menu ${menuOpen ? "open" : ""}`}>
          <button className="mobile-menu-close" onClick={() => setMenuOpen(false)}>✕</button>
          <nav className="mobile-nav">
            {NAV.map(n => (
              <button key={n.id} className={`nav-btn ${view===n.id?"active":""}`} onClick={() => { setView(n.id); setMenuOpen(false); }}>
                <span className="nav-icon">{n.icon}</span>
                <span className="nav-lbl">{n.label}</span>
                {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className="mobile-menu-profile">
            <SidebarProfile rights={rights} onShowUnstarted={showUnstartedRights} />
          </div>
          <div className="mobile-menu-footer">
            <a href="tel:*6500" className="hotline">📞 מוקד פצועים <strong>*6500</strong></a>
            <a href="tel:*8944" className="hotline red">🆘 נפש אחת <strong>*8944</strong></a>
            <a href="https://shikum.mod.gov.il" target="_blank" rel="noopener noreferrer" className="hotline personal-area">🏢 האזור האישי שלי</a>
            <a href="https://mod.gov.il/" target="_blank" rel="noopener noreferrer" className="hotline">🌐 אגף השיקום</a>
            <button className="hotline feedback-btn" onClick={() => { setFeedbackOpen(true); setMenuOpen(false); }}>💬 רעיונות לשימור/שיפור?</button>
            <button className="hotline terms-link" onClick={() => { setView("terms"); setMenuOpen(false); }}>📋 תנאי שימוש</button>
          </div>
        </div>

        {/* ── Fixed avatar (top-left corner, desktop only) ── */}
        <div className="fixed-avatar-wrap">
          <SidebarProfile mini rights={rights} onShowUnstarted={showUnstartedRights} onFeedback={() => setFeedbackOpen(true)} onTerms={() => setView("terms")} onProfile={() => setView("profile")} />
        </div>

        {/* ── Sidebar (desktop) — mini icon-only ── */}
        <aside className="sidebar">
          <div className="logo-mini">
            <svg className="logo-svg" viewBox="0 0 36 36" width="28" height="28">
              <defs><linearGradient id="lg" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stopColor="#f4a24e"/><stop offset="100%" stopColor="#e8734a"/></linearGradient></defs>
              <path d="M18 2 L32 8 L32 17 C32 25 26 31 18 34 C10 31 4 25 4 17 L4 8 Z" fill="url(#lg)"/>
              <path d="M18 4.5 L30 10 L30 17 C30 24 25 29.5 18 32 C11 29.5 6 24 6 17 L6 10 Z" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8"/>
            </svg>
            <div className="logo-mini-text">שיט.קום</div>
          </div>

          <nav>
            {NAV.map(n => (
              <button key={n.id} className={`nav-btn ${view===n.id?"active":""}`} onClick={()=>setView(n.id)} data-tooltip={n.label}>
                <span className="nav-icon">{n.icon}</span>
                {n.badge ? <span className="nav-badge-dot"/> : null}
              </button>
            ))}
          </nav>

          <div className="sb-footer">
            <a href="tel:*6500" className="sb-footer-icon" data-tooltip="מוקד פצועים *6500">📞</a>
            <a href="tel:*8944" className="sb-footer-icon red" data-tooltip="נפש אחת *8944">🆘</a>
            <button className="sb-footer-icon" data-tooltip="רעיונות לשימור/שיפור?" onClick={() => setFeedbackOpen(true)}>💬</button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main">

          {/* PROFILE */}
          {view==="profile" && <ProfileView rights={rights} onNavigateToRight={(rightId) => {
            setView("rights");
            setRStatusFilter("all");
            if (rightId) setOpenId(rightId);
          }} />}

          {/* TIPS */}
          {view==="tips" && <TipsView />}

          {/* TERMS */}
          {view==="terms" && <TermsView />}

          {/* RIGHTS */}
          {view==="rights" && <>
            <div className="pg-hdr">
              <h1>זכויות והטבות</h1>
              <p>{rights.length} זכויות מרכזיות • מתעדכן אוטומטית</p>
            </div>
            {rStatusFilter === "not_started" && (
              <div className="filter-banner">
                מציג רק זכויות שטרם בדקת
                <button className="filter-banner-clear" onClick={() => setRStatusFilter("all")}>הצג הכל ✕</button>
              </div>
            )}
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

          {/* KNOWLEDGE */}
          {view==="knowledge" && <KnowledgeView />}

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
          {/* CASE */}
          {view==="case" && <LegalCaseView
            legalStages={legalStages}
            committeePrepData={committeePrepData}
            injuryProfiles={injuryProfiles}
            onAskDan={(prompt) => { pendingChatPromptRef.current = prompt; setView("chat"); }}
          />}

          {view==="chat" && <>
            {chatHat === null && !pendingChatPromptRef.current ? (
              <>
                <div className="pg-hdr">
                  <h1>יועץ AI אישי</h1>
                  <p>פרטי, אקטיבי, בשבילך</p>
                </div>
                <WelcomeScreen onSelect={(hatId) => setChatHat(hatId)} />
              </>
            ) : (
              <>
                <div className="pg-hdr">
                  <h1>יועץ AI אישי</h1>
                  <p>דן · מיכל · אורי · רועי · שירה — פרטי, אקטיבי, בשבילך</p>
                </div>
                <Chat rights={rights} events={events} pendingChatPromptRef={pendingChatPromptRef} initialHat={chatHat || "lawyer"} onBack={() => setChatHat(null)} onStageUpdate={(stageId) => {
                  setStageToast(stageId);
                }}/>
              </>
            )}
          </>}

        </main>
      </div>

      <ProfileSettingsPanel />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <StageUpdateToast stageId={stageToast} onDismiss={() => setStageToast(null)} />

      <style jsx global>{`
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
        body { background:#0c1018; color:#eef1f6; font-family:'Heebo',sans-serif; letter-spacing:.2px; }
        ::selection { background:rgba(244,162,78,.3); color:#fff; }
        * { scrollbar-width:thin; scrollbar-color:#2a3545 transparent; }
        *::-webkit-scrollbar { width:6px; height:6px; }
        *::-webkit-scrollbar-track { background:transparent; }
        *::-webkit-scrollbar-thumb { background:#2a3545; border-radius:3px; }
        *::-webkit-scrollbar-thumb:hover { background:#3a4555; }

        /* ── Layout ── */
        .root { display:flex; min-height:100vh; }

        /* ── Sidebar (mini — icons only) ── */
        .sidebar {
          width:64px; flex-shrink:0; background:#111820; border-left:1px solid #1e2835;
          display:flex; flex-direction:column; align-items:center; padding:16px 8px;
          position:sticky; top:0; height:100vh; overflow:visible; z-index:100;
        }
        .logo-mini { margin-bottom:20px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; }
        .logo-mini-text { font-size:9px; font-weight:700; color:#e8734a; letter-spacing:.5px; }
        .logo-icon-row { display:flex; align-items:center; gap:10px; }
        .logo-svg { flex-shrink:0; }
        .logo-main { font-size:30px; font-weight:900; color:#e8734a; letter-spacing:-1px; line-height:1; }
        .logo-en { font-size:10px; font-weight:700; color:rgba(232,115,74,.35); letter-spacing:4px; margin-right:8px; vertical-align:middle; }
        .logo-sub { font-size:10.5px; color:#6b7a8d; margin-top:6px; letter-spacing:.5px; }
        nav { display:flex; flex-direction:column; gap:4px; flex:1; align-items:center; }
        .nav-btn {
          position:relative; width:40px; height:40px; display:flex; align-items:center; justify-content:center;
          border-radius:12px; border:none; background:transparent; color:#8a95a7;
          font-family:'Heebo',sans-serif; font-size:14px; cursor:pointer; transition:all .2s ease;
        }
        .nav-btn:hover { background:rgba(244,162,78,.08); color:#d0d8e4; }
        .nav-btn.active { background:rgba(244,162,78,.12); color:#f4a24e; }
        .nav-icon { font-size:17px; opacity:.7; }
        .nav-btn.active .nav-icon { opacity:1; }
        .nav-lbl { display:none; }

        /* Tooltip for nav buttons (RTL — tooltip appears to the left, towards content) */
        .nav-btn::after {
          content:attr(data-tooltip); position:absolute; right:calc(100% + 10px); top:50%; transform:translateY(-50%);
          background:#1e2835; color:#eef1f6; font-size:12.5px; font-weight:600; padding:6px 12px;
          border-radius:8px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .15s ease;
          box-shadow:0 4px 12px rgba(0,0,0,.3); z-index:9999;
        }
        .nav-btn:hover::after { opacity:1; }

        /* Badge dot */
        .nav-badge-dot {
          position:absolute; top:6px; left:6px; width:8px; height:8px;
          background:linear-gradient(135deg,#e8734a,#f4a24e); border-radius:50%;
          border:2px solid #111820;
        }
        /* Full badge (mobile menu) */
        .nav-badge { background:linear-gradient(135deg,#e8734a,#f4a24e); color:#fff; font-size:10px; font-weight:700; padding:2px 7px; border-radius:20px; }

        /* ── Fixed Avatar (top-left corner) ── */
        .fixed-avatar-wrap { position:fixed; top:28px; left:28px; z-index:9999; }

        /* ── Sidebar Avatar (mini) ── */
        .sb-avatar-wrap { position:relative; }
        .sb-mini-avatar {
          width:44px; height:44px; border-radius:50%;
          background:linear-gradient(135deg,#e8734a,#f4a24e);
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          font-weight:700; color:#fff; font-size:16px; overflow:hidden;
          border:2px solid transparent; cursor:pointer; transition:all .2s ease;
          box-shadow:0 2px 12px rgba(232,115,74,.3);
        }
        .sb-mini-avatar:hover { transform:scale(1.08); }
        .sb-mini-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
        .sb-mini-avatar.anon {
          background:linear-gradient(135deg,#2a3444,#1e2835);
          border:1.5px solid #3a4555; color:#8a95a7; font-size:18px;
          box-shadow:0 2px 12px rgba(0,0,0,.3);
        }
        .sb-mini-avatar.anon:hover { border-color:#f4a24e; }

        /* ── Sidebar Popup ── */
        .sb-popup {
          position:absolute; left:0; top:calc(100% + 10px);
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:18px 20px; min-width:260px; z-index:9999;
          box-shadow:0 8px 32px rgba(0,0,0,.4); animation:fadeIn .15s ease;
        }
        .sb-popup-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .sb-popup-links { display:flex; flex-direction:column; gap:2px; margin-top:12px; border-top:1px solid #1e2835; padding-top:10px; }
        .sb-popup-link {
          display:block; padding:8px 10px; border-radius:8px; font-size:13px; color:#8a95a7;
          text-decoration:none; background:none; border:none; font-family:'Heebo',sans-serif;
          cursor:pointer; text-align:right; transition:all .15s ease;
        }
        .sb-popup-link:hover { background:rgba(244,162,78,.06); color:#d0d8e4; }
        .sb-popup-detail { font-size:12px; color:#6b7a8d; margin-top:2px; }
        .sb-popup-status { font-size:12.5px; color:#8a95a7; padding:6px 0; border-bottom:1px solid #1e2835; margin-bottom:4px; }
        .sb-popup-stats { display:flex; gap:8px; margin:10px 0 6px; }
        .sb-popup-stat { flex:1; text-align:center; background:#0c1018; border-radius:8px; padding:8px 4px; }
        .sb-popup-stat-num { display:block; font-size:18px; font-weight:900; color:#6b7a8d; }
        .sb-popup-stat-num.done { color:#34d399; }
        .sb-popup-stat-num.prog { color:#f4a24e; }
        .sb-popup-stat-label { font-size:10px; color:#556070; }

        /* ── Sidebar Profile ── */
        .sb-profile-zone { padding:14px 0; border-top:1px solid #1e2835; border-bottom:1px solid #1e2835; margin-bottom:10px; width:100%; }
        .connect-btn {
          width:100%; padding:12px; border-radius:10px; border:1px solid rgba(244,162,78,.3);
          background:rgba(244,162,78,.08); color:#f4a24e; font-family:'Heebo',sans-serif;
          font-size:13.5px; font-weight:600; cursor:pointer; transition:all .2s ease;
        }
        .connect-btn:hover { background:rgba(244,162,78,.15); border-color:#f4a24e; }
        .auth-providers { display:flex; flex-direction:column; gap:8px; }
        .auth-btn {
          width:100%; padding:10px 14px; border-radius:8px; border:1px solid #2a3545;
          background:#161e28; color:#d0d8e4; font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px;
          justify-content:center; transition:all .2s ease;
        }
        .auth-btn:hover { background:#1a2430; border-color:#3a4555; }
        .auth-btn.google { border-color:rgba(66,133,244,.3); }
        .auth-btn.google:hover { background:rgba(66,133,244,.08); }
        .auth-btn.apple { border-color:rgba(255,255,255,.15); }
        .auth-close { background:transparent; border:none; color:#6b7a8d; font-size:12px; font-family:'Heebo',sans-serif; cursor:pointer; padding:4px; }
        .profile-header { display:flex; align-items:center; gap:10px; }
        .profile-avatar {
          width:36px; height:36px; border-radius:50%; background:rgba(244,162,78,.15);
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          font-weight:700; color:#f4a24e; font-size:14px; overflow:hidden;
        }
        .profile-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
        .profile-name { flex:1; font-size:13.5px; font-weight:600; color:#d0d8e4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .profile-settings-btn {
          background:transparent; border:none; color:#6b7a8d; font-size:16px; cursor:pointer;
          padding:4px 6px; border-radius:6px; transition:all .2s ease;
        }
        .profile-settings-btn:hover { color:#d0d8e4; background:rgba(255,255,255,.05); }
        .progress-section { margin-top:10px; }
        .progress-label { font-size:11px; color:#8a95a7; margin-bottom:4px; }
        .progress-bar { height:6px; background:#1e2835; border-radius:3px; overflow:hidden; }
        .progress-fill { height:100%; background:linear-gradient(90deg,#e8734a,#f4a24e); border-radius:3px; transition:width .5s ease; }
        .nudge { font-size:11.5px; color:#f4a24e; margin-top:8px; }
        .nudge-btn {
          background:none; border:none; font-family:'Heebo',sans-serif; cursor:pointer;
          padding:0; text-decoration:underline; text-underline-offset:2px;
        }
        .nudge-btn:hover { color:#e8734a; }
        .signout-link {
          background:none; border:none; color:#6b7a8d; font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; margin-top:8px; padding:0;
          text-decoration:underline; text-underline-offset:2px;
        }
        .signout-link:hover { color:#e05252; }

        /* ── Settings Panel ── */
        .settings-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:1000;
          display:flex; align-items:center; justify-content:center;
          animation:fadeIn .2s ease;
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .settings-panel {
          background:#141c26; border:1px solid #1e2835; border-radius:16px;
          padding:28px 32px; width:360px; max-width:90vw; max-height:80vh; overflow-y:auto;
        }
        .settings-panel h3 { font-size:18px; font-weight:700; color:#f0ece4; margin-bottom:20px; }
        .settings-label { display:block; font-size:12.5px; color:#8a95a7; margin:12px 0 6px; font-weight:600; }
        .settings-select, .settings-input {
          width:100%; padding:10px 14px; background:#0c1018; border:1px solid #1e2835;
          border-radius:8px; color:#eef1f6; font-family:'Heebo',sans-serif; font-size:14px;
          direction:rtl; outline:none;
        }
        .settings-select:focus, .settings-input:focus { border-color:#f4a24e; }
        .interest-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:4px; }
        .interest-chip {
          padding:6px 14px; border-radius:20px; border:1px solid #1e2835;
          background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; transition:all .2s ease;
        }
        .interest-chip:hover { border-color:rgba(244,162,78,.4); color:#d0d8e4; }
        .interest-chip.on { background:rgba(244,162,78,.12); border-color:#f4a24e; color:#f4a24e; font-weight:700; }
        .settings-actions { display:flex; gap:10px; margin-top:20px; }
        .save-btn {
          flex:1; padding:11px; border-radius:8px; border:none;
          background:linear-gradient(135deg,#e8734a,#f4a24e); color:#fff;
          font-family:'Heebo',sans-serif; font-size:14px; font-weight:700; cursor:pointer;
          transition:all .2s ease;
        }
        .save-btn:hover:not(:disabled) { transform:scale(1.02); box-shadow:0 4px 16px rgba(244,162,78,.3); }
        .save-btn:disabled { opacity:.6; cursor:not-allowed; }
        .signout-btn {
          padding:11px 20px; border-radius:8px; border:1px solid #2a3545;
          background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer; transition:all .2s ease;
        }
        .signout-btn:hover { color:#e05252; border-color:#e05252; }

        /* Feedback */
        .feedback-btn { cursor:pointer; border:none; text-align:right; font-family:'Heebo',sans-serif; width:100%; }
        .feedback-textarea {
          width:100%; padding:12px 14px; background:#0c1018; border:1px solid #1e2835;
          border-radius:8px; color:#eef1f6; font-family:'Heebo',sans-serif; font-size:14px;
          direction:rtl; outline:none; resize:vertical; min-height:80px; line-height:1.6;
        }
        .feedback-textarea:focus { border-color:#f4a24e; }
        .feedback-textarea::placeholder { color:#556070; }
        .feedback-contact { display:flex; gap:8px; margin-top:10px; }
        .feedback-input { flex:1; padding:8px 12px !important; font-size:13px !important; }

        /* User top avatar */
        .user-top-btn {
          position:fixed; top:40px; left:40px; z-index:60;
          background:none; border:none; cursor:pointer; padding:0;
        }
        .user-top-avatar {
          width:40px; height:40px; border-radius:50%;
          background:linear-gradient(135deg,#e8734a,#f4a24e);
          display:flex; align-items:center; justify-content:center;
          font-weight:700; color:#fff; font-size:16px; overflow:hidden;
          box-shadow:0 2px 12px rgba(232,115,74,.3);
          transition:transform .2s ease;
        }
        .user-top-btn:hover .user-top-avatar { transform:scale(1.08); }
        .user-top-avatar.anon {
          background:linear-gradient(135deg,#2a3444,#1e2835);
          border:1.5px solid #3a4555; box-shadow:0 2px 12px rgba(0,0,0,.3);
          font-size:18px;
        }
        .user-top-btn:hover .user-top-avatar.anon { border-color:#f4a24e; }
        .user-top-avatar img { width:40px; height:40px; min-width:40px; min-height:40px; object-fit:cover; border-radius:50%; display:block; }

        /* Profile view */
        .profile-card {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:24px 28px; margin-bottom:20px;
        }
        .profile-card-header { display:flex; align-items:center; gap:16px; }
        .profile-big-avatar {
          width:56px; height:56px; border-radius:50%; flex-shrink:0;
          background:linear-gradient(135deg,#e8734a,#f4a24e);
          display:flex; align-items:center; justify-content:center;
          font-weight:700; color:#fff; font-size:22px; overflow:hidden;
        }
        .profile-big-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
        .profile-card-name { font-size:20px; font-weight:700; color:#f5f3ef; }
        .profile-card-detail { font-size:13px; color:#8a95a7; margin-top:4px; }
        .profile-edit-btn {
          margin-right:auto; padding:8px 16px; border-radius:8px;
          border:1px solid #1e2835; background:transparent; color:#8a95a7;
          font-family:'Heebo',sans-serif; font-size:13px; cursor:pointer;
          transition:all .2s ease;
        }
        .profile-edit-btn:hover { border-color:#f4a24e; color:#f4a24e; }
        .profile-section { margin-bottom:24px; }
        .profile-section-title { font-size:16px; font-weight:700; color:#f5f3ef; margin-bottom:12px; }
        .profile-section-sub { font-size:13px; color:#8a95a7; margin-bottom:10px; }
        .profile-stats { display:flex; gap:16px; margin-bottom:8px; }
        .profile-stat { text-align:center; flex:1; background:#141c26; border:1px solid #1e2835; border-radius:12px; padding:16px; }
        .profile-stat-num { font-size:28px; font-weight:900; color:#8a95a7; }
        .profile-stat-num.done { color:#34d399; }
        .profile-stat-num.prog { color:#f4a24e; }
        .profile-stat-label { font-size:12px; color:#6b7a8d; margin-top:4px; }
        .profile-right-item {
          display:flex; align-items:center; gap:10px; padding:12px 16px;
          background:#141c26; border:1px solid #1e2835; border-radius:10px;
          font-size:14px; color:#c2ccd8;
        }
        .profile-right-item.clickable { cursor:pointer; transition:all .2s ease; }
        .profile-right-item.clickable:hover { border-color:rgba(244,162,78,.3); background:#1a2430; transform:translateX(-2px); }
        .profile-right-item.prog { border-right:3px solid #f4a24e; }
        .profile-right-item.done { border-right:3px solid #34d399; }
        .profile-right-arrow { margin-right:auto; color:#f4a24e; font-size:16px; opacity:.6; }
        .profile-right-item.clickable:hover .profile-right-arrow { opacity:1; }
        .profile-check { margin-right:auto; color:#34d399; font-weight:700; }
        .profile-more { font-size:13px; color:#8a95a7; margin-top:8px; }
        .profile-more-btn {
          background:none; border:1px solid rgba(244,162,78,.2); border-radius:10px;
          padding:12px 16px; color:#f4a24e; font-family:'Heebo',sans-serif;
          font-size:13.5px; font-weight:600; cursor:pointer; width:100%;
          text-align:center; transition:all .2s ease;
        }
        .profile-more-btn:hover { background:rgba(244,162,78,.06); border-color:#f4a24e; }

        .sb-footer { border-top:1px solid #1e2835; padding-top:12px; display:flex; flex-direction:column; align-items:center; gap:6px; }

        /* Mini footer icons */
        .sb-footer-icon {
          position:relative; width:40px; height:40px; display:flex; align-items:center; justify-content:center;
          border-radius:12px; background:#161e28; border:none; font-size:16px;
          color:#8a95a7; text-decoration:none; cursor:pointer; transition:all .2s ease;
          font-family:'Heebo',sans-serif;
        }
        .sb-footer-icon:hover { background:#1a2430; color:#eef1f6; }
        .sb-footer-icon.red { color:#e8734a; }
        .sb-footer-icon.red:hover { background:rgba(224,82,82,.1); }
        .sb-footer-icon::after {
          content:attr(data-tooltip); position:absolute; right:calc(100% + 10px); top:50%; transform:translateY(-50%);
          background:#1e2835; color:#eef1f6; font-size:12.5px; font-weight:600; padding:6px 12px;
          border-radius:8px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .15s ease;
          box-shadow:0 4px 12px rgba(0,0,0,.3); z-index:9999;
        }
        .sb-footer-icon:hover::after { opacity:1; }

        /* Mobile menu hotlines (kept full) */
        .hotline {
          font-size:12px; padding:10px 12px; border-radius:8px; background:#161e28;
          color:#8a95a7; text-decoration:none; display:block; transition:all .2s ease;
        }
        .hotline:hover { color:#eef1f6; background:#1a2430; transform:translateX(-2px); }
        .hotline.red { color:#e8734a; }
        .hotline.personal-area { color:#6ab0f3; border:1px solid rgba(106,176,243,.15); background:rgba(106,176,243,.06); }
        .hotline.personal-area:hover { color:#8cc5ff; background:rgba(106,176,243,.12); }
        .terms-link { cursor:pointer; border:none; text-align:right; font-family:'Heebo',sans-serif; width:100%; color:#6b7a8d !important; }
        .terms-link:hover { color:#8a95a7 !important; }

        /* ── Main ── */
        .main { flex:1; padding:40px 48px; max-width:920px; overflow-y:auto; }
        .pg-hdr { margin-bottom:28px; }
        .pg-hdr h1 { font-size:28px; font-weight:900; letter-spacing:-.5px; color:#f5f3ef; }
        .pg-hdr p { font-size:13.5px; color:#8a95a7; margin-top:6px; line-height:1.6; }

        /* ── Filter banner ── */
        .filter-banner {
          display:flex; align-items:center; gap:12px; padding:10px 16px;
          background:rgba(244,162,78,.08); border:1px solid rgba(244,162,78,.2);
          border-radius:10px; margin-bottom:16px; font-size:13.5px; color:#f4a24e;
        }
        .filter-banner-clear {
          margin-right:auto; background:none; border:1px solid rgba(244,162,78,.3);
          border-radius:8px; color:#f4a24e; font-family:'Heebo',sans-serif;
          font-size:12px; padding:4px 12px; cursor:pointer; transition:all .2s ease;
        }
        .filter-banner-clear:hover { background:rgba(244,162,78,.15); }

        /* ── Filters ── */
        .filters { margin-bottom:24px; }
        .srch {
          width:100%; max-width:340px; padding:11px 16px; background:#141c26;
          border:1px solid #1e2835; border-radius:10px; color:#eef1f6;
          font-family:'Heebo',sans-serif; font-size:14px; direction:rtl; outline:none;
          margin-bottom:12px; transition:all .25s ease;
        }
        .srch:focus { border-color:#f4a24e; box-shadow:0 0 0 3px rgba(244,162,78,.12); }
        .srch::placeholder { color:#556070; }
        .chips { display:flex; flex-wrap:wrap; gap:7px; }
        .chip {
          padding:6px 14px; border-radius:20px; border:1px solid #1e2835;
          background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:12.5px; cursor:pointer; transition:all .2s ease;
        }
        .chip:hover { border-color:rgba(244,162,78,.4); color:#d0d8e4; background:rgba(244,162,78,.05); }
        .chip.on { background:rgba(244,162,78,.12); border-color:#f4a24e; color:#f4a24e; font-weight:700; }
        .past-toggle { font-size:12.5px; color:#8a95a7; margin-top:12px; display:flex; align-items:center; gap:7px; cursor:pointer; }

        /* ── Organizer legend ── */
        .org-legend { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
        .org-chip {
          display:flex; align-items:center; gap:7px; padding:7px 14px; border-radius:20px;
          border:1px solid #1e2835; background:transparent; color:#8a95a7;
          font-family:'Heebo',sans-serif; font-size:12.5px; cursor:pointer; transition:all .2s ease;
        }
        .org-chip:hover { border-color:#2a3545; color:#d0d8e4; }
        .org-chip.on { font-weight:700; }
        .org-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .org-count { background:#1e2835; color:#8a95a7; font-size:10px; padding:2px 7px; border-radius:10px; }

        /* ── Badges ── */
        .badge { font-size:11px; font-weight:700; padding:4px 10px; border-radius:6px; white-space:nowrap; }
        .cat-badge { background:#1a2230; color:#8a95a7; }
        .urg-badge { }
        .free-badge { background:rgba(63,185,122,.12); color:#4ecb8a; }
        .soon-badge { background:rgba(244,162,78,.12); color:#f4a24e; animation:pulse 2.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.65} }
        .org-badge { }
        .ext-link { display:inline-block; margin-top:12px; font-size:13px; color:#6ab0f3; text-decoration:none; font-weight:600; transition:all .2s ease; }
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
        .card-h { font-size:16.5px; font-weight:700; margin-bottom:6px; line-height:1.5; color:#f5f3ef; }
        .card-sub { font-size:13.5px; color:#95a3b5; line-height:1.7; }
        .card-body { margin-top:16px; padding-top:16px; border-top:1px solid #1e2835; font-size:14px; color:#c2ccd8; line-height:1.8; }
        .tip-box {
          margin-top:14px; background:rgba(244,162,78,.06); border:1px solid rgba(244,162,78,.15);
          border-radius:10px; padding:14px 16px; font-size:13.5px; line-height:1.7; color:#d4b896;
        }
        .chev { position:absolute; left:22px; top:24px; font-size:9px; color:#556070; transition:transform .25s ease; }
        .card.open .chev { transform:rotate(180deg); }

        /* ── Right status buttons ── */
        .right-status { display:flex; align-items:center; gap:8px; margin-top:14px; flex-wrap:wrap; }
        .right-status-label { font-size:12px; color:#8a95a7; font-weight:600; }
        .status-btn {
          padding:6px 14px; border-radius:8px; border:1px solid #1e2835;
          background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; transition:all .2s ease;
        }
        .status-btn:hover { border-color:#3a4555; color:#d0d8e4; }
        .status-btn.active { background:rgba(244,162,78,.12); border-color:#f4a24e; color:#f4a24e; font-weight:700; }
        .status-btn.in-prog.active { background:rgba(78,203,138,.1); border-color:#4ecb8a; color:#4ecb8a; }
        .status-btn.done.active { background:rgba(52,211,153,.12); border-color:#34d399; color:#34d399; }

        /* ── Event cards ── */
        .ev-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
        .ev-card {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:22px 24px; transition:all .25s ease;
        }
        .ev-card:hover { border-color:rgba(244,162,78,.25); transform:translateY(-2px); box-shadow:0 6px 24px rgba(0,0,0,.2); }
        .ev-top { display:flex; gap:7px; margin-bottom:12px; flex-wrap:wrap; }
        .ev-h { font-size:15.5px; font-weight:700; margin-bottom:8px; line-height:1.5; color:#f5f3ef; }
        .ev-meta { font-size:12.5px; color:#8a95a7; margin-bottom:12px; display:flex; flex-direction:column; gap:5px; }
        .ev-desc { font-size:13.5px; color:#a0afc0; line-height:1.7; }
        .ev-foot { margin-top:14px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
        .ev-reg { font-size:12.5px; color:#8a95a7; }

        /* ── Updates ── */
        .update-card {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:22px 26px; transition:all .25s ease;
        }
        .update-card:hover { border-color:#2a3545; transform:translateY(-1px); }
        .upd-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .upd-date { font-size:11.5px; color:#6b7a8d; font-weight:600; }
        .update-card h3 { font-size:16px; font-weight:700; margin-bottom:8px; color:#f5f3ef; }
        .update-card p { font-size:13.5px; color:#a0afc0; line-height:1.75; }
        .update-card.high { border-right:3px solid #e8734a; }
        .update-card.medium { border-right:3px solid #f4a24e; }

        /* ── Empty ── */
        .empty { color:#6b7a8d; padding:48px; text-align:center; font-size:14.5px; line-height:1.6; }
        .empty-state { text-align:center; padding:80px 20px; color:#6b7a8d; }
        .empty-icon { font-size:48px; opacity:.2; margin-bottom:16px; }

        /* ── Knowledge ── */
        .knowledge-explainer {
          display:flex; gap:14px; align-items:flex-start;
          background:rgba(244,162,78,.06); border:1px solid rgba(244,162,78,.15);
          border-radius:14px; padding:18px 22px; margin-bottom:20px;
        }
        .knowledge-explainer-icon { font-size:28px; flex-shrink:0; }
        .knowledge-explainer-text { font-size:14px; color:#a0afc0; line-height:1.7; }
        .knowledge-explainer-text strong { color:#f5f3ef; }
        .knowledge-login-hint {
          color:#6b7a8d; font-size:13px; margin-bottom:16px;
          padding:10px 16px; background:rgba(255,255,255,.03); border-radius:10px;
        }
        .knowledge-form-label {
          display:block; font-size:13px; color:#8a98a8; margin-bottom:4px; font-weight:500;
        }
        .knowledge-share-btn {
          padding:10px 22px; border-radius:20px; border:1px solid rgba(244,162,78,.3);
          background:rgba(244,162,78,.08); color:#f4a24e; font-family:'Heebo',sans-serif;
          font-size:14px; font-weight:600; cursor:pointer; transition:all .2s ease;
        }
        .knowledge-share-btn:hover { background:rgba(244,162,78,.15); }
        .knowledge-form {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:20px 24px; margin-bottom:16px;
        }
        .knowledge-card {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:22px 26px; transition:all .25s ease;
        }
        .knowledge-card:hover { border-color:rgba(244,162,78,.2); }
        .knowledge-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .knowledge-date { font-size:11.5px; color:#6b7a8d; }
        .knowledge-title { font-size:16px; font-weight:700; color:#f5f3ef; margin-bottom:8px; }
        .knowledge-content { font-size:14px; color:#a0afc0; line-height:1.75; }
        .knowledge-foot { margin-top:12px; display:flex; align-items:center; }
        .knowledge-vote-btn {
          padding:6px 14px; border-radius:20px; border:1px solid #1e2835;
          background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer; transition:all .2s ease;
        }
        .knowledge-vote-btn:hover:not(:disabled) { border-color:#f4a24e; color:#f4a24e; }
        .knowledge-vote-btn.voted { background:rgba(244,162,78,.12); border-color:#f4a24e; color:#f4a24e; font-weight:700; }
        .knowledge-vote-btn:disabled { cursor:default; opacity:.6; }

        /* ── Tips ── */
        .tips-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
        .tip-card {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:24px 24px 20px; position:relative; transition:all .25s ease;
        }
        .tip-card:hover { border-color:rgba(244,162,78,.25); transform:translateY(-2px); box-shadow:0 6px 24px rgba(0,0,0,.2); }
        .tip-card-num {
          position:absolute; top:16px; left:16px; width:28px; height:28px;
          background:rgba(244,162,78,.12); border-radius:50%; display:flex;
          align-items:center; justify-content:center; font-size:13px;
          font-weight:900; color:#f4a24e;
        }
        .tip-card-icon { font-size:28px; margin-bottom:12px; }
        .tip-card-title { font-size:15.5px; font-weight:700; color:#f5f3ef; margin-bottom:10px; line-height:1.5; }
        .tip-card-content { font-size:13.5px; color:#a0afc0; line-height:1.75; }
        .tip-card-action {
          margin-top:12px; padding:8px 14px; background:rgba(106,176,243,.06);
          border:1px solid rgba(106,176,243,.15); border-radius:8px;
          font-size:13px; color:#6ab0f3; direction:ltr; text-align:left;
        }

        /* ── Terms ── */
        .terms-content { display:flex; flex-direction:column; gap:16px; }
        .terms-section {
          background:#141c26; border:1px solid #1e2835; border-radius:14px;
          padding:22px 26px;
        }
        .terms-section h3 { font-size:16px; font-weight:700; color:#f5f3ef; margin-bottom:10px; }
        .terms-section p { font-size:14px; color:#a0afc0; line-height:1.8; margin-bottom:8px; }
        .terms-section p:last-child { margin-bottom:0; }
        .terms-section strong { color:#f4a24e; }

        /* ── Privacy actions ── */
        .privacy-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
        .privacy-btn {
          padding:8px 14px; border-radius:8px; border:1px solid rgba(224,82,82,.2);
          background:rgba(224,82,82,.06); color:#e05252; font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; transition:all .2s ease;
        }
        .privacy-btn:hover { background:rgba(224,82,82,.12); border-color:#e05252; }

        /* ── Chat outer ── */
        .chat-outer { display:flex; flex-direction:column; gap:16px; }

        /* Privacy banner — with fade out */
        .privacy-banner {
          display:flex; align-items:center; gap:14px;
          background:rgba(78,203,138,.08); border:1px solid rgba(78,203,138,.2);
          border-radius:12px; padding:14px 18px; font-size:13.5px; color:#8dd4a8; line-height:1.6;
          overflow:hidden;
          animation:bannerFade 18s ease-in-out forwards;
        }
        @keyframes bannerFade {
          0%,70% { opacity:1; max-height:100px; padding:14px 18px; margin-bottom:0; }
          85% { opacity:0; max-height:100px; padding:14px 18px; }
          100% { opacity:0; max-height:0; padding:0 18px; margin-bottom:0; border-width:0; pointer-events:none; }
        }
        .prv-icon { font-size:18px; flex-shrink:0; }
        .prv-close { margin-right:auto; background:transparent; border:none; color:#8a95a7; cursor:pointer; font-size:16px; padding:2px 6px; transition:.2s; }
        .prv-close:hover { color:#eef1f6; }

        /* ── Welcome Screen ── */
        .welcome-screen {
          display:flex; flex-direction:column; align-items:center;
          padding:30px 20px 20px; min-height:50vh;
        }
        .welcome-title {
          font-size:32px; font-weight:700; color:#eef1f6; margin-bottom:6px;
        }
        .welcome-subtitle {
          font-size:16px; color:#8a95a7; margin-bottom:36px;
        }
        .welcome-grid {
          display:grid; grid-template-columns:repeat(2, 1fr); gap:14px;
          max-width:560px; width:100%;
        }
        .welcome-card {
          background:#10151c; border:1px solid #1e2530; border-radius:16px;
          padding:22px 18px; cursor:pointer; text-align:center;
          transition:all 0.4s ease; font-family:Heebo,sans-serif;
          animation:welcomeCardIn 0.6s ease-out both;
        }
        .welcome-card:hover {
          border-color:rgba(244,162,78,.35); transform:translateY(-2px);
          box-shadow:0 6px 20px rgba(0,0,0,.3);
        }
        .welcome-card:active { transform:scale(0.98); }
        .welcome-card:last-child { grid-column:1 / -1; max-width:270px; justify-self:center; }
        .wc-icon-wrap {
          width:48px; height:48px; border-radius:50%; display:inline-flex;
          align-items:center; justify-content:center; font-size:22px;
          background:rgba(244,162,78,.08); margin-bottom:10px;
        }
        .wc-name { font-size:18px; font-weight:700; color:#eef1f6; margin-bottom:2px; }
        .wc-role { font-size:12px; color:#f4a24e; margin-bottom:8px; }
        .wc-desc { font-size:12.5px; color:#8a95a7; line-height:1.6; }

        @keyframes welcomeCardIn {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .welcome-card { animation:none; opacity:1; }
        }

        /* Floating tip */
        .floating-tip {
          margin-top:32px; padding:12px 20px; border-radius:12px;
          background:rgba(16,21,28,.85); border:1px solid rgba(30,37,48,.6);
          font-size:13px; color:#8a95a7; text-align:center;
          transition:opacity 0.8s ease; max-width:480px;
        }
        .tip-visible { opacity:1; }
        .tip-hidden { opacity:0; }

        /* Back to welcome */
        .back-welcome-btn {
          background:transparent; border:1px solid #1e2530; border-radius:8px;
          color:#8a95a7; font-size:16px; cursor:pointer; padding:4px 10px;
          transition:all .2s; font-family:Heebo,sans-serif;
        }
        .back-welcome-btn:hover { border-color:#f4a24e; color:#dde3ec; }

        @media (max-width:700px) {
          .welcome-grid { grid-template-columns:1fr; }
          .welcome-card:last-child { max-width:none; }
          .welcome-title { font-size:26px; }
          .welcome-subtitle { font-size:14px; margin-bottom:24px; }
        }

        /* Hat selector */
        .hat-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; transition:all .3s ease; }
        .hat-row-mini {
          position:fixed; bottom:20px; left:20px; z-index:50;
          background:#111820; border:1px solid #1e2835; border-radius:14px;
          padding:8px 12px; gap:6px; box-shadow:0 4px 24px rgba(0,0,0,.4);
        }
        .hat-row-mini .hat-name { display:none; }
        .hat-row-mini .hat-btn { padding:8px 10px; }
        .hat-label { font-size:13.5px; color:#8a95a7; font-weight:600; }
        .hat-btn {
          display:flex; align-items:center; gap:8px; padding:10px 18px; border-radius:12px;
          border:1px solid #1e2835; background:#141c26; color:#8a95a7;
          font-family:'Heebo',sans-serif; font-size:14px; cursor:pointer; transition:all .25s ease;
        }
        .hat-btn:hover { border-color:rgba(244,162,78,.3); color:#d0d8e4; background:#181f2a; transform:translateY(-1px); }
        .hat-btn.active { border-color:#f4a24e; background:rgba(244,162,78,.1); color:#f4a24e; font-weight:700; box-shadow:0 2px 12px rgba(244,162,78,.15); }
        .hat-icon { font-size:18px; }
        .hat-name { font-weight:600; }

        /* City selector */
        .city-row { display:flex; gap:8px; flex-wrap:wrap; }
        .city-btn {
          padding:7px 16px; border-radius:20px; border:1px solid #1e2835;
          background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:12.5px; cursor:pointer; transition:all .2s ease;
        }
        .city-btn:hover { border-color:rgba(52,211,153,.4); color:#d0d8e4; background:rgba(52,211,153,.05); }
        .city-btn.active { background:rgba(52,211,153,.12); border-color:#34d399; color:#34d399; font-weight:700; }

        /* Events hat accent */
        .hat-btn.active.hat-events { border-color:#34d399; background:rgba(52,211,153,.1); color:#34d399; box-shadow:0 2px 12px rgba(52,211,153,.15); }

        /* Chat window */
        .chat-wrap {
          background:#141c26; border:1px solid #1e2835; border-radius:18px; overflow:hidden;
          display:flex; flex-direction:column; height:calc(100vh - 340px); max-height:580px;
        }
        /* Psycho mode — fullscreen chat */
        .psycho-mode .chat-wrap-full {
          height:calc(100vh - 200px); max-height:none;
        }
        .chat-hdr { display:flex; align-items:center; gap:14px; padding:16px 20px; border-bottom:1px solid #1e2835; }
        .chat-ava {
          width:40px; height:40px; background:rgba(244,162,78,.1); border:1px solid rgba(244,162,78,.2);
          border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;
        }
        .chat-name { font-size:14.5px; font-weight:700; color:#f5f3ef; }
        .chat-sub { font-size:11.5px; color:#8a95a7; margin-top:2px; }
        .chat-online { margin-right:auto; font-size:11px; color:#4ecb8a; }

        /* ── Feature Toggle Button ── */
        .feature-toggle-btn {
          display:inline-flex; align-items:center; gap:4px;
          background:#10151c; border:1px solid #1e2530; border-radius:20px;
          padding:4px 10px; font-size:11px; color:#8a95a7; cursor:pointer;
          transition:all .2s; font-family:Heebo,sans-serif;
        }
        .feature-toggle-btn:hover { border-color:#f4a24e; color:#dde3ec; }

        /* ── Feature Panel ── */
        .feature-panel {
          background:#10151c; border:1px solid #1e2530; border-radius:12px;
          padding:12px; margin:0 0 4px; animation:fadeIn .2s;
        }
        .feature-panel-title {
          font-size:12px; font-weight:700; color:#dde3ec; margin-bottom:10px;
        }
        .feature-beta {
          font-size:10px; color:#4ecb8a; background:rgba(78,203,138,.1);
          padding:2px 8px; border-radius:6px; margin-right:8px; font-weight:400;
        }
        .feature-row {
          display:flex; align-items:center; gap:8px; padding:7px 0;
          border-bottom:1px solid rgba(255,255,255,.04);
        }
        .feature-row:last-of-type { border-bottom:none; }
        .feature-icon { font-size:16px; flex-shrink:0; width:24px; text-align:center; }
        .feature-info { flex:1; min-width:0; }
        .feature-label { font-size:12px; color:#dde3ec; font-weight:600; display:block; }
        .feature-desc { font-size:10px; color:#5a6478; }
        .feature-cost { font-size:10px; color:#5a6478; flex-shrink:0; font-family:Heebo,sans-serif; }
        .feature-always {
          font-size:9px; color:#4ecb8a; background:rgba(78,203,138,.1);
          padding:2px 6px; border-radius:6px; flex-shrink:0;
        }
        .feature-total {
          margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.06);
          font-size:11px; color:#8a95a7; text-align:center;
        }
        .feature-total strong { color:#dde3ec; }

        /* Feature toggle switch */
        .feature-switch {
          position:relative; width:34px; height:18px; flex-shrink:0;
        }
        .feature-switch input { opacity:0; width:0; height:0; position:absolute; }
        .feature-slider {
          position:absolute; inset:0; background:#1e2530; border-radius:9px;
          cursor:pointer; transition:all .2s;
        }
        .feature-slider::before {
          content:""; position:absolute; width:14px; height:14px;
          border-radius:50%; background:#5a6478;
          bottom:2px; right:2px; transition:all .2s;
        }
        .feature-switch input:checked + .feature-slider { background:rgba(78,203,138,.2); }
        .feature-switch input:checked + .feature-slider::before {
          background:#4ecb8a; transform:translateX(-16px);
        }

        .login-hint-toast {
          position:fixed; top:90px; left:40px; z-index:61;
          background:#1a2332; border:1px solid rgba(244,162,78,.25); border-radius:10px;
          padding:10px 16px; font-size:13px; color:#d0d8e4;
          animation: hintFadeInOut 6s ease forwards;
          box-shadow:0 4px 16px rgba(0,0,0,.3);
        }
        @keyframes hintFadeInOut {
          0% { opacity:0; transform:translateY(-8px); }
          8% { opacity:1; transform:translateY(0); }
          75% { opacity:1; }
          100% { opacity:0; transform:translateY(-8px); }
        }
        .chat-history-btn {
          width:32px; height:32px; border-radius:8px; border:1px solid #1e2835;
          background:transparent; color:#8a95a7; font-size:14px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:all .2s ease;
        }
        .chat-history-btn:hover { border-color:#3a4555; color:#d0d8e4; background:rgba(255,255,255,.03); }

        /* ── Chat History Drawer ── */
        .chat-history {
          border-bottom:1px solid #1e2835; padding:12px 16px; background:#111820;
          max-height:200px; overflow-y:auto;
        }
        .history-header {
          display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;
          font-size:13px; font-weight:600; color:#8a95a7;
        }
        .history-new-btn {
          padding:4px 12px; border-radius:6px; border:1px solid rgba(244,162,78,.3);
          background:rgba(244,162,78,.08); color:#f4a24e; font-family:'Heebo',sans-serif;
          font-size:11.5px; cursor:pointer; transition:all .2s ease;
        }
        .history-new-btn:hover { background:rgba(244,162,78,.15); }
        .history-empty { font-size:12.5px; color:#556070; text-align:center; padding:8px; }
        .history-list { display:flex; flex-direction:column; gap:4px; }
        .history-item {
          display:flex; align-items:center; gap:6px; border-radius:8px;
          transition:all .15s ease;
        }
        .history-item.active { background:rgba(244,162,78,.08); }
        .history-item-btn {
          flex:1; display:flex; align-items:center; justify-content:space-between;
          padding:8px 12px; border:none; background:transparent; cursor:pointer;
          font-family:'Heebo',sans-serif; text-align:right; border-radius:8px;
        }
        .history-item-btn:hover { background:rgba(255,255,255,.03); }
        .history-title { font-size:13px; color:#c2ccd8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px; }
        .history-date { font-size:11px; color:#556070; flex-shrink:0; }
        .history-delete {
          width:24px; height:24px; border:none; background:transparent;
          color:#556070; cursor:pointer; font-size:12px; border-radius:4px;
          display:flex; align-items:center; justify-content:center;
        }
        .history-delete:hover { color:#e05252; background:rgba(224,82,82,.08); }
        .chat-msgs { flex:1; overflow-y:auto; padding:18px 20px; display:flex; flex-direction:column; gap:14px; }
        .msg { display:flex; gap:10px; align-items:flex-end; animation:msgIn .3s ease; }
        .msg.user { flex-direction:row-reverse; }
        @keyframes msgIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg-ava { width:30px; height:30px; background:#1a2430; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
        .bubble { max-width:76%; padding:12px 16px; border-radius:18px; font-size:14px; line-height:1.8; white-space:pre-wrap; }
        .msg.user .bubble { background:rgba(244,162,78,.12); color:#eef1f6; border-bottom-right-radius:4px; }
        .msg.assistant .bubble { background:#1a2230; border:1px solid #1e2835; color:#c2ccd8; border-bottom-left-radius:4px; }

        /* Nusach (prepared text) block */
        .nusach-block {
          margin:10px 0; padding:12px 14px; background:rgba(78,203,138,.08); border:1px solid rgba(78,203,138,.25);
          border-radius:10px; position:relative;
        }
        .nusach-text { font-size:14px; line-height:1.7; color:#dde3ec; white-space:pre-wrap; }
        .nusach-copy {
          display:inline-flex; align-items:center; gap:6px; margin-top:10px;
          padding:7px 16px; border-radius:8px; border:1px solid rgba(78,203,138,.3);
          background:rgba(78,203,138,.12); color:#4ecb8a; font-size:13px; font-weight:600;
          cursor:pointer; transition:all .2s;
        }
        .nusach-copy:hover { background:rgba(78,203,138,.22); }
        .nusach-copy.copied { background:rgba(78,203,138,.25); color:#fff; }

        /* Bookmarklet block */
        .bookmarklet-block {
          margin:10px 0; padding:14px; background:rgba(244,162,78,.08);
          border:1px solid rgba(244,162,78,.25); border-radius:10px;
        }
        .bookmarklet-header { font-weight:700; color:#f4a24e; margin-bottom:6px; }
        .bookmarklet-desc { font-size:13px; color:#8a94a6; margin-bottom:10px; }
        .bookmarklet-btn {
          display:inline-block; padding:10px 20px; background:#e8734a;
          color:#fff; border-radius:8px; text-decoration:none; font-weight:600;
          font-size:14px; cursor:grab;
        }
        .bookmarklet-btn:hover { background:#d4623e; }
        .bookmarklet-steps { margin-top:12px; font-size:13px; color:#8a94a6; }
        .bookmarklet-steps ol { padding-right:20px; margin:6px 0 0; }
        .bookmarklet-steps li { margin:4px 0; }
        .bookmarklet-steps a { color:#e8734a; }
        @media (max-width:760px) {
          .bookmarklet-block { display:none; }
        }

        /* Typing cursor */
        .typing-cursor { animation:blink 1s infinite; color:#f4a24e; font-weight:300; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

        .typing { display:flex !important; gap:6px; align-items:center; padding:16px 20px !important; }
        .typing span { width:7px; height:7px; background:#f4a24e; border-radius:50%; animation:bop 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay:.2s; }
        .typing span:nth-child(3) { animation-delay:.4s; }
        @keyframes bop { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }

        /* Attachment preview above input */
        .attachment-preview {
          display:flex; align-items:center; gap:10px; padding:8px 18px;
          border-top:1px solid #1e2835; background:#111820;
        }
        .attach-thumb { width:48px; height:48px; border-radius:8px; object-fit:cover; }
        .attach-file-name { font-size:12.5px; color:#8a95a7; }
        .attach-remove {
          margin-right:auto; background:transparent; border:none; color:#8a95a7;
          cursor:pointer; font-size:14px; padding:4px 8px; border-radius:4px;
        }
        .attach-remove:hover { color:#e05252; }

        /* Message attachments */
        .msg-attachment { margin-bottom:8px; }
        .msg-attach-img { max-width:200px; max-height:150px; border-radius:10px; }
        .msg-attach-file { font-size:12px; color:#8a95a7; background:#1a2430; padding:6px 10px; border-radius:6px; }

        /* Chat input row */
        .chat-inp-row { display:flex; gap:8px; padding:14px 18px; border-top:1px solid #1e2835; align-items:flex-end; }
        .attach-btn, .camera-btn, .voice-btn {
          width:36px; height:36px; border-radius:8px; border:1px solid #1e2835;
          background:#0c1018; color:#8a95a7; font-size:16px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          transition:all .2s ease;
        }
        .attach-btn:hover, .camera-btn:hover, .voice-btn:hover { border-color:#3a4555; color:#d0d8e4; }
        .camera-btn { display:none; } /* shown only on mobile */
        .voice-btn.recording { background:rgba(224,82,82,.15); border-color:#e05252; color:#e05252; animation:pulse 1.5s infinite; }

        .chat-inp {
          flex:1; padding:9px 16px; background:#0c1018; border:1px solid #1e2835; border-radius:10px;
          color:#eef1f6; font-family:'Heebo',sans-serif; font-size:14px; direction:rtl; outline:none;
          transition:all .25s ease; resize:none; min-height:36px; max-height:80px; line-height:1.5;
        }
        .chat-inp-multi { max-height:120px; }
        .chat-inp:focus { border-color:#f4a24e; box-shadow:0 0 0 3px rgba(244,162,78,.1); }
        .chat-inp::placeholder { color:#556070; }
        .chat-send {
          width:42px; height:36px; background:linear-gradient(135deg,#e8734a,#f4a24e);
          border:none; border-radius:10px; color:#fff; font-size:17px; cursor:pointer;
          transition:all .2s ease; flex-shrink:0;
        }
        .chat-send:hover:not(:disabled) { transform:scale(1.05); box-shadow:0 4px 16px rgba(244,162,78,.3); }
        .chat-send:disabled { background:#1e2835; cursor:not-allowed; transform:none; box-shadow:none; }
        .chat-disclaimer { font-size:11.5px; color:#556070; text-align:center; }

        /* ── Mobile Header (hidden on desktop) ── */
        .mobile-header { display:none; }
        .mobile-overlay { display:none; }
        .mobile-menu { display:none; }

        /* ── Legal Case ── */
        .case-section { max-width:800px; }
        .case-login-prompt {
          text-align:center; padding:60px 20px; background:#10151c; border:1px solid #1e2530;
          border-radius:16px; margin-top:20px;
        }
        .case-login-icon { font-size:48px; margin-bottom:16px; }
        .case-login-prompt p { color:#8a95a7; margin-bottom:20px; font-size:15px; }
        .case-login-prompt .auth-btn { max-width:280px; margin:0 auto; }

        /* Stage Timeline */
        .stage-timeline {
          display:flex; gap:8px; overflow-x:auto; padding:16px 4px; margin-bottom:20px;
          scrollbar-width:thin; scrollbar-color:#1e2835 transparent;
        }
        .stage-node {
          display:flex; flex-direction:column; align-items:center; gap:6px;
          min-width:72px; flex-shrink:0;
        }
        .stage-circle {
          width:40px; height:40px; border-radius:50%; background:#1a2230; border:2px solid #2a3545;
          display:flex; align-items:center; justify-content:center; font-size:16px;
          transition:all .3s ease;
        }
        .stage-node.done .stage-circle { background:rgba(78,203,138,.15); border-color:#4ecb8a; }
        .stage-node.active .stage-circle {
          background:rgba(224,82,82,.15); border-color:#e05252;
          box-shadow:0 0 12px rgba(224,82,82,.3);
        }
        .stage-label { font-size:10.5px; color:#6b7a8d; text-align:center; white-space:nowrap; }
        .stage-node.active .stage-label { color:#e05252; font-weight:700; }
        .stage-node.done .stage-label { color:#4ecb8a; }

        /* Case Card */
        .case-card {
          background:#10151c; border:1px solid #1e2530; border-radius:14px;
          padding:20px 24px; margin-bottom:16px;
        }
        .case-card-header { display:flex; align-items:center; gap:14px; margin-bottom:12px; }
        .case-card-icon { font-size:28px; }
        .case-card-header h3 { font-size:17px; font-weight:700; color:#f5f3ef; margin:0; }
        .case-card-desc { font-size:13.5px; color:#8a95a7; margin-top:2px; }
        .case-next-action {
          background:rgba(244,162,78,.06); border:1px solid rgba(244,162,78,.15);
          border-radius:10px; padding:12px 16px; font-size:13.5px; color:#d0d8e4;
        }
        .case-next-action strong { color:#f4a24e; }

        /* Countdown */
        .countdown-card {
          background:linear-gradient(135deg, rgba(224,82,82,.1), rgba(244,162,78,.08));
          border:1px solid rgba(224,82,82,.25); border-radius:16px;
          padding:28px; text-align:center; margin-bottom:16px;
        }
        .countdown-number {
          font-size:64px; font-weight:900; color:#e05252;
          line-height:1; margin-bottom:4px;
          text-shadow:0 0 20px rgba(224,82,82,.3);
        }
        .countdown-text { font-size:18px; font-weight:700; color:#d0d8e4; }
        .countdown-date { font-size:13px; color:#8a95a7; margin-top:4px; }
        .countdown-past { border-color:rgba(78,203,138,.25); background:linear-gradient(135deg, rgba(78,203,138,.08), rgba(52,211,153,.05)); }
        .countdown-past .countdown-number { color:#4ecb8a; text-shadow:0 0 20px rgba(78,203,138,.3); }

        /* Prep Section */
        .prep-section {
          background:#10151c; border:1px solid #1e2530; border-radius:14px;
          padding:20px 24px; margin-bottom:16px;
        }
        .prep-title { font-size:16px; font-weight:700; color:#f4a24e; margin-bottom:6px; }
        .prep-desc { font-size:13px; color:#8a95a7; margin-bottom:16px; }
        .prep-tasks { display:flex; flex-direction:column; gap:12px; }
        .prep-task {
          background:#161e28; border:1px solid #1e2835; border-radius:10px;
          padding:14px 16px; transition:all .2s ease;
        }
        .prep-task.checked { border-color:rgba(78,203,138,.3); background:rgba(78,203,138,.05); }
        .prep-check-label {
          display:flex; align-items:center; gap:10px; cursor:pointer;
          font-size:14.5px; font-weight:600; color:#d0d8e4;
        }
        .prep-check-label input[type="checkbox"] {
          width:18px; height:18px; accent-color:#4ecb8a; cursor:pointer;
        }
        .prep-task.checked .prep-task-title { text-decoration:line-through; color:#6b7a8d; }
        .prep-task-desc { font-size:12.5px; color:#8a95a7; margin:6px 0 8px 28px; line-height:1.5; }
        .prep-ask-btn {
          margin-right:28px; padding:6px 14px; border-radius:8px;
          border:1px solid rgba(244,162,78,.2); background:rgba(244,162,78,.06);
          color:#f4a24e; font-family:'Heebo',sans-serif; font-size:12.5px;
          font-weight:600; cursor:pointer; transition:all .2s ease;
        }
        .prep-ask-btn:hover { background:rgba(244,162,78,.12); }

        /* Injury Tips */
        .injury-tips { margin-bottom:16px; }
        .injury-tips h3 { font-size:16px; font-weight:700; color:#f5f3ef; margin-bottom:14px; }
        .tip-boxes { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; }
        .tip-box {
          background:#10151c; border:1px solid #1e2530; border-radius:12px;
          padding:16px 18px;
        }
        .tip-box h4 { font-size:13.5px; font-weight:700; color:#d0d8e4; margin-bottom:10px; }
        .tip-box ul { list-style:none; padding:0; }
        .tip-box li { font-size:12.5px; color:#8a95a7; line-height:1.7; padding:2px 0; }
        .tip-box li::before { content:"• "; color:#f4a24e; }
        .tip-box-warn { border-color:rgba(224,82,82,.2); }
        .tip-box-warn h4 { color:#e05252; }
        .tip-box-warn li::before { color:#e05252; }

        /* Case Reminders */
        .case-reminders { margin-bottom:16px; }
        .case-reminders h3 { font-size:16px; font-weight:700; color:#f5f3ef; margin-bottom:12px; }
        .reminder-card {
          background:#10151c; border:1px solid #1e2530; border-radius:10px;
          padding:14px 16px; margin-bottom:8px;
        }
        .reminder-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .reminder-type { font-size:16px; }
        .reminder-header strong { flex:1; font-size:14px; color:#d0d8e4; }
        .reminder-dismiss {
          background:none; border:none; color:#6b7a8d; font-size:14px;
          cursor:pointer; padding:2px 6px;
        }
        .reminder-card p { font-size:13px; color:#8a95a7; margin:0; }

        /* Case Edit Button */
        .case-edit-btn {
          display:block; width:100%; padding:12px; border-radius:10px;
          border:1px solid #1e2835; background:#161e28; color:#8a95a7;
          font-family:'Heebo',sans-serif; font-size:14px; cursor:pointer;
          transition:all .2s ease; margin-bottom:16px;
        }
        .case-edit-btn:hover { border-color:#3a4555; color:#d0d8e4; }

        /* Case Modal */
        .case-modal-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:300;
          display:flex; align-items:center; justify-content:center; padding:16px;
        }
        .case-modal {
          background:#10151c; border:1px solid #1e2530; border-radius:16px;
          padding:28px; max-width:500px; width:100%; max-height:85vh; overflow-y:auto;
        }
        .case-modal h3 { font-size:18px; font-weight:700; color:#f5f3ef; margin-bottom:20px; }

        /* Wizard */
        .case-wizard {
          background:#10151c; border:1px solid #1e2530; border-radius:16px;
          padding:28px; margin-top:20px;
        }
        .wizard-step h3 { font-size:17px; font-weight:700; color:#f5f3ef; margin-bottom:18px; }
        .wizard-options { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:20px; }
        .wizard-opt {
          display:flex; flex-direction:column; align-items:center; gap:8px;
          padding:16px 10px; border-radius:12px; border:1px solid #1e2835;
          background:#161e28; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer; transition:all .2s ease;
        }
        .wizard-opt:hover { border-color:#3a4555; }
        .wizard-opt.selected { border-color:#e05252; background:rgba(224,82,82,.08); color:#d0d8e4; }
        .wizard-opt-icon { font-size:24px; }
        .wizard-stages { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; max-height:360px; overflow-y:auto; }
        .wizard-stage {
          display:flex; align-items:center; gap:12px; padding:12px 16px;
          border-radius:10px; border:1px solid #1e2835; background:#161e28;
          color:#8a95a7; font-family:'Heebo',sans-serif; cursor:pointer;
          text-align:right; transition:all .2s ease;
        }
        .wizard-stage:hover { border-color:#3a4555; }
        .wizard-stage.selected { border-color:#e05252; background:rgba(224,82,82,.08); }
        .wizard-stage-icon { font-size:20px; flex-shrink:0; }
        .wizard-stage-label { font-size:14px; font-weight:600; color:#d0d8e4; }
        .wizard-stage-desc { font-size:11.5px; color:#6b7a8d; margin-top:2px; }
        .wizard-field {
          display:block; margin-bottom:14px;
        }
        .wizard-field span {
          display:block; font-size:13px; color:#8a95a7; margin-bottom:4px; font-weight:500;
        }
        .wizard-field input, .wizard-field select, .wizard-field textarea {
          width:100%; padding:10px 14px; border-radius:8px; border:1px solid #1e2835;
          background:#161e28; color:#d0d8e4; font-family:'Heebo',sans-serif;
          font-size:14px; direction:rtl;
        }
        .wizard-field input:focus, .wizard-field select:focus, .wizard-field textarea:focus {
          outline:none; border-color:#e05252;
        }
        .wizard-nav { display:flex; gap:10px; justify-content:space-between; margin-top:20px; }
        .wizard-back {
          padding:10px 20px; border-radius:8px; border:1px solid #1e2835;
          background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:14px; cursor:pointer;
        }
        .wizard-next {
          padding:10px 24px; border-radius:8px; border:none;
          background:linear-gradient(135deg,#e8734a,#e05252); color:#fff;
          font-family:'Heebo',sans-serif; font-size:14px; font-weight:600;
          cursor:pointer; transition:all .2s ease;
        }
        .wizard-next:disabled { opacity:.4; cursor:default; }
        .wizard-submit { background:linear-gradient(135deg,#4ecb8a,#34d399); }

        /* Edit injury grid */
        .edit-injury-grid {
          display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-top:4px;
        }
        .edit-injury-opt {
          display:flex; align-items:center; gap:8px; padding:8px 12px;
          border-radius:8px; border:1px solid #1e2835; background:#161e28;
          color:#8a95a7; font-size:13px; cursor:pointer; transition:all .2s ease;
        }
        .edit-injury-opt.selected { border-color:#e05252; background:rgba(224,82,82,.08); color:#d0d8e4; }
        .edit-injury-opt input[type="checkbox"] { accent-color:#e05252; }

        /* Stage Toast */
        .stage-toast {
          position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
          z-index:400; animation:slideUp .3s ease;
        }
        .stage-toast-content {
          background:#1a2230; border:1px solid rgba(244,162,78,.3);
          border-radius:14px; padding:14px 20px; display:flex;
          align-items:center; gap:14px; box-shadow:0 8px 32px rgba(0,0,0,.4);
          font-size:14px; color:#d0d8e4;
        }
        .stage-toast-btns { display:flex; gap:8px; }
        .stage-toast-yes {
          padding:6px 16px; border-radius:8px; border:none;
          background:#4ecb8a; color:#0a0e14; font-family:'Heebo',sans-serif;
          font-size:13px; font-weight:600; cursor:pointer;
        }
        .stage-toast-no {
          padding:6px 16px; border-radius:8px; border:1px solid #2a3545;
          background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer;
        }
        @keyframes slideUp {
          from { transform:translateX(-50%) translateY(20px); opacity:0; }
          to { transform:translateX(-50%) translateY(0); opacity:1; }
        }

        /* ── Mobile ── */
        @media (max-width:760px) {
          .root { flex-direction:column; }
          .sidebar { display:none; }
          .fixed-avatar-wrap { display:none; }

          /* Mobile header */
          .mobile-header {
            display:flex; align-items:center; justify-content:space-between;
            padding:12px 16px; background:#111820; border-bottom:1px solid #1e2835;
            position:sticky; top:0; z-index:90;
          }
          .mobile-header .logo-icon-row { gap:8px; }
          .mobile-header .logo-main { font-size:22px; }

          /* Hamburger button */
          .hamburger-btn {
            display:flex; flex-direction:column; justify-content:center; gap:5px;
            width:36px; height:36px; padding:8px 6px; border:1px solid #1e2835;
            border-radius:8px; background:transparent; cursor:pointer;
          }
          .hamburger-btn span {
            display:block; height:2px; background:#8a95a7; border-radius:2px;
            transition:all .2s ease;
          }
          .hamburger-btn:hover span { background:#d0d8e4; }

          /* Overlay */
          .mobile-overlay {
            display:block; position:fixed; inset:0; background:rgba(0,0,0,.55);
            z-index:200; animation:fadeIn .2s ease;
          }

          /* Side menu */
          .mobile-menu {
            display:flex; flex-direction:column; position:fixed; top:0; right:0;
            width:280px; max-width:85vw; height:100vh; background:#111820;
            border-left:1px solid #1e2835; z-index:210; padding:24px 16px;
            transform:translateX(100%); transition:transform .3s ease;
            overflow-y:auto;
          }
          .mobile-menu.open { transform:translateX(0); }

          .mobile-menu-close {
            align-self:flex-start; background:transparent; border:none;
            color:#8a95a7; font-size:22px; cursor:pointer; padding:4px 8px;
            margin-bottom:16px; border-radius:6px; transition:all .2s ease;
          }
          .mobile-menu-close:hover { color:#eef1f6; background:rgba(255,255,255,.05); }

          .mobile-nav { display:flex; flex-direction:column; gap:4px; margin-bottom:16px; }
          .mobile-nav .nav-btn { font-size:14px; padding:12px 14px; width:auto; height:auto; justify-content:flex-start; gap:10px; }
          .mobile-nav .nav-lbl { display:inline; }
          .mobile-nav .nav-btn::after { display:none; }
          .mobile-nav .nav-badge-dot { display:none; }
          .mobile-nav .nav-badge { display:inline; }

          .mobile-menu-profile { border-top:1px solid #1e2835; padding-top:14px; margin-bottom:14px; }
          .mobile-menu-footer {
            border-top:1px solid #1e2835; padding-top:14px; margin-top:auto;
            display:flex; flex-direction:column; gap:6px;
          }

          .main { padding:20px 16px; }
          .pg-hdr h1 { font-size:24px; }
          .ev-grid { grid-template-columns:1fr; }
          .hat-row { gap:6px; }
          .hat-btn { padding:7px 10px; font-size:12.5px; gap:5px; border-radius:10px; }
          .hat-icon { font-size:15px; }
          .hat-label { font-size:12px; }
          .chat-wrap { height:calc(100vh - 300px); max-height:none; }
          .psycho-mode .chat-wrap-full { height:calc(100vh - 160px); }
          .camera-btn { display:flex; }
          .card:hover,.ev-card:hover,.update-card:hover { transform:none; }
          .wizard-options { grid-template-columns:repeat(2, 1fr); }
          .tip-boxes { grid-template-columns:1fr; }
          .countdown-number { font-size:48px; }
          .stage-toast-content { flex-direction:column; text-align:center; }
          .hotline:hover { transform:none; }
          .hat-row-mini { bottom:12px; left:12px; padding:6px 10px; }
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
    props: {
      rights:read("rights.json"), updates:read("updates.json"), events:read("events.json"),
      legalStages:read("legal-stages.json"), committeePrepData:read("committee-prep.json"), injuryProfiles:read("injury-profiles.json"),
    },
    revalidate: 1800,
  };
}

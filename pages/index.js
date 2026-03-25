import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import Head from "next/head";
import { useUser } from "../lib/UserContext";
import MagenMedicalSummary from "../components/MagenMedicalSummary";
import WhatsAppButton from "../components/WhatsAppButton";
import PortalAgent from "../components/PortalAgent";

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
  high:   { label: "חשוב לממש", color: "var(--copper-600)", bg: "rgba(232,115,74,.12)" },
  medium: { label: "שווה לבדוק", color: "var(--accent-primary)", bg: "rgba(244,162,78,.1)" },
  low:    { label: "לתשומת לב",  color: "var(--status-success)", bg: "rgba(78,203,138,.1)"  },
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
            {copiedIdx === i ? "\u2713 הועתק" : "העתק נוסח"}
          </button>
        </div>
        {bm && bookmarkletUrl && (
          <div className="bookmarklet-block">
            <div className="bookmarklet-header">מילוי אוטומטי</div>
            <p className="bookmarklet-desc">גרור את הכפתור לסרגל הסימניות, או לחץ עליו כשאתה בדף הנכון:</p>
            <a href={bookmarkletUrl} className="bookmarklet-btn"
               onClick={e => { e.preventDefault(); setShowInstructions(true); }}>
              מלא טופס — {bm.label}
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
        <span className="badge cat-badge" data-cat={r.category}>{r.category}</span>
        <span className="badge urg-badge" style={{ color: u.color, background: u.bg }}>{u.label}</span>
      </div>
      <h3 className="card-h">{r.title}</h3>
      <p className="card-sub">{r.summary}</p>
      {open && (
        <div className="card-body">
          <p>{r.details}</p>
          {r.tip && <div className="tip-box">{r.tip}</div>}
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
  "אגף השיקום":            { color: "var(--status-urgent)", bg: "rgba(224,82,82,.12)"   },
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
        <span className="badge cat-badge" data-cat={ev.category}>{ev.category}</span>
        {ev.free && <span className="badge free-badge">חינם</span>}
        {soon && <span className="badge soon-badge">{soon}</span>}
      </div>
      <h3 className="ev-h">{ev.title}</h3>
      <div className="ev-meta">
        <span>{formatDate(ev.date)}{ev.time ? ` \u00B7 ${ev.time}` : ""}</span>
        <span>{ev.location}</span>
      </div>
      <p className="ev-desc">{ev.description}</p>
      <div className="ev-foot">
        {ev.registration && <span className="ev-reg">{ev.registration}</span>}
        {ev.link && !/^https?:\/\/[^/]+\/?$/.test(ev.link) && <a href={ev.link} target="_blank" rel="noopener noreferrer" className="ext-link">פרטים ←</a>}
      </div>
    </div>
  );
}

// ─── SidebarProfile ───────────────────────────────────────

function SidebarProfile({ rights, onShowUnstarted, mini, onFeedback, onTerms, onUpgrade }) {
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/></svg>
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
                {profile?.city && <div className="sb-popup-detail">{profile.city}</div>}
              </div>
            </div>

            {profile?.claim_status === "before_recognition" && profile?.claim_stage && (
              <div className="sb-popup-status">{profile.claim_stage}</div>
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
                <span className="sb-popup-stat-label">טרם נבדקו</span>
              </div>
            </div>

            <div className="progress-section">
              <div className="progress-label">זכויות שבדקת: {completedRights}/{totalRights}</div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}/></div>
            </div>
            {notStarted > 0 && <button className="nudge nudge-btn" onClick={() => { setPopupOpen(false); onShowUnstarted(); }}>יש זכויות שאולי מתאימות לך →</button>}
            <div className="sb-popup-links">
              <button className="sb-popup-link" onClick={toggleProfilePanel}>הגדרות פרופיל</button>
              <a href="https://shikum.mod.gov.il" target="_blank" rel="noopener noreferrer" className="sb-popup-link">האזור האישי שלי</a>
              <button className="sb-popup-link sb-upgrade-btn" onClick={() => { setPopupOpen(false); if (typeof window !== "undefined") window.dispatchEvent(new Event("open-portal-agent")); }}>הגשת פנייה לאגף השיקום</button>
              <a href="https://mod.gov.il/" target="_blank" rel="noopener noreferrer" className="sb-popup-link">אתר אגף השיקום</a>
              <button className="sb-popup-link" onClick={() => { setPopupOpen(false); onTerms(); }}>תנאי שימוש</button>
            </div>
            {onUpgrade && <button className="sb-popup-link sb-upgrade-btn" onClick={() => { setPopupOpen(false); onUpgrade(); }}>שדרג מסלול</button>}
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
        <button className="profile-settings-btn" onClick={toggleProfilePanel} title="הגדרות">{"\u2699"}</button>
      </div>
      <div className="progress-section">
        <div className="progress-label">זכויות שבדקת: {completedRights}/{totalRights}</div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}/></div>
      </div>
      {notStarted > 0 && <button className="nudge nudge-btn" onClick={onShowUnstarted}>יש זכויות שאולי מתאימות לך →</button>}
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
            <p style={{fontSize:12.5,color:"var(--text-secondary)"}}>אין נתונים שמורים</p>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/></svg>
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
            {profile?.city && <p className="profile-card-detail">{profile.city}</p>}
            {profile?.claim_status === "before_recognition" && profile?.claim_stage && (
              <p className="profile-card-detail">{profile.claim_stage}</p>
            )}
            {profile?.claim_status === "after_recognition" && profile?.disability_percent != null && (
              <p className="profile-card-detail">אחוזי נכות: {profile.disability_percent}%</p>
            )}
          </div>
          <button className="profile-edit-btn" onClick={toggleProfilePanel}>עריכה</button>
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
                <span className="badge cat-badge" data-cat={r.category}>{r.category}</span>
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
                <span className="badge cat-badge" data-cat={r.category}>{r.category}</span>
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
                <span className="badge cat-badge" data-cat={r.category}>{r.category}</span>
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
            <div style={{ fontSize: 24, marginBottom: 12, color: "var(--status-success)" }}>{"\u2713"}</div>
            <h3 style={{ color: "var(--stone-50)", marginBottom: 8 }}>תודה!</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>ההודעה שלך התקבלה. אנחנו קוראים הכל.</p>
            <button className="save-btn" style={{ marginTop: 16 }} onClick={onClose}>סגור</button>
          </div>
        ) : (
          <>
            <h3>רעיונות לשימור/שיפור?</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginBottom: 14, lineHeight: 1.6 }}>
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
            <p style={{ color: "var(--text-muted)", fontSize: 11.5, marginTop: 4 }}>השאר פרטים אם תרצה שנחזור אליך</p>
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
  const [myItems, setMyItems] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [kCat, setKCat] = useState("הכל");
  const [loadingK, setLoadingK] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formCat, setFormCat] = useState("כללי");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [voted, setVoted] = useState({});

  // Load featured articles once on mount
  useEffect(() => {
    fetch("/api/knowledge?featured=1")
      .then(r => r.json())
      .then(d => setFeatured(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Load user's own submissions when user changes
  useEffect(() => {
    if (!user) { setMyItems([]); return; }
    fetch("/api/knowledge?mine=1")
      .then(r => r.json())
      .then(d => setMyItems(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [user]);

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
      await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: formCat, title: formTitle.trim(), content: formContent.trim() }),
      });
      setFormTitle("");
      setFormContent("");
      setShowForm(false);
      // Refresh both community tips and user's own submissions
      fetchKnowledge();
      fetch("/api/knowledge?mine=1")
        .then(r => r.json())
        .then(d => setMyItems(Array.isArray(d) ? d : []))
        .catch(() => {});
    } catch {}
    setSubmitting(false);
  }

  async function handleVote(knowledgeId) {
    try {
      const r = await fetch("/api/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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

  // Map knowledge_articles categories to display-friendly Hebrew labels
  const ARTICLE_CAT_LABELS = { rights: "זכויות", medical: "רפואי", general: "כללי", bureaucracy: "בירוקרטיה", mental_health: "טיפול נפשי", employment: "תעסוקה", housing: "דיור", education: "לימודים" };

  // Pending items from user that aren't in the approved list
  const pendingMyItems = myItems.filter(mi => !mi.approved && !items.some(it => it.id === mi.id));

  return (
    <>
      <div className="pg-hdr">
        <h1>חכמת ותיקים</h1>
        <p>שתפו ניסיון אמיתי — היועץ AI לומד מכם ומעביר הלאה</p>
      </div>

      <div className="knowledge-explainer">
        <div className="knowledge-explainer-icon">{"\u2736"}</div>
        <div className="knowledge-explainer-text">
          <strong>איך זה עובד?</strong> אתם משתפים טיפים מהניסיון שלכם, ואחרי אישור — היועץ AI משתמש בהם כדי לעזור לפצועים חדשים. ככה הידע שלכם ממשיך לעזור.
        </div>
      </div>

      {/* Featured knowledge articles from curated analysis */}
      {featured.length > 0 && (
        <div style={{marginBottom:24}}>
          <p className="section-tag" style={{marginBottom:12}}>ידע מקצועי מאומת</p>
          <div className="stack">
            {featured.map(art => (
              <div key={art.id || art.slug} className="knowledge-card" style={{borderInlineStart:"3px solid var(--olive-600)"}}>
                <div className="knowledge-top">
                  <span className="badge cat-badge" style={{background:"rgba(90,111,74,.15)",color:"var(--olive-400)"}}>{ARTICLE_CAT_LABELS[art.category] || art.category}</span>
                </div>
                <h3 className="knowledge-title">{art.title_he}</h3>
                <p className="knowledge-content">{art.summary}</p>
                {art.keywords && art.keywords.length > 0 && (
                  <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
                    {art.keywords.slice(0, 5).map(kw => (
                      <span key={kw} style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:"rgba(168,162,158,.1)",color:"var(--text-secondary)"}}>{kw}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {user ? (
        <div style={{marginBottom:20}}>
          <button className="knowledge-share-btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? "ביטול" : "שתף מהניסיון שלך"}
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

      {/* User's own pending submissions */}
      {pendingMyItems.length > 0 && (
        <div style={{marginBottom:20}}>
          <p style={{color:"var(--text-secondary)",fontSize:13,marginBottom:8}}>השיתופים שלך:</p>
          <div className="stack">
            {pendingMyItems.map(item => (
              <div key={item.id} className="knowledge-card" style={{borderInlineStart:"3px solid var(--status-warning)",opacity:0.85}}>
                <div className="knowledge-top">
                  <span className="badge cat-badge" data-cat={item.category}>{item.category}</span>
                  <span className="badge" style={{background:"rgba(217,119,6,.15)",color:"var(--status-warning)",fontSize:"0.65rem",padding:"2px 8px",borderRadius:3}}>בבדיקה</span>
                </div>
                <h3 className="knowledge-title">{item.title}</h3>
                <p className="knowledge-content">{item.content}</p>
              </div>
            ))}
          </div>
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
      ) : items.length === 0 && featured.length === 0 ? (
        <div className="empty" style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:32,marginBottom:12,opacity:0.7}}>&#x270D;</div>
          <div style={{fontSize:16,fontWeight:600,color:"var(--stone-200)",marginBottom:8}}>היה הראשון לשתף!</div>
          <div style={{fontSize:14,color:"var(--text-secondary)",lineHeight:1.7,maxWidth:360,margin:"0 auto"}}>
            הניסיון שלך יכול לעזור לפצוע אחר. טיפ קטן על ועדה, זכות שגילית באיחור, או דרך לעקוף בירוקרטיה — הכל שווה זהב.
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty" style={{marginTop:16}}>אין טיפים מהקהילה בקטגוריה זו עדיין{user ? " — היה הראשון לשתף!" : ""}</div>
      ) : (
        <>
          <p style={{color:"var(--text-secondary)",fontSize:13,marginTop:12,marginBottom:8}}>טיפים מהקהילה ({items.length}):</p>
          <div className="stack">
            {items.map(item => (
              <div key={item.id} className="knowledge-card">
                <div className="knowledge-top">
                  <span className="badge cat-badge" data-cat={item.category}>{item.category}</span>
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
    title: "קח עו\"ד או נציג מארגון נכי צה\"ל — חינם",
    content: "ארגון נכי צה\"ל נותן ייצוג חינם בוועדות רפואיות ובערעורים. בנוסף, תוכנית ממשלתית חדשה מציעה ייצוג ב-500 \u20AA בלבד. לא ללכת לוועדה לבד!",
    action: "ארגון נכי צה\"ל: 03-5254646",
  },
  {
    title: "הזמן תיק רפואי צבאי מיד",
    content: "התיק הרפואי הצבאי הוא הבסיס לכל תביעה. ככל שתזמין מוקדם יותר — תקבל מוקדם יותר. ההזמנה חינם ומקוונת.",
    action: "archives.mod.gov.il",
  },
  {
    title: "אל תלך לוועדה רפואית בלי נציג",
    content: "ועדה רפואית קובעת את אחוזי הנכות שלך, וזה משפיע על כל הזכויות. עם ייצוג — הסיכוי לאחוזים נכונים עולה משמעותית. הם גם יכולים להוריד אחוזים בערעור!",
  },
  {
    title: "אל תמעיט בפגיעה בפני הוועדה",
    content: "יש נטייה טבעית להגיד \"אני בסדר\". בוועדה — תספר בדיוק מה קשה לך ביומיום. זה לא מגזים — זה מדויק. הרופאים צריכים לשמוע את התמונה המלאה.",
  },
  {
    title: "הגש תביעה מהר — עיכובים עולים כסף",
    content: "תביעה תוך שנה מהשחרור = תגמולים מיום השחרור. אחרי שנה = תגמולים רק מיום ההגשה. כל יום שעובר הוא כסף שאתה מפסיד.",
  },
  {
    title: "טיפול נפשי זמין גם לפני הכרה רשמית",
    content: "לא צריך לחכות להכרה רשמית כדי לקבל עזרה. מדיניות חדשה מאפשרת טיפול נפשי מיידי. נפש אחת *8944 זמין 24/7, אנונימי, אנשי מקצוע שהיו שם.",
    action: "נפש אחת: *8944",
  },
  {
    title: "שמור כל מסמך ומספר פנייה",
    content: "כל פנייה, קבלה, מכתב, אישור — שמור! צלם ותשמור בענן. מספרי פניות חשובים למעקב. אם אין תשובה תוך 30 יום — התקשר עם מספר הפנייה.",
  },
  {
    title: "התקשר *6500 לכל שאלה",
    content: "מוקד הפצועים *6500 הוא הכתובת לכל דבר. קצין שיקום, ועדה רפואית, תגמולים, ציוד — הכל מתחיל שם. תגיד: \"אני נכה צה\"ל, מספר תיק ___, ואני צריך...\"",
    action: "מוקד פצועים: *6500",
  },
  {
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
  { id:"magen",   icon:"מ", emoji:"\uD83D\uDEE1", label:"מגן",  name:"מגן", desc:"היועץ האישי שלך — הכל במקום אחד" },
  { id:"lawyer",  icon:"ד", emoji:"\u2696", label:"דן",  name:"דן", desc:"ייעוץ בזכויות ומשפט" },
  { id:"social",  icon:"מ", emoji:"\uD83E\uDD1D", label:"מיכל", name:"מיכל", desc:"ניווט בירוקרטיה ושירותים" },
  { id:"psycho",  icon:"א", emoji:"\uD83D\uDC99", label:"אורי", name:"אורי", desc:"שיחה אישית ותמיכה" },
  { id:"veteran", icon:"ר", emoji:"\uD83C\uDF96", label:"רועי", name:"רועי", desc:"חכמת ותיקים" },
  { id:"events",  icon:"ש", emoji:"\uD83C\uDFAF", label:"שירה", name:"שירה", desc:"אירועים ופעילויות" },
];

const HAT_GREETINGS = {
  magen:   "היי, אני מגן\n\nספר לי מה עובר עליך ואני אטפל בהכל — זכויות, בירוקרטיה, תמיכה, הכל במקום אחד.",
  lawyer:  "היי, אני דן\n\nאני לא עו\"ד, אבל כנראה שאוכל לעזור לך בכל עניין מול משרד הביטחון.\n\nאיפה הדברים עומדים אצלך?",
  social:  "היי, אני מיכל\n\nאני מכירה את כל הבלגן הבירוקרטי מבפנים, ואלווה אותך.\n\nמה הכי לוחץ עליך עכשיו?",
  psycho:  "היי, אני אורי\n\nהכל כאן סודי — אף אחד לא רואה את השיחה.\n\nמה עובר עליך?",
  veteran: "היי, אני רועי\n\nעברתי את כל הדרך — ועדות, ערעורים, בירוקרטיה. אשמח לשתף ממה שלמדתי.\n\nאיפה אתה עומד?",
  events:  "היי, אני שירה\n\nיש אירועים, סדנאות, טיולים — הרבה בחינם.\n\nבאיזה אזור אתה? מה מעניין אותך?",
};

const HAT_DETAILS = {
  magen:   "יועץ אישי שמכיר את המערכת מבפנים. זכויות, ליווי, תמיכה — בלי להעביר אותך בין אנשים.",
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
      {WELCOME_TIPS[idx]}
    </div>
  );
}

function WelcomeScreen({ onSelect }) {
  const magenHat = HATS[0]; // magen is always first
  const secondaryHats = HATS.slice(1);
  return (
    <div className="welcome-screen">
      <div className="welcome-header">
        <div className="welcome-title">איך אפשר לעזור?</div>
      </div>
      {/* Featured magen card */}
      <button className="welcome-card-featured" style={{ animationDelay: "0s" }} onClick={() => onSelect(magenHat.id)}>
        <div className="wcf-icon-wrap">{magenHat.emoji}</div>
        <div className="wcf-content">
          <div className="wcf-name">{magenHat.name}</div>
          <div className="wcf-role">{magenHat.desc}</div>
          <div className="wcf-desc">{HAT_DETAILS[magenHat.id]}</div>
        </div>
        <div className="wcf-arrow">{"\u2190"}</div>
      </button>
      {/* Specialist options — compact row */}
      <div className="welcome-specialists">
        <span className="specialists-label">מחפש מומחה?</span>
        <div className="specialists-row">
          {secondaryHats.map((h) => (
            <button key={h.id} className="specialist-chip" onClick={() => onSelect(h.id)} title={h.desc}>
              <span className="specialist-emoji">{h.emoji}</span>
              <span className="specialist-name">{h.name}</span>
            </button>
          ))}
        </div>
      </div>
      <FloatingTip />
    </div>
  );
}

// ─── TokenBadge ──────────────────────────────────────────────

function TokenBadge({ subscription, onClick }) {
  if (!subscription) return null;
  const { remaining, unlimited, plan_id } = subscription;

  let label, colorClass;
  if (unlimited) {
    label = "∞";
    colorClass = "tb-green";
  } else if (remaining === -1) {
    label = "∞";
    colorClass = "tb-green";
  } else {
    const rem = typeof remaining === "number" && !isNaN(remaining) ? remaining : 0;
    const k = Math.round(rem / 1000);
    label = k >= 1000 ? `${Math.round(k/1000)}M` : `${k}K`;
    // Determine color based on plan limits
    const limit = plan_id === "one_time" ? 200000 : 50000;
    const pct = rem / limit;
    colorClass = pct > 0.5 ? "tb-green" : pct > 0.25 ? "tb-yellow" : "tb-red";
  }

  return (
    <button className={`token-badge ${colorClass}`} onClick={onClick} title="שימוש בטוקנים">
      {label}
    </button>
  );
}

// ─── PricingModal ────────────────────────────────────────────

function PricingModal({ onClose, onSuccess, currentPlanId }) {
  const [plans, setPlans] = useState([]);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [pendingPlanId, setPendingPlanId] = useState(null);

  useEffect(() => {
    fetch("/api/plans").then(r => r.json()).then(setPlans).catch(() => {});
  }, []);

  // Check for payment=success in URL
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("payment=success")) {
      window.history.replaceState(null, "", window.location.pathname);
      onSuccess();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCheckout(planId) {
    console.log("[checkout-client] start, plan:", planId);
    setLoadingPlan(planId);
    try {
      const { supabase: sb } = await import("../lib/supabase");
      if (!sb) {
        alert("שגיאת הגדרות — נסה לרענן את הדף");
        setLoadingPlan(null);
        return;
      }

      // Check session via cookies — no localStorage needed
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        setLoadingPlan(null);
        await sb.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } },
        });
        return;
      }

      // Check if user has phone — if not, ask for it
      const { data: { user: u } } = await sb.auth.getUser();
      const hasPhone = !!(u?.user_metadata?.phone || u?.phone);
      if (!hasPhone) {
        setPendingPlanId(planId);
        setNeedsPhone(true);
        setLoadingPlan(null);
        return;
      }

      await proceedToCheckout(planId);
    } catch (err) {
      console.error("[checkout-client] error:", err);
      alert("שגיאה בחיבור לשרת.");
      setLoadingPlan(null);
    }
  }

  async function handlePhoneSubmit() {
    const phone = phoneInput.replace(/[\s\-]/g, "");
    if (!/^0[0-9]{8,9}$/.test(phone)) {
      alert("יש להזין מספר טלפון ישראלי תקין");
      return;
    }
    setLoadingPlan(pendingPlanId);
    setNeedsPhone(false);
    try {
      const { supabase: sb } = await import("../lib/supabase");
      try { await sb.auth.updateUser({ data: { phone } }); } catch {}
      await proceedToCheckout(pendingPlanId);
    } catch (err) {
      console.error("[checkout-client] phone submit error:", err);
      alert("שגיאה. נסה שוב.");
      setLoadingPlan(null);
    }
  }

  async function proceedToCheckout(planId) {
    console.log("[checkout-client] fetching /api/checkout...");
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId }),
    });
    console.log("[checkout-client] response status:", r.status);
    let d;
    try { d = await r.json(); } catch { d = {}; }
    console.log("[checkout-client] response data:", d);
    if (d.paymentUrl) {
      console.log("[checkout-client] redirecting to payment...");
      window.location.href = d.paymentUrl;
      return;
    }
    const errMsg = d.error === "payment not configured"
      ? "מערכת התשלומים עדיין לא מוגדרת. נסה שוב מאוחר יותר."
      : "שגיאה ביצירת התשלום. נסה שוב.";
    alert(errMsg);
    setLoadingPlan(null);
  }

  const PLAN_ICONS = { free: "\u2014", one_time: "\u2736", monthly: "\u25CF", premium: "\u2726" };
  const PLAN_DESCS = {
    free: "50K טוקנים/יום",
    one_time: "200K טוקנים (עד שנגמר)",
    monthly: "ללא הגבלה — 30 ימים",
    premium: "Opus + תשובות ארוכות + agent",
  };

  return (
    <div className="pricing-overlay" onClick={onClose}>
      <div className="pricing-modal" onClick={e => e.stopPropagation()}>
        <button className="pricing-close" onClick={onClose}>✕</button>

        {needsPhone ? (
          <div className="phone-prompt">
            <h2 className="pricing-title">רגע לפני התשלום</h2>
            <p className="phone-prompt-desc">מספר הטלפון נדרש לצורך יצירת קישור תשלום מאובטח ושליחת אישור.</p>
            <input
              className="phone-prompt-input"
              type="tel"
              dir="ltr"
              placeholder="050-1234567"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePhoneSubmit()}
              autoFocus
            />
            <div className="phone-prompt-actions">
              <button className="plan-btn" onClick={handlePhoneSubmit}>המשך לתשלום</button>
              <button className="phone-prompt-back" onClick={() => { setNeedsPhone(false); setPendingPlanId(null); }}>חזרה</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="pricing-title">בחר מסלול</h2>
            <div className="pricing-grid">
              {plans.map(p => (
                <div key={p.id} className={`plan-card ${p.id === "premium" ? "plan-featured" : ""}`}>
                  <div className="plan-icon">{PLAN_ICONS[p.id] || "\u25A0"}</div>
                  <div className="plan-name">{p.name}</div>
                  <div className="plan-price">
                    {p.price === 0 ? "חינם" : `${p.price / 100}₪`}
                    {p.period_days ? <span className="plan-period">/חודש</span> : null}
                  </div>
                  <div className="plan-desc">{PLAN_DESCS[p.id] || ""}</div>
                  {p.id === (currentPlanId || "free") ? (
                    <button className="plan-btn plan-btn-current" disabled>המסלול הנוכחי</button>
                  ) : (
                    <button
                      className={`plan-btn ${p.id === "premium" ? "plan-btn-premium" : ""}`}
                      onClick={() => handleCheckout(p.id)}
                      disabled={loadingPlan !== null}
                    >
                      {loadingPlan === p.id ? "מעבד..." : "שדרג"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Chat({ rights, events, pendingChatPromptRef, onStageUpdate, initialHat, onBack }) {
  const { user, profile, userRights: chatUserRights, userMemory, chatSessions, saveSession, loadSession, deleteSession, saveMemory, legalCase, saveLegalCase, subscription, loadSubscription, refreshTokenBalance } = useUser();
  const [showPricing, setShowPricing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
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

  // Handle payment=success redirect — reload subscription even if PricingModal is not mounted
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("payment=success")) {
      window.history.replaceState(null, "", window.location.pathname);
      loadSubscription();
      setPaymentSuccess(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load feature pricing config
  useEffect(() => {
    fetch("/api/feature-pricing").then(r => r.json()).then(config => {
      setFeatureConfig(config);
      const defaults = {};
      config.forEach(f => { defaults[f.id] = f.always_on || f.enabled_by_default; });
      setEnabledFeatures(defaults);
    }).catch(() => {});
  }, []);

  const userPlan = subscription?.plan_id || "free";
  const estimatedCost = featureConfig
    .filter(f => enabledFeatures[f.id] && (f.always_on || f.plans.includes(userPlan)))
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
        enabledFeatures: featureConfig.filter(f => enabledFeatures[f.id]).map(f => f.id),
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

      // Auth is handled via cookies — no Bearer token needed
      const headers = { "Content-Type": "application/json" };

      const r = await fetch("/api/chat", {
        method: "POST", headers,
        body: JSON.stringify(payload),
      });

      // Handle 402 — tokens exhausted
      if (r.status === 402) {
        const d = await r.json();
        setMsgs(m => [...m, { role: "assistant", content: d.reply || "נגמרו הטוקנים. שדרג את המסלול כדי להמשיך." }]);
        setLoading(false);
        setShowPricing(true);
        return;
      }

      let d;
      try { d = await r.json(); } catch { d = { reply: "שגיאה בתשובה מהשרת." }; }
      if (!r.ok && !d.reply) d.reply = "שגיאה בשרת.";
      let reply = d.reply || "שגיאה.";

      // Update token balance from response
      if (d.tokenInfo) refreshTokenBalance(d.tokenInfo);

      // Show soft upgrade nudge when tokens are very low or exhausted
      if (d.showUpgrade || (d.tokenInfo && !d.tokenInfo.unlimited && d.tokenInfo.remaining >= 0 && d.tokenInfo.remaining < 5000)) {
        reply += "\n\n---\n💡 נגמר השימוש היומי? אפשר לשדרג כדי להמשיך בלי הגבלה.";
      }

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

      // Medical injury extraction — parse ---injury--- blocks
      const injuryMatch = reply.match(/---injury---\s*\n?(.*?)\n?---סוף injury---/s);
      if (injuryMatch && user) {
        try {
          const injuryData = JSON.parse(injuryMatch[1].trim());
          reply = reply.replace(/---injury---\s*\n?.*?\n?---סוף injury---/s, "").trim();
          // Save injury via API (auth via cookies)
          fetch("/api/medical-summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(injuryData),
          }).catch(() => {});
        } catch {}
      }

      // Medical event extraction — parse ---medical_event--- blocks
      const medEvtMatch = reply.match(/---medical_event---\s*\n?(.*?)\n?---סוף medical_event---/s);
      if (medEvtMatch && user) {
        try {
          const evtData = JSON.parse(medEvtMatch[1].trim());
          reply = reply.replace(/---medical_event---\s*\n?.*?\n?---סוף medical_event---/s, "").trim();
          // Save medical event via API (auth via cookies)
          fetch("/api/medical-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(evtData),
          }).catch(() => {});
        } catch {}
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
          // Auto-save session (localStorage for anonymous, Supabase for logged-in)
          if (updated.length >= 3) {
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
    } catch (err) {
      console.error("Chat send error:", err);
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
      lawyer: "היי, אני דן\n\nאני לא עו\"ד, אבל כנראה שאוכל לעזור לך בכל עניין מול משרד הביטחון.\n\nאיפה הדברים עומדים אצלך?",
      social: "היי, אני מיכל\n\nאני מכירה את כל הבלגן הבירוקרטי מבפנים, ואלווה אותך.\n\nמה הכי לוחץ עליך עכשיו?",
      psycho: "היי, אני אורי\n\nהכל כאן סודי — אף אחד לא רואה את השיחה.\n\nמה עובר עליך?",
      veteran: "היי, אני רועי\n\nעברתי את כל הדרך — ועדות, ערעורים, בירוקרטיה. אשמח לשתף ממה שלמדתי.\n\nאיפה אתה עומד?",
      events: "היי, אני שירה\n\nיש אירועים, סדנאות, טיולים — הרבה בחינם.\n\nבאיזה אזור אתה? מה מעניין אותך?",
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
          <span className="prv-icon">{"\u25CF"}</span>
          <span>שיחה זו היא <strong>פרטית ומאובטחת</strong> — המידע שלך לא מועבר לצד שלישי ולא מזוהה.</span>
          <button className="prv-close" onClick={() => setBanner(false)}>✕</button>
        </div>
      )}

      {/* Hat selector — in psycho mode, moves to corner */}
      <div className={`hat-row ${isPsycho && msgs.length > 1 ? "hat-row-mini" : ""}`}>
        {onBack && !(isPsycho && msgs.length > 1) && <button className="back-welcome-btn" onClick={onBack} title="חזרה לבחירת יועץ">←</button>}
        {!(isPsycho && msgs.length > 1) && <span className="hat-label">דבר עם:</span>}
        {HATS.map(h => (
          <button key={h.id} className={`hat-btn ${hat===h.id?"active":""} ${h.id==="events"?"hat-events":""} ${h.id==="magen"?"hat-magen":""}`} onClick={() => switchHat(h.id)} title={h.desc}>
            <span className="hat-icon">{h.emoji}</span>
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
          <div className="chat-hdr-top">
            <div className="chat-ava">{curHat.emoji}</div>
            <div className="chat-hdr-info">
              <div className="chat-name">{curHat.name}</div>
              <div className="chat-sub-row">
                <span className="chat-sub">{curHat.desc}</span>
                {/* Token panel removed — clean UX */}
              </div>
            </div>
            {/* TokenBadge hidden — users don't need to see token counts */}
            <div className="chat-online">● מחובר</div>
            {user && (
              <button className="chat-history-btn" onClick={() => setShowHistory(!showHistory)} title="היסטוריית שיחות">
                {showHistory ? "\u2715" : "\u2630"}
              </button>
            )}
          </div>
          {false && (
            <div className="feature-ledger">{/* Feature panel disabled — clean UX */}
            </div>
          )}
        </div>

        {/* Login hint toast */}
        {loginHint && (
          <div className="login-hint-toast">
            התחבר כדי לשמור שיחות ולהמשיך מאיפה שהפסקת
          </div>
        )}

        {/* History drawer */}
        {showHistory && (
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
              {m.role === "assistant" && <div className="msg-ava">{curHat.emoji}</div>}
              <div className="bubble">
                {m.attachment && m.role === "user" && (
                  <div className="msg-attachment">
                    {m.attachment.preview ? (
                      <img src={m.attachment.preview} alt="" className="msg-attach-img"/>
                    ) : (
                      <div className="msg-attach-file">{m.attachment.file_name}</div>
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
              <div className="msg-ava">{curHat.emoji}</div>
              <div className="bubble">{typingText}<span className="typing-cursor">|</span></div>
            </div>
          )}
          {loading && typingText === null && (
            <div className="msg assistant">
              <div className="msg-ava">{curHat.emoji}</div>
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
              <span className="attach-file-name">{attachment.file_name}</span>
            )}
            <button className="attach-remove" onClick={() => setAttachment(null)}>✕</button>
          </div>
        )}

        <div className="chat-inp-row">
          {/* Attach button */}
          <button className="attach-btn" onClick={() => fileRef.current?.click()} title="צרף קובץ">{"\u2795"}</button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={handleFile}/>
          {/* Camera button — mobile only */}
          <button className="camera-btn" onClick={() => cameraRef.current?.click()} title="צלם">{"\u25CB"}</button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
          {/* Voice button for psycho */}
          {isPsycho && (
            <button className={`voice-btn ${isRecording?"recording":""}`} onClick={toggleRecording} title={isRecording?"הפסק הקלטה":"הקלט"}>
              {isRecording ? "\u25A0" : "\u25CF"}
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

      <p className="chat-disclaimer">המידע הוא לצרכי אינפורמציה בלבד ואינו מחליף ייעוץ מקצועי מוסמך.</p>

      {showPricing && <PricingModal currentPlanId={subscription?.plan_id} onClose={() => setShowPricing(false)} onSuccess={() => { setShowPricing(false); setPaymentSuccess(true); loadSubscription(); }} />}
      {paymentSuccess && (
        <div className="payment-success-overlay" onClick={() => setPaymentSuccess(false)}>
          <div className="payment-success-card" onClick={e => e.stopPropagation()}>
            <div className="payment-success-icon">&#10003;</div>
            <h3>התשלום התקבל בהצלחה</h3>
            <p>תודה רבה על האמון. המסלול שלך שודרג והפיצ'רים המתקדמים זמינים עכשיו.</p>
            <p className="payment-success-sub">חשבונית תשלח למייל שלך בדקות הקרובות.</p>
            <button className="payment-success-btn" onClick={() => setPaymentSuccess(false)}>מעולה, בואו נתחיל</button>
          </div>
        </div>
      )}
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

function LegalCaseView({ legalStages, committeePrepData, injuryProfiles, onAskDan, setView, setChatHat }) {
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
          <div className="case-login-icon">{"\u2696"}</div>
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
      { id: "internal", label: "פנימית", icon: "🫁" },
      { id: "other", label: "אחר", icon: "+" },
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

      {/* Proactive next step */}
      <div className="next-step-card">
        <div className="next-step-label">השלב הבא שלך</div>
        <div className="next-step-content">
          <div className="next-step-text">{currentStage?.nextAction || "ספר לי על המצב שלך בצ'אט ואני אמליץ"}</div>
          <button className="next-step-btn" onClick={() => {
            const prompt = `אני בשלב "${currentStage?.label || "תביעה הוגשה"}". ${currentStage?.nextAction || ""}. עזור לי להתקדם לשלב הבא.`;
            onAskDan(prompt);
          }}>
            בוא נתקדם ביחד
          </button>
        </div>
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

      {/* Medical summary — embedded mini view */}
      <div className="case-medical-embed">
        <div className="case-section-label">תקציר רפואי</div>
        <MedicalSummaryView />
      </div>

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
                <span className="reminder-type">{r.type === "committee_prep" ? "\u{1F4CB}" : r.type === "deadline" ? "\u23F0" : r.type === "tip" ? "\u{1F4A1}" : r.type === "encouragement" ? "\u{1F4AA}" : "\u{1F4CC}"}</span>
                <strong>{r.title}</strong>
                <button className="reminder-dismiss" onClick={() => dismissReminder(r.id)}>✕</button>
              </div>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Edit button */}
      <button className="case-edit-btn" onClick={openEdit}>עריכת פרטי התיק</button>

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

// ─── MedicalSummaryView ─────────────────────────────────────

function MedicalSummaryView() {
  const { user } = useUser();
  const [data, setData] = useState({ injuries: [], events: [] });
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    if (!user) return;
    setLoading(true);
    try {
      const r = await fetch("/api/medical-summary");
      if (r.ok) {
        const d = await r.json();
        setData(d);
      }
    } catch (e) { console.error("Medical summary fetch error:", e); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [user]);

  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#718096" }}>
        <div style={{ fontSize: 28, marginBottom: 16, opacity: 0.3, color: "var(--accent-primary)" }}>{"\u271A"}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#dde3ec", marginBottom: 8 }}>תקציר רפואי</div>
        <div style={{ fontSize: 13 }}>יש להתחבר כדי לצפות בתקציר הרפואי</div>
      </div>
    );
  }

  return <MagenMedicalSummary injuries={data.injuries} events={data.events} loading={loading} onRefresh={fetchData} />;
}

// ─── Main ──────────────────────────────────────────────────

export default function Home({ rights, updates, events, legalStages, committeePrepData, injuryProfiles }) {
  const { userRights: homeUserRights } = useUser();
  const [view,      setView]      = useState("chat");
  const [chatHat,   setChatHat]   = useState(null);
  const pendingChatPromptRef = useRef(null);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showPricingGlobal, setShowPricingGlobal] = useState(false);
  const [showPortalAgent, setShowPortalAgent] = useState(false);

  // Listen for portal agent open event (from sidebar popup)
  useEffect(() => {
    const handler = () => setShowPortalAgent(true);
    window.addEventListener("open-portal-agent", handler);
    return () => window.removeEventListener("open-portal-agent", handler);
  }, []);
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
    { id:"chat",    icon:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>', label:"שיחה" },
    { id:"case",    icon:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>', label:"התיק שלי" },
    { id:"medical", icon:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12.572l-7.5 7.428l-7.5-7.428a5 5 0 1 1 7.5-6.566a5 5 0 1 1 7.5 6.572z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>', label:"תקציר רפואי" },
    { id:"rights",  icon:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>', label:"זכויות" },
    { id:"tips",    icon:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>', label:"צעדים ראשונים" },
    { id:"events",  icon:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', label:"אירועים", badge: upcomingCount||null },
    { id:"knowledge", icon:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e09f3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>', label:"חכמת ותיקים" },
    { id:"updates", icon:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>', label:"עדכונים", badge: updates.length||null },
  ];

  // SVG favicon (shield)
  const faviconSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#d97706"/><stop offset="100%" stop-color="#c2410c"/></linearGradient></defs><path d="M32 4 L56 14 L56 30 C56 44 46 54 32 60 C18 54 8 44 8 30 L8 14 Z" fill="url(#g)"/><path d="M32 8 L52 16 L52 30 C52 42 44 51 32 56 C20 51 12 42 12 30 L12 16 Z" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/></svg>`)}`;

  return (
    <>
      <Head>
        <title>שיט.קום — זכויות פצועי צה״ל</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <meta name="description" content="מרכז זכויות, אירועים ויועץ AI לפצועי צה״ל"/>
        <link rel="icon" href={faviconSvg} type="image/svg+xml"/>
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      </Head>

      <div className="root" dir="rtl">

        {/* ── Mobile Header ── */}
        <div className="mobile-header">
          <div className="logo-icon-row">
            <svg className="logo-svg" viewBox="0 0 36 36" width="24" height="24">
              <defs><linearGradient id="mlg" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stopColor="var(--accent-primary)"/><stop offset="100%" stopColor="var(--copper-600)"/></linearGradient></defs>
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
                <span className="nav-icon" dangerouslySetInnerHTML={{ __html: n.icon }}/>
                <span className="nav-lbl">{n.label}</span>
                {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className="mobile-menu-profile">
            <SidebarProfile rights={rights} onShowUnstarted={showUnstartedRights} />
          </div>
          <div className="mobile-menu-footer">
            <a href="tel:*6500" className="hotline">מוקד פצועים <strong>*6500</strong></a>
            <a href="tel:*8944" className="hotline red">נפש אחת <strong>*8944</strong></a>
            <a href="https://shikum.mod.gov.il" target="_blank" rel="noopener noreferrer" className="hotline personal-area">האזור האישי שלי</a>
            <a href="https://mod.gov.il/" target="_blank" rel="noopener noreferrer" className="hotline">אגף השיקום</a>
            <button className="hotline feedback-btn" onClick={() => { setFeedbackOpen(true); setMenuOpen(false); }}>רעיונות לשימור/שיפור?</button>
            <button className="hotline terms-link" onClick={() => { setView("terms"); setMenuOpen(false); }}>תנאי שימוש</button>
          </div>
        </div>

        {/* ── Fixed avatar (top-left corner, desktop only) ── */}
        <div className="fixed-avatar-wrap">
          <SidebarProfile mini rights={rights} onShowUnstarted={showUnstartedRights} onFeedback={() => setFeedbackOpen(true)} onTerms={() => setView("terms")} onProfile={() => setView("profile")} onUpgrade={() => setShowPricingGlobal(true)} />
        </div>

        {/* ── Sidebar (desktop) — mini icon-only ── */}
        <aside className="sidebar">
          <div className="logo-mini">
            <svg className="logo-svg" viewBox="0 0 36 36" width="28" height="28">
              <defs><linearGradient id="lg" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stopColor="var(--accent-primary)"/><stop offset="100%" stopColor="var(--copper-600)"/></linearGradient></defs>
              <path d="M18 2 L32 8 L32 17 C32 25 26 31 18 34 C10 31 4 25 4 17 L4 8 Z" fill="url(#lg)"/>
              <path d="M18 4.5 L30 10 L30 17 C30 24 25 29.5 18 32 C11 29.5 6 24 6 17 L6 10 Z" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8"/>
            </svg>
            <div className="logo-mini-text">שיט.קום</div>
          </div>

          <nav>
            {NAV.map(n => (
              <button key={n.id} className={`nav-btn ${view===n.id?"active":""}`} onClick={()=>setView(n.id)} data-tooltip={n.label}>
                <span className="nav-icon" dangerouslySetInnerHTML={{ __html: n.icon }}/>
                {n.badge ? <span className="nav-badge-dot"/> : null}
              </button>
            ))}
          </nav>

          <div className="sb-footer">
            <a href="tel:*6500" className="sb-footer-icon green" data-tooltip="מוקד פצועים *6500" dangerouslySetInnerHTML={{ __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' }} />
            <a href="tel:*8944" className="sb-footer-icon red" data-tooltip="נפש אחת *8944" dangerouslySetInnerHTML={{ __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12.572l-7.5 7.428l-7.5-7.428a5 5 0 1 1 7.5-6.566a5 5 0 1 1 7.5 6.572z"/></svg>' }} />
            <button className="sb-footer-icon amber" data-tooltip="רעיונות לשימור/שיפור?" onClick={() => setFeedbackOpen(true)} dangerouslySetInnerHTML={{ __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' }} />
            <button className="sb-footer-icon whatsapp" data-tooltip="התחברת? בוא נמשיך בוואטסאפ" onClick={() => window.dispatchEvent(new Event("open-whatsapp-modal"))} dangerouslySetInnerHTML={{ __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' }} />
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
          {/* MEDICAL SUMMARY */}
          {view==="medical" && <>
            <div className="pg-hdr">
              <h1>תקציר רפואי</h1>
              <p>מפת פגיעות, חישוב נכות וציר זמן</p>
            </div>
            <MedicalSummaryView />
          </>}

          {view==="case" && <LegalCaseView
            legalStages={legalStages}
            committeePrepData={committeePrepData}
            injuryProfiles={injuryProfiles}
            onAskDan={(prompt) => { pendingChatPromptRef.current = prompt; setView("chat"); }}
            setView={setView}
            setChatHat={setChatHat}
          />}

          {view==="chat" && <>
            {chatHat === null && !pendingChatPromptRef.current ? (
              <>
                <WelcomeScreen onSelect={(hatId) => setChatHat(hatId)} />
              </>
            ) : (
              <>
                <div className="pg-hdr">
                  <p style={{color:"var(--stone-400)",fontSize:13}}>שיחה פרטית ומאובטחת</p>
                </div>
                <Chat rights={rights} events={events} pendingChatPromptRef={pendingChatPromptRef} initialHat={chatHat || "magen"} onBack={() => setChatHat(null)} onStageUpdate={(stageId) => {
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
        :root {
          /* Base palette — warm stone */
          --stone-950: #0c0a09;
          --stone-900: #1c1917;
          --stone-800: #292524;
          --stone-700: #44403c;
          --stone-600: #57534e;
          --stone-400: #a8a29e;
          --stone-300: #d6d3d1;
          --stone-200: #e7e5e4;
          --stone-50:  #fafaf9;
          /* Accent — warm copper */
          --copper-600: #c2410c;
          --copper-500: #d97706;
          --copper-400: #e09f3e;
          --copper-100: #fef3c7;
          /* Status */
          --status-urgent: #dc2626;
          --status-warning: #d97706;
          --status-info: #2563eb;
          --status-success: #16a34a;
          --status-success-light: #34d399;
          --status-muted: #57534e;
          /* Olive — secondary */
          --olive-700: #4a5c3e;
          --olive-600: #5a6f4a;
          --olive-400: #8fa677;
          --olive-100: #ecfccb;
          /* Surface variants — warm tones */
          --surface-deep: #13110f;
          --surface-card: #1f1c19;
          --surface-input: #171412;
          --surface-hover: #262220;
          /* Semantic mapping */
          --bg-primary: var(--stone-900);
          --bg-elevated: var(--stone-800);
          --bg-surface: var(--stone-700);
          --bg-overlay: rgba(12, 10, 9, 0.85);
          --text-primary: var(--stone-200);
          --text-secondary: var(--stone-400);
          --text-muted: var(--stone-600);
          --text-inverse: var(--stone-900);
          --border-default: var(--stone-700);
          --border-subtle: rgba(68, 64, 60, 0.5);
          --border-accent: var(--copper-500);
          --accent-primary: var(--copper-500);
          --accent-hover: var(--copper-600);
          --accent-secondary: var(--olive-700);
          --link-color: #b8956a;
          --link-hover: var(--copper-400);
          /* Motion tokens */
          --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
          --ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
          --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
          --duration-fast: 0.15s;
          --duration-normal: 0.4s;
          --duration-slow: 0.6s;
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
        body {
          background:var(--stone-950); color:var(--text-primary);
          font-family:'Heebo',sans-serif; line-height:1.7;
        }
        /* Subtle grain texture overlay */
        body::after {
          content:""; position:fixed; inset:0; pointer-events:none; z-index:9999;
          opacity:0.025;
          background-image:url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');
        }
        ::selection { background:rgba(217,119,6,.3); color:#fff; }
        *:focus-visible { outline:2px solid var(--copper-500); outline-offset:2px; }
        * { scrollbar-width:thin; scrollbar-color:var(--stone-700) transparent; }
        *::-webkit-scrollbar { width:6px; height:6px; }
        *::-webkit-scrollbar-track { background:transparent; }
        *::-webkit-scrollbar-thumb { background:var(--stone-700); border-radius:3px; }
        *::-webkit-scrollbar-thumb:hover { background:var(--stone-600); }

        /* ── Layout ── */
        .root { display:flex; min-height:100vh; }

        /* ── Sidebar (mini — icons only) ── */
        .sidebar {
          width:64px; flex-shrink:0; background:var(--stone-900); border-left:1px solid var(--border-default);
          display:flex; flex-direction:column; align-items:center; padding:16px 8px;
          position:sticky; top:0; height:100vh; overflow:visible; z-index:100;
        }
        .logo-mini { margin-bottom:20px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; }
        .logo-mini-text { font-size:9px; font-weight:700; color:var(--copper-600); letter-spacing:.5px; }
        .logo-icon-row { display:flex; align-items:center; gap:10px; }
        .logo-svg { flex-shrink:0; }
        .logo-main { font-size:30px; font-weight:900; color:var(--copper-600); letter-spacing:-1px; line-height:1; }
        .logo-en { font-size:10px; font-weight:700; color:rgba(232,115,74,.35); letter-spacing:4px; margin-right:8px; vertical-align:middle; }
        .logo-sub { font-size:10.5px; color:var(--text-secondary); margin-top:6px; letter-spacing:.5px; }
        nav { display:flex; flex-direction:column; gap:4px; flex:1; align-items:center; }
        .nav-btn {
          position:relative; width:40px; height:40px; display:flex; align-items:center; justify-content:center;
          border-radius:8px; border:none; background:transparent; color:var(--text-secondary);
          font-family:'Heebo',sans-serif; font-size:14px; cursor:pointer; transition:all .2s ease;
        }
        .nav-btn:hover { background:rgba(244,162,78,.08); color:var(--stone-300); }
        .nav-btn.active { background:rgba(244,162,78,.12); color:var(--accent-primary); }
        .nav-icon { font-size:17px; opacity:.85; }
        .nav-btn.active .nav-icon { opacity:1; }
        .nav-lbl { display:none; }

        /* Tooltip for nav buttons (RTL — tooltip appears to the left, towards content) */
        .nav-btn::after {
          content:attr(data-tooltip); position:absolute; right:calc(100% + 10px); top:50%; transform:translateY(-50%);
          background:var(--border-default); color:var(--text-primary); font-size:12.5px; font-weight:600; padding:6px 12px;
          border-radius:8px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .15s ease;
          box-shadow:0 4px 12px rgba(0,0,0,.3); z-index:9999;
        }
        .nav-btn:hover::after { opacity:1; }

        /* Badge dot */
        .nav-badge-dot {
          position:absolute; top:6px; left:6px; width:6px; height:6px;
          background:var(--accent-primary); border-radius:50%;
          border:2px solid var(--stone-900);
        }
        /* Full badge (mobile menu) */
        .nav-badge { background:var(--accent-primary); color:var(--stone-950); font-size:10px; font-weight:700; padding:2px 7px; border-radius:3px; font-family:'IBM Plex Mono',monospace; }

        /* ── Fixed Avatar (top-left corner) ── */
        .fixed-avatar-wrap { position:fixed; top:28px; left:28px; z-index:9999; }

        /* ── Sidebar Avatar (mini) ── */
        .sb-avatar-wrap { position:relative; }
        .sb-mini-avatar {
          width:44px; height:44px; border-radius:50%;
          background:var(--copper-600);
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          font-weight:700; color:#fff; font-size:16px; overflow:hidden;
          border:2px solid transparent; cursor:pointer;
          transition:border-color var(--duration-fast) var(--ease-out-quad);
        }
        .sb-mini-avatar:hover { border-color:var(--copper-400); }
        .sb-mini-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
        .sb-mini-avatar.anon {
          background:var(--surface-card);
          border:1.5px solid var(--stone-700); color:var(--text-secondary); font-size:16px;
        }
        .sb-mini-avatar.anon:hover { border-color:var(--accent-primary); }

        /* ── Sidebar Popup ── */
        .sb-popup {
          position:absolute; left:0; top:calc(100% + 10px);
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:18px 20px; min-width:260px; z-index:9999;
          box-shadow:0 8px 32px rgba(0,0,0,.4); animation:fadeIn .15s ease;
        }
        .sb-popup-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .sb-popup-links { display:flex; flex-direction:column; gap:2px; margin-top:12px; border-top:1px solid var(--border-default); padding-top:10px; }
        .sb-popup-link {
          display:block; padding:8px 10px; border-radius:8px; font-size:13px; color:var(--text-secondary);
          text-decoration:none; background:none; border:none; font-family:'Heebo',sans-serif;
          cursor:pointer; text-align:right; transition:all .15s ease;
        }
        .sb-popup-link:hover { background:rgba(244,162,78,.06); color:var(--stone-300); }
        .sb-upgrade-btn { color:var(--copper-500); font-weight:600; }
        .sb-upgrade-btn:hover { background:rgba(217,119,6,.1); color:var(--copper-400); }

        .portal-overlay {
          position:fixed; inset:0; z-index:9999;
          background:rgba(12,10,9,0.85);
          display:flex; align-items:center; justify-content:center;
          padding:clamp(1rem,4vw,2rem);
        }
        .portal-container {
          width:100%; max-width:680px; max-height:90vh;
          overflow-y:auto; border-radius:8px;
          background:var(--bg-elevated,#292524);
          border:1px solid var(--border-default,#44403c);
        }
        .sb-popup-detail { font-size:12px; color:var(--text-secondary); margin-top:2px; }
        .sb-popup-status { font-size:12.5px; color:var(--text-secondary); padding:6px 0; border-bottom:1px solid var(--border-default); margin-bottom:4px; }
        .sb-popup-stats { display:flex; gap:8px; margin:10px 0 6px; }
        .sb-popup-stat { flex:1; text-align:center; background:var(--stone-950); border-radius:8px; padding:8px 4px; }
        .sb-popup-stat-num { display:block; font-size:18px; font-weight:900; color:var(--text-secondary); }
        .sb-popup-stat-num.done { color:var(--status-success-light); }
        .sb-popup-stat-num.prog { color:var(--accent-primary); }
        .sb-popup-stat-label { font-size:10px; color:var(--text-muted); }

        /* ── Sidebar Profile ── */
        .sb-profile-zone { padding:14px 0; border-top:1px solid var(--border-default); border-bottom:1px solid var(--border-default); margin-bottom:10px; width:100%; }
        .connect-btn {
          width:100%; padding:12px; border-radius:10px; border:1px solid rgba(244,162,78,.3);
          background:rgba(244,162,78,.08); color:var(--accent-primary); font-family:'Heebo',sans-serif;
          font-size:13.5px; font-weight:600; cursor:pointer; transition:all .2s ease;
        }
        .connect-btn:hover { background:rgba(244,162,78,.15); border-color:var(--accent-primary); }
        .auth-providers { display:flex; flex-direction:column; gap:8px; }
        .auth-btn {
          width:100%; padding:10px 14px; border-radius:8px; border:1px solid var(--stone-700);
          background:var(--surface-input); color:var(--stone-300); font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px;
          justify-content:center; transition:all .2s ease;
        }
        .auth-btn:hover { background:var(--surface-hover); border-color:var(--stone-700); }
        .auth-btn.google { border-color:rgba(66,133,244,.3); }
        .auth-btn.google:hover { background:rgba(66,133,244,.08); }
        .auth-btn.apple { border-color:rgba(255,255,255,.15); }
        .auth-close { background:transparent; border:none; color:var(--text-secondary); font-size:12px; font-family:'Heebo',sans-serif; cursor:pointer; padding:4px; }
        .profile-header { display:flex; align-items:center; gap:10px; }
        .profile-avatar {
          width:36px; height:36px; border-radius:50%; background:rgba(244,162,78,.15);
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          font-weight:700; color:var(--accent-primary); font-size:14px; overflow:hidden;
        }
        .profile-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
        .profile-name { flex:1; font-size:13.5px; font-weight:600; color:var(--stone-300); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .profile-settings-btn {
          background:transparent; border:none; color:var(--text-secondary); font-size:16px; cursor:pointer;
          padding:4px 6px; border-radius:6px; transition:all .2s ease;
        }
        .profile-settings-btn:hover { color:var(--stone-300); background:rgba(255,255,255,.05); }
        .progress-section { margin-top:10px; }
        .progress-label { font-size:11px; color:var(--text-secondary); margin-bottom:4px; }
        .progress-bar { height:6px; background:var(--border-default); border-radius:3px; overflow:hidden; }
        .progress-fill { height:100%; background:var(--accent-primary); border-radius:3px; transition:width .5s ease; }
        .nudge { font-size:11.5px; color:var(--accent-primary); margin-top:8px; }
        .nudge-btn {
          background:none; border:none; font-family:'Heebo',sans-serif; cursor:pointer;
          padding:0; text-decoration:underline; text-underline-offset:2px;
        }
        .nudge-btn:hover { color:var(--copper-600); }
        .signout-link {
          background:none; border:none; color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; margin-top:8px; padding:0;
          text-decoration:underline; text-underline-offset:2px;
        }
        .signout-link:hover { color:var(--status-urgent); }

        /* ── Settings Panel ── */
        .settings-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:1000;
          display:flex; align-items:center; justify-content:center;
          animation:fadeIn .2s ease;
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .settings-panel {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:28px 32px; width:360px; max-width:90vw; max-height:80vh; overflow-y:auto;
        }
        .settings-panel h3 { font-size:18px; font-weight:700; color:var(--stone-50); margin-bottom:20px; }
        .settings-label { display:block; font-size:12.5px; color:var(--text-secondary); margin:12px 0 6px; font-weight:600; }
        .settings-select, .settings-input {
          width:100%; padding:10px 14px; background:var(--stone-950); border:1px solid var(--border-default);
          border-radius:8px; color:var(--text-primary); font-family:'Heebo',sans-serif; font-size:14px;
          direction:rtl; outline:none;
        }
        .settings-select:focus, .settings-input:focus { border-color:var(--accent-primary); }
        .interest-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:4px; }
        .interest-chip {
          padding:6px 14px; border-radius:20px; border:1px solid var(--border-default);
          background:transparent; color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; transition:all .2s ease;
        }
        .interest-chip:hover { border-color:rgba(244,162,78,.4); color:var(--stone-300); }
        .interest-chip.on { background:rgba(244,162,78,.12); border-color:var(--accent-primary); color:var(--accent-primary); font-weight:700; }
        .settings-actions { display:flex; gap:10px; margin-top:20px; }
        .save-btn {
          flex:1; padding:11px; border-radius:6px; border:none;
          background:var(--accent-primary); color:var(--stone-950);
          font-family:'Heebo',sans-serif; font-size:14px; font-weight:700; cursor:pointer;
          transition:background var(--duration-fast) var(--ease-out-quad);
        }
        .save-btn:hover:not(:disabled) { background:var(--accent-hover); }
        .save-btn:disabled { opacity:.6; cursor:not-allowed; }
        .signout-btn {
          padding:11px 20px; border-radius:8px; border:1px solid var(--stone-700);
          background:transparent; color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer; transition:all .2s ease;
        }
        .signout-btn:hover { color:var(--status-urgent); border-color:var(--status-urgent); }

        /* Feedback */
        .feedback-btn { cursor:pointer; border:none; text-align:right; font-family:'Heebo',sans-serif; width:100%; }
        .feedback-textarea {
          width:100%; padding:12px 14px; background:var(--stone-950); border:1px solid var(--border-default);
          border-radius:8px; color:var(--text-primary); font-family:'Heebo',sans-serif; font-size:14px;
          direction:rtl; outline:none; resize:vertical; min-height:80px; line-height:1.6;
        }
        .feedback-textarea:focus { border-color:var(--accent-primary); }
        .feedback-textarea::placeholder { color:var(--text-muted); }
        .feedback-contact { display:flex; gap:8px; margin-top:10px; }
        .feedback-input { flex:1; padding:8px 12px !important; font-size:13px !important; }

        /* User top avatar */
        .user-top-btn {
          position:fixed; top:40px; left:40px; z-index:60;
          background:none; border:none; cursor:pointer; padding:0;
        }
        .user-top-avatar {
          width:40px; height:40px; border-radius:50%;
          background:var(--copper-600);
          display:flex; align-items:center; justify-content:center;
          font-weight:700; color:#fff; font-size:16px; overflow:hidden;
          transition:border-color var(--duration-fast) var(--ease-out-quad);
          border:2px solid transparent;
        }
        .user-top-btn:hover .user-top-avatar { border-color:var(--copper-400); }
        .user-top-avatar.anon {
          background:var(--surface-card);
          border:1.5px solid var(--stone-700);
          font-size:16px;
        }
        .user-top-btn:hover .user-top-avatar.anon { border-color:var(--accent-primary); }
        .user-top-avatar img { width:40px; height:40px; min-width:40px; min-height:40px; object-fit:cover; border-radius:50%; display:block; }

        /* Profile view */
        .profile-card {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:24px 28px; margin-bottom:20px;
        }
        .profile-card-header { display:flex; align-items:center; gap:16px; }
        .profile-big-avatar {
          width:56px; height:56px; border-radius:50%; flex-shrink:0;
          background:var(--copper-600);
          display:flex; align-items:center; justify-content:center;
          font-weight:700; color:#fff; font-size:22px; overflow:hidden;
        }
        .profile-big-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
        .profile-card-name { font-size:20px; font-weight:700; color:var(--stone-50); }
        .profile-card-detail { font-size:13px; color:var(--text-secondary); margin-top:4px; }
        .profile-edit-btn {
          margin-inline-start:auto; padding:8px 16px; border-radius:8px;
          border:1px solid var(--border-default); background:transparent; color:var(--text-secondary);
          font-family:'Heebo',sans-serif; font-size:13px; cursor:pointer;
          transition:all .2s ease;
        }
        .profile-edit-btn:hover { border-color:var(--accent-primary); color:var(--accent-primary); }
        .profile-section { margin-bottom:24px; }
        .profile-section-title { font-size:16px; font-weight:700; color:var(--stone-50); margin-bottom:12px; }
        .profile-section-sub { font-size:13px; color:var(--text-secondary); margin-bottom:10px; }
        .profile-stats { display:flex; gap:16px; margin-bottom:8px; }
        .profile-stat { text-align:center; flex:1; background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px; padding:16px; }
        .profile-stat-num { font-size:28px; font-weight:900; color:var(--text-secondary); }
        .profile-stat-num.done { color:var(--status-success-light); }
        .profile-stat-num.prog { color:var(--accent-primary); }
        .profile-stat-label { font-size:12px; color:var(--text-secondary); margin-top:4px; }
        .profile-right-item {
          display:flex; align-items:center; gap:10px; padding:12px 16px;
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:10px;
          font-size:14px; color:var(--text-primary);
        }
        .profile-right-item.clickable { cursor:pointer; transition:all .2s ease; }
        .profile-right-item.clickable:hover { border-color:rgba(244,162,78,.3); background:var(--surface-hover); transform:translateX(-2px); }
        .profile-right-item.prog { border-inline-start:3px solid var(--accent-primary); }
        .profile-right-item.done { border-inline-start:3px solid var(--status-success-light); }
        .profile-right-arrow { margin-inline-start:auto; color:var(--accent-primary); font-size:16px; opacity:.6; }
        .profile-right-item.clickable:hover .profile-right-arrow { opacity:1; }
        .profile-check { margin-inline-start:auto; color:var(--status-success-light); font-weight:700; }
        .profile-more { font-size:13px; color:var(--text-secondary); margin-top:8px; }
        .profile-more-btn {
          background:none; border:1px solid rgba(244,162,78,.2); border-radius:10px;
          padding:12px 16px; color:var(--accent-primary); font-family:'Heebo',sans-serif;
          font-size:13.5px; font-weight:600; cursor:pointer; width:100%;
          text-align:center; transition:all .2s ease;
        }
        .profile-more-btn:hover { background:rgba(244,162,78,.06); border-color:var(--accent-primary); }

        .sb-footer { border-top:1px solid var(--border-default); padding-top:12px; display:flex; flex-direction:column; align-items:center; gap:6px; }

        /* Mini footer icons */
        .sb-footer-icon {
          position:relative; width:40px; height:40px; display:flex; align-items:center; justify-content:center;
          border-radius:8px; background:var(--surface-input); border:none; font-size:10px; font-weight:700;
          color:var(--text-secondary); text-decoration:none; cursor:pointer; transition:all .2s ease;
          font-family:'IBM Plex Mono','Heebo',sans-serif; letter-spacing:-0.5px;
        }
        .sb-footer-icon:hover { background:var(--surface-hover); color:var(--text-primary); }
        .sb-footer-icon.red { color:#dc2626; }
        .sb-footer-icon.red:hover { background:rgba(220,38,38,.1); }
        .sb-footer-icon.green { color:#16a34a; }
        .sb-footer-icon.green:hover { background:rgba(22,163,74,.1); }
        .sb-footer-icon.amber { color:#d97706; }
        .sb-footer-icon.amber:hover { background:rgba(217,119,6,.1); }
        .sb-footer-icon.whatsapp { color:#25D366; }
        .sb-footer-icon.whatsapp:hover { background:rgba(37,211,102,.1); }
        .sb-footer-icon::after {
          content:attr(data-tooltip); position:absolute; right:calc(100% + 10px); top:50%; transform:translateY(-50%);
          background:var(--border-default); color:var(--text-primary); font-size:12.5px; font-weight:600; padding:6px 12px;
          border-radius:8px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .15s ease;
          box-shadow:0 4px 12px rgba(0,0,0,.3); z-index:9999;
        }
        .sb-footer-icon:hover::after { opacity:1; }

        /* Mobile menu hotlines (kept full) */
        .hotline {
          font-size:12px; padding:10px 12px; border-radius:8px; background:var(--surface-input);
          color:var(--text-secondary); text-decoration:none; display:block; transition:all .2s ease;
        }
        .hotline:hover { color:var(--text-primary); background:var(--surface-hover); transform:translateX(-2px); }
        .hotline.red { color:var(--copper-600); }
        .hotline.personal-area { color:var(--link-color); border:1px solid rgba(184,149,106,.15); background:rgba(184,149,106,.06); }
        .hotline.personal-area:hover { color:var(--link-hover); background:rgba(184,149,106,.12); }
        .terms-link { cursor:pointer; border:none; text-align:right; font-family:'Heebo',sans-serif; width:100%; color:var(--text-secondary) !important; }
        .terms-link:hover { color:var(--text-secondary) !important; }

        /* ── Main ── */
        .main { flex:1; padding:clamp(20px,4vw,48px) clamp(16px,4vw,48px); max-width:920px; overflow-y:auto; }
        .pg-hdr { margin-bottom:28px; }
        .pg-hdr h1 { font-size:clamp(24px,3vw,32px); font-weight:900; letter-spacing:-0.03em; color:var(--stone-50); line-height:1.1; }
        .pg-hdr p { font-size:13.5px; color:var(--text-secondary); margin-top:8px; line-height:1.6; letter-spacing:0.01em; }

        /* ── Filter banner ── */
        .filter-banner {
          display:flex; align-items:center; gap:12px; padding:10px 16px;
          background:rgba(244,162,78,.08); border:1px solid rgba(244,162,78,.2);
          border-radius:10px; margin-bottom:16px; font-size:13.5px; color:var(--accent-primary);
        }
        .filter-banner-clear {
          margin-right:auto; background:none; border:1px solid rgba(244,162,78,.3);
          border-radius:8px; color:var(--accent-primary); font-family:'Heebo',sans-serif;
          font-size:12px; padding:4px 12px; cursor:pointer; transition:all .2s ease;
        }
        .filter-banner-clear:hover { background:rgba(244,162,78,.15); }

        /* ── Filters ── */
        .filters { margin-bottom:24px; }
        .srch {
          width:100%; max-width:340px; padding:11px 16px; background:var(--surface-input);
          border:1px solid var(--border-default); border-radius:8px; color:var(--text-primary);
          font-family:'Heebo',sans-serif; font-size:14px; direction:rtl; outline:none;
          margin-bottom:12px; transition:border-color var(--duration-fast) var(--ease-out-quad);
        }
        .srch:focus { border-color:var(--accent-primary); }
        .srch::placeholder { color:var(--text-muted); }
        .chips { display:flex; flex-wrap:wrap; gap:7px; }
        .chip {
          padding:6px 14px; border-radius:4px; border:1px solid var(--border-default);
          background:transparent; color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:12.5px; cursor:pointer; transition:all var(--duration-fast) var(--ease-out-quad);
        }
        .chip:hover { border-color:var(--stone-600); color:var(--stone-300); }
        .chip.on { background:rgba(244,162,78,.1); border-color:var(--accent-primary); color:var(--accent-primary); font-weight:700; }
        .past-toggle { font-size:12.5px; color:var(--text-secondary); margin-top:12px; display:flex; align-items:center; gap:7px; cursor:pointer; }

        /* ── Organizer legend ── */
        .org-legend { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
        .org-chip {
          display:flex; align-items:center; gap:7px; padding:7px 14px; border-radius:20px;
          border:1px solid var(--border-default); background:transparent; color:var(--text-secondary);
          font-family:'Heebo',sans-serif; font-size:12.5px; cursor:pointer; transition:all .2s ease;
        }
        .org-chip:hover { border-color:var(--stone-700); color:var(--stone-300); }
        .org-chip.on { font-weight:700; }
        .org-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .org-count { background:var(--border-default); color:var(--text-secondary); font-size:10px; padding:2px 7px; border-radius:10px; }

        /* ── Badges ── */
        .badge { font-size:10px; font-weight:700; padding:3px 8px; border-radius:3px; white-space:nowrap; letter-spacing:0.04em; }
        .cat-badge { background:var(--surface-deep); color:var(--text-secondary); border:1px solid var(--border-subtle); }
        .cat-badge[data-cat="כספי"] { background: rgba(217,119,6,.12); color: #d97706; border-color: transparent; }
        .cat-badge[data-cat="בריאות"] { background: rgba(22,163,74,.12); color: #16a34a; border-color: transparent; }
        .cat-badge[data-cat="משפטי"] { background: rgba(37,99,235,.12); color: #2563eb; border-color: transparent; }
        .cat-badge[data-cat="לימודים"] { background: rgba(139,92,246,.12); color: #8b5cf6; border-color: transparent; }
        .cat-badge[data-cat="תעסוקה"] { background: rgba(194,65,12,.12); color: #c2410c; border-color: transparent; }
        .cat-badge[data-cat="מיסים"] { background: rgba(202,138,4,.12); color: #ca8a04; border-color: transparent; }
        .cat-badge[data-cat="פנאי"] { background: rgba(6,182,212,.12); color: #06b6d4; border-color: transparent; }
        .urg-badge { }
        .free-badge { background:rgba(63,185,122,.12); color:var(--status-success); }
        .soon-badge { background:rgba(244,162,78,.12); color:var(--accent-primary); animation:pulse 2.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.65} }
        .org-badge { }
        .ext-link { display:inline-block; margin-top:12px; font-size:13px; color:var(--link-color); text-decoration:none; font-weight:600; transition:color var(--duration-fast) var(--ease-out-quad); }
        .ext-link:hover { color:var(--link-hover); }

        /* ── Rights cards ── */
        .stack { display:flex; flex-direction:column; gap:12px; }
        .card {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:22px 26px; cursor:pointer; position:relative;
          transition:border-color var(--duration-fast) var(--ease-out-quad);
        }
        .card:hover { border-color:var(--border-accent); }
        .card.open { border-color:var(--border-accent); background:var(--surface-hover); }
        .card-row { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
        .card-h { font-size:16.5px; font-weight:700; margin-bottom:6px; line-height:1.4; color:var(--stone-50); letter-spacing:-0.02em; }
        .card-sub { font-size:13.5px; color:var(--stone-300); line-height:1.7; }
        .card-body { margin-top:16px; padding-top:16px; border-top:1px solid var(--border-default); font-size:14px; color:var(--text-primary); line-height:1.8; }
        .tip-box {
          margin-top:14px; background:rgba(244,162,78,.06); border:1px solid rgba(244,162,78,.15);
          border-radius:10px; padding:14px 16px; font-size:13.5px; line-height:1.7; color:#d4b896;
        }
        .chev { position:absolute; left:22px; top:24px; font-size:9px; color:var(--text-muted); transition:transform .25s ease; }
        .card.open .chev { transform:rotate(180deg); }

        /* ── Right status buttons ── */
        .right-status { display:flex; align-items:center; gap:8px; margin-top:14px; flex-wrap:wrap; }
        .right-status-label { font-size:12px; color:var(--text-secondary); font-weight:600; }
        .status-btn {
          padding:6px 14px; border-radius:8px; border:1px solid var(--border-default);
          background:transparent; color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; transition:all .2s ease;
        }
        .status-btn:hover { border-color:var(--stone-700); color:var(--stone-300); }
        .status-btn.active { background:rgba(244,162,78,.12); border-color:var(--accent-primary); color:var(--accent-primary); font-weight:700; }
        .status-btn.in-prog.active { background:rgba(78,203,138,.1); border-color:var(--status-success); color:var(--status-success); }
        .status-btn.done.active { background:rgba(52,211,153,.12); border-color:var(--status-success-light); color:var(--status-success-light); }

        /* ── Event cards ── */
        .ev-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
        .ev-card {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:22px 24px; transition:border-color var(--duration-fast) var(--ease-out-quad);
        }
        .ev-card:hover { border-color:var(--border-accent); }
        .ev-top { display:flex; gap:7px; margin-bottom:12px; flex-wrap:wrap; }
        .ev-h { font-size:15.5px; font-weight:700; margin-bottom:8px; line-height:1.4; color:var(--stone-50); letter-spacing:-0.01em; }
        .ev-meta { font-size:12.5px; color:var(--text-secondary); margin-bottom:12px; display:flex; flex-direction:column; gap:5px; }
        .ev-desc { font-size:13.5px; color:var(--text-secondary); line-height:1.7; }
        .ev-foot { margin-top:14px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
        .ev-reg { font-size:12.5px; color:var(--text-secondary); }

        /* ── Updates ── */
        .update-card {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:22px 26px; transition:border-color var(--duration-fast) var(--ease-out-quad);
        }
        .update-card:hover { border-color:var(--stone-600); }
        .upd-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .upd-date { font-size:11.5px; color:var(--text-secondary); font-weight:600; }
        .update-card h3 { font-size:16px; font-weight:700; margin-bottom:8px; color:var(--stone-50); }
        .update-card p { font-size:13.5px; color:var(--text-secondary); line-height:1.75; }
        .update-card.high { border-inline-start:3px solid var(--copper-600); }
        .update-card.medium { border-inline-start:3px solid var(--accent-primary); }

        /* ── Empty ── */
        .empty { color:var(--text-secondary); padding:48px; text-align:center; font-size:14.5px; line-height:1.6; }
        .empty-state { text-align:center; padding:80px 20px; color:var(--text-secondary); }
        .empty-icon { font-size:48px; opacity:.4; color: var(--copper-400); margin-bottom:16px; }

        /* ── Knowledge ── */
        .knowledge-explainer {
          display:flex; gap:14px; align-items:flex-start;
          background:rgba(244,162,78,.06); border:1px solid rgba(244,162,78,.15);
          border-radius:8px; padding:18px 22px; margin-bottom:20px;
        }
        .knowledge-explainer-icon { font-size:28px; flex-shrink:0; }
        .knowledge-explainer-text { font-size:14px; color:var(--text-secondary); line-height:1.7; }
        .knowledge-explainer-text strong { color:var(--stone-50); }
        .knowledge-login-hint {
          color:var(--text-secondary); font-size:13px; margin-bottom:16px;
          padding:10px 16px; background:rgba(250,250,249,.03); border-radius:10px;
        }
        .knowledge-form-label {
          display:block; font-size:13px; color:var(--text-secondary); margin-bottom:4px; font-weight:500;
        }
        .knowledge-share-btn {
          padding:10px 22px; border-radius:20px; border:1px solid rgba(244,162,78,.3);
          background:rgba(244,162,78,.08); color:var(--accent-primary); font-family:'Heebo',sans-serif;
          font-size:14px; font-weight:600; cursor:pointer; transition:all .2s ease;
        }
        .knowledge-share-btn:hover { background:rgba(244,162,78,.15); }
        .knowledge-form {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:20px 24px; margin-bottom:16px;
        }
        .knowledge-card {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:22px 26px; transition:border-color var(--duration-fast) var(--ease-out-quad);
        }
        .knowledge-card:hover { border-color:var(--border-accent); }
        .knowledge-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .knowledge-date { font-size:11.5px; color:var(--text-secondary); }
        .knowledge-title { font-size:16px; font-weight:700; color:var(--stone-50); margin-bottom:8px; }
        .knowledge-content { font-size:14px; color:var(--text-secondary); line-height:1.75; }
        .knowledge-foot { margin-top:12px; display:flex; align-items:center; }
        .knowledge-vote-btn {
          padding:6px 14px; border-radius:20px; border:1px solid var(--border-default);
          background:transparent; color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer; transition:all .2s ease;
        }
        .knowledge-vote-btn:hover:not(:disabled) { border-color:var(--accent-primary); color:var(--accent-primary); }
        .knowledge-vote-btn.voted { background:rgba(244,162,78,.12); border-color:var(--accent-primary); color:var(--accent-primary); font-weight:700; }
        .knowledge-vote-btn:disabled { cursor:default; opacity:.6; }

        /* ── Tips ── */
        .tips-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
        .tip-card {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:24px 24px 20px; position:relative; transition:all .25s ease;
        }
        .tip-card:hover { border-color:var(--border-accent); }
        .tip-card-num {
          position:absolute; top:16px; left:16px; width:28px; height:28px;
          background:rgba(244,162,78,.12); border-radius:50%; display:flex;
          align-items:center; justify-content:center; font-size:13px;
          font-weight:900; color:var(--accent-primary);
        }
        .tip-card-title { font-size:15.5px; font-weight:700; color:var(--stone-50); margin-bottom:10px; line-height:1.4; letter-spacing:-0.01em; }
        .tip-card-content { font-size:13.5px; color:var(--text-secondary); line-height:1.75; }
        .tip-card-action {
          margin-top:12px; padding:8px 14px; background:rgba(184,149,106,.06);
          border:1px solid rgba(184,149,106,.15); border-radius:8px;
          font-size:13px; color:var(--link-color); direction:ltr; text-align:left;
        }

        /* ── Terms ── */
        .terms-content { display:flex; flex-direction:column; gap:16px; }
        .terms-section {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:22px 26px;
        }
        .terms-section h3 { font-size:16px; font-weight:700; color:var(--stone-50); margin-bottom:10px; }
        .terms-section p { font-size:14px; color:var(--text-secondary); line-height:1.8; margin-bottom:8px; }
        .terms-section p:last-child { margin-bottom:0; }
        .terms-section strong { color:var(--accent-primary); }

        /* ── Privacy actions ── */
        .privacy-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
        .privacy-btn {
          padding:8px 14px; border-radius:8px; border:1px solid rgba(224,82,82,.2);
          background:rgba(224,82,82,.06); color:var(--status-urgent); font-family:'Heebo',sans-serif;
          font-size:12px; cursor:pointer; transition:all .2s ease;
        }
        .privacy-btn:hover { background:rgba(224,82,82,.12); border-color:var(--status-urgent); }

        /* ── Chat outer ── */
        .chat-outer { display:flex; flex-direction:column; gap:16px; }

        /* Privacy banner — with fade out */
        .privacy-banner {
          display:flex; align-items:center; gap:14px;
          background:rgba(78,203,138,.06); border:1px solid rgba(78,203,138,.15);
          border-radius:8px; padding:14px 18px; font-size:13px; color:var(--stone-400); line-height:1.6;
          overflow:hidden;
          animation:bannerFade 18s ease-in-out forwards;
        }
        @keyframes bannerFade {
          0%,70% { opacity:1; max-height:100px; padding:14px 18px; margin-bottom:0; }
          85% { opacity:0; max-height:100px; padding:14px 18px; }
          100% { opacity:0; max-height:0; padding:0 18px; margin-bottom:0; border-width:0; pointer-events:none; }
        }
        .prv-icon { font-size:10px; flex-shrink:0; color:var(--status-success); }
        .prv-close { margin-right:auto; background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px; padding:2px 6px; transition:.2s; }
        .prv-close:hover { color:var(--text-primary); }

        /* ── Welcome Screen ── */
        .welcome-screen {
          display:flex; flex-direction:column;
          padding:20px 0 20px; min-height:50vh;
        }
        .welcome-header { margin-bottom:32px; }
        .welcome-title {
          font-size:32px; font-weight:700; color:var(--text-primary); margin-bottom:6px;
        }
        .welcome-subtitle {
          font-size:16px; color:var(--text-secondary); margin-bottom:36px;
        }

        /* Featured magen card */
        .welcome-card-featured {
          display:flex; align-items:center; gap:20px;
          background:var(--surface-card); border:2px solid var(--accent-primary);
          border-radius:8px; padding:28px 24px; cursor:pointer;
          font-family:Heebo,sans-serif; text-align:right; width:100%; max-width:560px;
          animation:welcomeCardIn var(--duration-slow) var(--ease-out-expo) both;
          transition:all 0.4s ease; position:relative;
        }
        .welcome-card-featured:hover {
          border-color:var(--accent-hover); transform:translateY(-2px);
          background:rgba(244,162,78,.04);
        }
        .welcome-card-featured:active { transform:scale(0.99); }
        .wcf-icon-wrap {
          width:56px; height:56px; border-radius:50%; display:flex; flex-shrink:0;
          align-items:center; justify-content:center; font-size:28px;
          background:rgba(244,162,78,.12); border:2px solid rgba(244,162,78,.25);
        }
        .wcf-content { flex:1; min-width:0; }
        .wcf-name { font-size:22px; font-weight:800; color:var(--accent-primary); margin-bottom:4px; letter-spacing:-0.02em; }
        .wcf-role { font-size:14px; color:var(--text-primary); margin-bottom:6px; font-weight:600; }
        .wcf-desc { font-size:13px; color:var(--text-secondary); line-height:1.6; }
        .wcf-arrow {
          font-size:20px; color:var(--accent-primary); flex-shrink:0; opacity:0.6;
          transition:opacity 0.2s ease, transform 0.2s ease;
        }
        .welcome-card-featured:hover .wcf-arrow { opacity:1; transform:translateX(-4px); }

        /* Specialist compact row */
        .welcome-specialists {
          display:flex; flex-direction:column; align-items:center; gap:10px;
          margin-top:28px; max-width:560px; width:100%;
        }
        .specialists-label {
          font-size:12px; color:var(--text-secondary); font-weight:500;
          letter-spacing:0.03em;
        }
        .specialists-row {
          display:flex; gap:8px; flex-wrap:wrap; justify-content:center;
        }
        .specialist-chip {
          display:flex; align-items:center; gap:6px;
          background:var(--surface-card); border:1px solid var(--border-default);
          border-radius:20px; padding:6px 14px; cursor:pointer;
          font-family:Heebo,sans-serif; font-size:13px; color:var(--text-secondary);
          transition:all 0.15s ease;
        }
        .specialist-chip:hover {
          border-color:var(--copper-500); color:var(--text-primary);
          background:rgba(217,119,6,.06);
        }
        .specialist-emoji { font-size:15px; }
        .specialist-name { font-weight:500; }
        .welcome-card {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px;
          padding:18px 14px; cursor:pointer; text-align:center;
          font-family:Heebo,sans-serif;
          animation:welcomeCardIn var(--duration-slow) var(--ease-out-expo) both;
          transition:all 0.4s ease;
        }
        .welcome-card-secondary {
          padding:16px 12px;
        }
        .welcome-card:hover {
          border-color:rgba(244,162,78,.35); transform:translateY(-2px);
        }
        .welcome-card:active { transform:scale(0.98); }
        .wc-icon-wrap {
          width:40px; height:40px; border-radius:50%; display:inline-flex;
          align-items:center; justify-content:center; font-size:18px;
          background:rgba(244,162,78,.08); margin-bottom:8px;
        }
        .wc-name { font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:2px; }
        .wc-role { font-size:11px; color:var(--accent-primary); margin-bottom:0; }
        .wc-desc { font-size:12.5px; color:var(--text-secondary); line-height:1.6; }

        @keyframes welcomeCardIn {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .welcome-card, .welcome-card-featured { animation:none; opacity:1; }
        }

        /* Floating tip */
        .floating-tip {
          margin-top:32px; padding:12px 20px; border-radius:8px;
          background:var(--surface-deep); border:1px solid var(--border-subtle);
          font-size:13px; color:var(--text-secondary); text-align:center;
          transition:opacity 0.8s ease; max-width:480px;
          border-inline-start:3px solid var(--accent-primary);
        }
        .tip-visible { opacity:1; }
        .tip-hidden { opacity:0; }

        /* Back to welcome */
        .back-welcome-btn {
          background:transparent; border:1px solid var(--border-subtle); border-radius:8px;
          color:var(--text-secondary); font-size:16px; cursor:pointer; padding:4px 10px;
          transition:all .2s; font-family:Heebo,sans-serif;
        }
        .back-welcome-btn:hover { border-color:var(--accent-primary); color:var(--stone-50); }

        @media (max-width:700px) {
          .welcome-grid { grid-template-columns:repeat(2, 1fr); }
          .welcome-card:last-child:nth-child(odd) { grid-column:1 / -1; max-width:220px; justify-self:center; }
        }
        @media (max-width:400px) {
          .welcome-grid { grid-template-columns:1fr 1fr; gap:8px; }
          .welcome-card-featured { padding:20px 16px; gap:14px; }
          .wcf-icon-wrap { width:44px; height:44px; font-size:22px; }
          .wcf-name { font-size:18px; }
        }

        /* Hat selector */
        .hat-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; transition:all .3s ease; }
        .hat-row-mini {
          position:fixed; bottom:20px; left:20px; z-index:50;
          background:var(--stone-900); border:1px solid var(--border-default); border-radius:8px;
          padding:8px 12px; gap:6px; box-shadow:0 4px 24px rgba(0,0,0,.4);
        }
        .hat-row-mini .hat-name { display:none; }
        .hat-row-mini .hat-btn { padding:8px 10px; }
        .hat-label { font-size:13.5px; color:var(--text-secondary); font-weight:600; }
        .hat-btn {
          display:flex; align-items:center; gap:8px; padding:10px 18px; border-radius:8px;
          border:1px solid var(--border-default); background:var(--surface-card); color:var(--text-secondary);
          font-family:'Heebo',sans-serif; font-size:14px; cursor:pointer; transition:all .25s ease;
        }
        .hat-btn:hover { border-color:rgba(244,162,78,.3); color:var(--stone-300); background:var(--surface-hover); }
        .hat-btn.active { border-color:var(--accent-primary); background:rgba(244,162,78,.08); color:var(--accent-primary); font-weight:700; }
        .hat-icon { font-size:18px; }
        .hat-name { font-weight:600; }

        /* City selector */
        .city-row { display:flex; gap:8px; flex-wrap:wrap; }
        .city-btn {
          padding:7px 16px; border-radius:20px; border:1px solid var(--border-default);
          background:transparent; color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:12.5px; cursor:pointer; transition:all .2s ease;
        }
        .city-btn:hover { border-color:rgba(52,211,153,.4); color:var(--stone-300); background:rgba(52,211,153,.05); }
        .city-btn.active { background:rgba(52,211,153,.12); border-color:var(--status-success-light); color:var(--status-success-light); font-weight:700; }

        /* Magen hat accent — primary copper */
        .hat-btn.hat-magen { border-color:rgba(244,162,78,.3); }
        .hat-btn.hat-magen .hat-name { font-weight:700; }
        .hat-btn.active.hat-magen { border-color:var(--accent-primary); background:rgba(244,162,78,.12); color:var(--accent-primary); border-width:2px; }

        /* Events hat accent */
        .hat-btn.active.hat-events { border-color:var(--status-success-light); background:rgba(52,211,153,.08); color:var(--status-success-light); }

        /* Chat window */
        .chat-wrap {
          background:var(--surface-card); border:1px solid var(--border-default); border-radius:8px; overflow:hidden;
          display:flex; flex-direction:column; height:calc(100vh - 340px); max-height:580px;
        }
        /* Psycho mode — fullscreen chat */
        .psycho-mode .chat-wrap-full {
          height:calc(100vh - 200px); max-height:none;
        }
        .chat-hdr { display:flex; flex-direction:column; border-bottom:1px solid var(--border-default); }
        .chat-hdr-top { display:flex; align-items:center; gap:14px; padding:16px 20px; }
        .chat-hdr-info { flex:1; min-width:0; }
        .chat-ava {
          width:40px; height:40px; background:rgba(244,162,78,.08); border:1px solid rgba(244,162,78,.2);
          border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:16px; font-weight:700; color:var(--accent-primary); flex-shrink:0;
        }
        .chat-name { font-size:15px; font-weight:700; color:var(--stone-50); letter-spacing:-0.01em; }
        .chat-sub { font-size:11px; color:var(--text-secondary); letter-spacing:0.02em; }
        .chat-online { font-size:11px; color:var(--status-success); }
        .login-hint-toast {
          position:fixed; top:90px; left:40px; z-index:61;
          background:var(--surface-card); border:1px solid rgba(244,162,78,.25); border-radius:10px;
          padding:10px 16px; font-size:13px; color:var(--stone-300);
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
          width:32px; height:32px; border-radius:8px; border:1px solid var(--border-default);
          background:transparent; color:var(--text-secondary); font-size:14px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:all .2s ease;
        }
        .chat-history-btn:hover { border-color:var(--stone-700); color:var(--stone-300); background:rgba(250,250,249,.03); }

        /* ── Chat History Drawer ── */
        .chat-history {
          border-bottom:1px solid var(--border-default); padding:12px 16px; background:var(--stone-900);
          max-height:200px; overflow-y:auto;
        }
        .history-header {
          display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;
          font-size:13px; font-weight:600; color:var(--text-secondary);
        }
        .history-new-btn {
          padding:4px 12px; border-radius:6px; border:1px solid rgba(244,162,78,.3);
          background:rgba(244,162,78,.08); color:var(--accent-primary); font-family:'Heebo',sans-serif;
          font-size:11.5px; cursor:pointer; transition:all .2s ease;
        }
        .history-new-btn:hover { background:rgba(244,162,78,.15); }
        .history-empty { font-size:12.5px; color:var(--text-muted); text-align:center; padding:8px; }
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
        .history-item-btn:hover { background:rgba(250,250,249,.03); }
        .history-title { font-size:13px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px; }
        .history-date { font-size:11px; color:var(--text-muted); flex-shrink:0; }
        .history-delete {
          width:24px; height:24px; border:none; background:transparent;
          color:var(--text-muted); cursor:pointer; font-size:12px; border-radius:4px;
          display:flex; align-items:center; justify-content:center;
        }
        .history-delete:hover { color:var(--status-urgent); background:rgba(224,82,82,.08); }
        .chat-msgs { flex:1; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:18px; }
        .msg { display:flex; gap:10px; align-items:flex-start; animation:msgIn .3s ease; }
        .msg.user { flex-direction:row-reverse; }
        @keyframes msgIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .msg-ava { width:30px; height:30px; background:var(--surface-card); border:1px solid var(--border-subtle); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:var(--accent-primary); flex-shrink:0; }
        .bubble { max-width:78%; padding:14px 18px; border-radius:8px; font-size:14px; line-height:1.85; white-space:pre-wrap; }
        .msg.user .bubble { background:rgba(244,162,78,.08); color:var(--text-primary); border-inline-end:2px solid var(--accent-primary); }
        .msg.assistant .bubble { background:var(--surface-card); border:1px solid var(--border-default); color:var(--text-primary); }

        /* Nusach (prepared text) block */
        .nusach-block {
          margin:10px 0; padding:12px 14px; background:rgba(78,203,138,.08); border:1px solid rgba(78,203,138,.25);
          border-radius:10px; position:relative;
        }
        .nusach-text { font-size:14px; line-height:1.7; color:var(--stone-50); white-space:pre-wrap; }
        .nusach-copy {
          display:inline-flex; align-items:center; gap:6px; margin-top:10px;
          padding:7px 16px; border-radius:8px; border:1px solid rgba(78,203,138,.3);
          background:rgba(78,203,138,.12); color:var(--status-success); font-size:13px; font-weight:600;
          cursor:pointer; transition:all .2s;
        }
        .nusach-copy:hover { background:rgba(78,203,138,.22); }
        .nusach-copy.copied { background:rgba(78,203,138,.25); color:#fff; }

        /* Bookmarklet block */
        .bookmarklet-block {
          margin:10px 0; padding:14px; background:rgba(244,162,78,.08);
          border:1px solid rgba(244,162,78,.25); border-radius:10px;
        }
        .bookmarklet-header { font-weight:700; color:var(--accent-primary); margin-bottom:6px; }
        .bookmarklet-desc { font-size:13px; color:var(--text-muted); margin-bottom:10px; }
        .bookmarklet-btn {
          display:inline-block; padding:10px 20px; background:var(--copper-600);
          color:#fff; border-radius:8px; text-decoration:none; font-weight:600;
          font-size:14px; cursor:grab;
        }
        .bookmarklet-btn:hover { background:#d4623e; }
        .bookmarklet-steps { margin-top:12px; font-size:13px; color:var(--text-muted); }
        .bookmarklet-steps ol { padding-right:20px; margin:6px 0 0; }
        .bookmarklet-steps li { margin:4px 0; }
        .bookmarklet-steps a { color:var(--copper-600); }
        @media (max-width:760px) {
          .bookmarklet-block { display:none; }
        }

        /* Typing cursor */
        .typing-cursor { animation:blink 1s infinite; color:var(--accent-primary); font-weight:300; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

        .typing { display:flex !important; gap:6px; align-items:center; padding:16px 20px !important; }
        .typing span { width:7px; height:7px; background:var(--accent-primary); border-radius:50%; animation:bop 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay:.2s; }
        .typing span:nth-child(3) { animation-delay:.4s; }
        @keyframes bop { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }

        /* Attachment preview above input */
        .attachment-preview {
          display:flex; align-items:center; gap:10px; padding:8px 18px;
          border-top:1px solid var(--border-default); background:var(--stone-900);
        }
        .attach-thumb { width:48px; height:48px; border-radius:8px; object-fit:cover; }
        .attach-file-name { font-size:12.5px; color:var(--text-secondary); }
        .attach-remove {
          margin-right:auto; background:transparent; border:none; color:var(--text-secondary);
          cursor:pointer; font-size:14px; padding:4px 8px; border-radius:4px;
        }
        .attach-remove:hover { color:var(--status-urgent); }

        /* Message attachments */
        .msg-attachment { margin-bottom:8px; }
        .msg-attach-img { max-width:200px; max-height:150px; border-radius:10px; }
        .msg-attach-file { font-size:12px; color:var(--text-secondary); background:var(--surface-hover); padding:6px 10px; border-radius:6px; }

        /* Chat input row */
        .chat-inp-row { display:flex; gap:8px; padding:14px 18px; border-top:1px solid var(--border-default); align-items:flex-end; }
        .attach-btn, .camera-btn, .voice-btn {
          width:36px; height:36px; border-radius:8px; border:1px solid var(--border-default);
          background:var(--stone-950); color:var(--text-secondary); font-size:16px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          transition:all .2s ease;
        }
        .attach-btn:hover, .camera-btn:hover, .voice-btn:hover { border-color:var(--stone-700); color:var(--stone-300); }
        .camera-btn { display:none; } /* shown only on mobile */
        .voice-btn.recording { background:rgba(224,82,82,.15); border-color:var(--status-urgent); color:var(--status-urgent); animation:pulse 1.5s infinite; }

        .chat-inp {
          flex:1; padding:9px 16px; background:var(--surface-input); border:1px solid var(--border-default); border-radius:8px;
          color:var(--text-primary); font-family:'Heebo',sans-serif; font-size:14px; direction:rtl; outline:none;
          transition:border-color var(--duration-fast) var(--ease-out-quad); resize:none; min-height:36px; max-height:80px; line-height:1.5;
        }
        .chat-inp-multi { max-height:120px; }
        .chat-inp:focus { border-color:var(--accent-primary); }
        .chat-inp::placeholder { color:var(--text-muted); }
        .chat-send {
          width:42px; height:36px; background:var(--accent-primary);
          border:none; border-radius:6px; color:var(--stone-950); font-size:17px; font-weight:700; cursor:pointer;
          transition:background var(--duration-fast) var(--ease-out-quad); flex-shrink:0;
        }
        .chat-send:hover:not(:disabled) { background:var(--accent-hover); }
        .chat-send:disabled { background:var(--border-default); cursor:not-allowed; color:var(--text-muted); }
        .chat-disclaimer { font-size:11.5px; color:var(--text-muted); text-align:center; }

        /* ── Token Badge ── */
        .token-badge {
          display:inline-flex; align-items:center; gap:4px;
          background:var(--surface-deep); border:1px solid var(--border-subtle); border-radius:4px;
          padding:4px 10px; font-size:11px; color:var(--stone-50); cursor:pointer;
          transition:all .2s; margin-inline-start:auto;
          font-family:'IBM Plex Mono',monospace; font-weight:600; letter-spacing:-0.02em;
        }
        .token-badge:hover { border-color:var(--accent-primary); }
        .tb-green { color:var(--status-success); border-color:rgba(78,203,138,.3); }
        .tb-yellow { color:var(--accent-primary); border-color:rgba(244,162,78,.3); }
        .tb-red { color:var(--status-urgent); border-color:rgba(224,82,82,.3); }

        /* ── Token Expand (inline in sub row) ── */
        .chat-sub-row {
          display:flex; align-items:center; gap:10px; margin-top:2px;
        }
        .token-expand {
          display:inline-flex; align-items:center; gap:4px;
          background:none; border:none; cursor:pointer; padding:0;
          font-family:'IBM Plex Mono',monospace;
        }
        .token-expand-sum {
          font-size:11px; font-weight:600; color:var(--stone-400);
          letter-spacing:-0.02em;
        }
        .token-expand-unit {
          font-size:9.5px; font-weight:400; color:var(--text-muted);
          font-family:Heebo,sans-serif; letter-spacing:0.02em;
        }
        .token-expand-caret {
          display:inline-block; width:0; height:0;
          border-inline-start:3.5px solid transparent;
          border-inline-end:3.5px solid transparent;
          border-top:4px solid var(--stone-600);
          transition:transform var(--duration-fast) var(--ease-out-quad);
        }
        .token-expand-caret.open { transform:rotate(180deg); }
        .token-expand:hover .token-expand-sum { color:var(--stone-300); }
        .token-expand:hover .token-expand-caret { border-top-color:var(--stone-400); }

        /* ── Feature Ledger ── */
        .feature-ledger {
          border-top:1px solid var(--border-subtle);
          padding:0 20px;
          animation:fadeIn .12s;
        }
        .ledger-row {
          display:grid; grid-template-columns:3px 1fr 48px 42px;
          gap:0 10px; align-items:center;
          padding:7px 0;
          border-bottom:1px solid rgba(255,255,255,.03);
        }
        .ledger-row:last-of-type { border-bottom:none; }
        .ledger-indicator {
          width:3px; height:14px; border-radius:1px;
          background:var(--stone-700); transition:background var(--duration-fast);
        }
        .ledger-on .ledger-indicator { background:var(--olive-400); }
        .ledger-locked .ledger-indicator { background:var(--stone-800); }
        .ledger-name {
          font-size:12px; font-weight:500; color:var(--text-secondary);
          letter-spacing:-0.01em;
        }
        .ledger-on .ledger-name { color:var(--stone-300); }
        .ledger-locked .ledger-name { color:var(--stone-600); }
        .ledger-cost {
          font-size:10.5px; font-family:'IBM Plex Mono',monospace;
          font-weight:500; color:var(--stone-500); text-align:left;
          letter-spacing:-0.02em;
        }
        .ledger-on .ledger-cost { color:var(--stone-400); }
        .ledger-status {
          font-size:9.5px; font-weight:600; letter-spacing:0.03em;
          text-align:center; font-family:Heebo,sans-serif;
        }
        .ledger-fixed {
          color:var(--olive-400); opacity:.7;
        }
        .ledger-upgrade {
          color:var(--accent-primary); background:none; border:none;
          cursor:pointer; padding:0; font-family:Heebo,sans-serif;
          font-size:9.5px; font-weight:600;
        }
        .ledger-upgrade:hover { text-decoration:underline; }
        .ledger-toggle {
          color:var(--stone-600); background:none; border:none;
          cursor:pointer; padding:2px 0; font-family:Heebo,sans-serif;
          font-size:9.5px; font-weight:600;
          transition:color var(--duration-fast);
        }
        .ledger-toggle:hover { color:var(--stone-400); }
        .ledger-toggle-on { color:var(--olive-400); }
        .ledger-toggle-on:hover { color:var(--status-urgent); }
        .ledger-total {
          display:grid; grid-template-columns:3px 1fr 48px 42px;
          gap:0 10px; align-items:center;
          padding:6px 0 8px;
          border-top:1px solid var(--border-subtle);
        }
        .ledger-total-label {
          grid-column:2; font-size:11px; font-weight:600;
          color:var(--stone-400); letter-spacing:0.02em;
        }
        .ledger-total-value {
          font-size:11px; font-family:'IBM Plex Mono',monospace;
          font-weight:700; color:var(--stone-200); letter-spacing:-0.02em;
        }
        .feature-switch-sm {
          position:relative; width:28px; height:16px; display:inline-block;
        }
        .feature-switch-sm input { opacity:0; width:0; height:0; }
        .feature-slider-sm {
          position:absolute; inset:0; background:var(--stone-700); border-radius:8px;
          cursor:pointer; transition:background .15s;
        }
        .feature-slider-sm::before {
          content:""; position:absolute; width:12px; height:12px; border-radius:50%;
          background:#fff; top:2px; left:2px; transition:transform .15s;
        }
        .feature-switch-sm input:checked + .feature-slider-sm { background:var(--status-success); }
        .feature-switch-sm input:checked + .feature-slider-sm::before { transform:translateX(12px); }
        .feature-panel-title {
          font-size:12px; font-weight:700; color:var(--stone-50); margin-bottom:10px;
        }
        .feature-beta {
          font-size:10px; color:var(--status-success); background:rgba(78,203,138,.1);
          padding:2px 8px; border-radius:6px; margin-right:8px; font-weight:400;
        }
        .feature-row {
          display:flex; align-items:center; gap:8px; padding:7px 0;
          border-bottom:1px solid rgba(255,255,255,.04);
        }
        .feature-row:last-of-type { border-bottom:none; }
        .feature-locked { opacity:.45; }
        .feature-icon { font-size:16px; flex-shrink:0; width:24px; text-align:center; }
        .feature-info { flex:1; min-width:0; }
        .feature-label { font-size:12px; color:var(--stone-50); font-weight:600; display:block; }
        .feature-desc { font-size:10px; color:var(--text-muted); }
        .feature-cost { font-size:10px; color:var(--text-muted); flex-shrink:0; font-family:Heebo,sans-serif; }
        .feature-always {
          font-size:9px; color:var(--status-success); background:rgba(78,203,138,.1);
          padding:2px 6px; border-radius:6px; flex-shrink:0;
        }
        .feature-upgrade {
          font-size:10px; color:var(--accent-primary); background:rgba(244,162,78,.1);
          border:1px solid rgba(244,162,78,.3); border-radius:6px;
          padding:2px 8px; cursor:pointer; flex-shrink:0;
        }
        .feature-upgrade:hover { background:rgba(244,162,78,.2); }
        .feature-total {
          margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.06);
          font-size:11px; color:var(--text-secondary); text-align:center;
        }
        .feature-total strong { color:var(--stone-50); }

        /* Feature toggle switch */
        .feature-switch {
          position:relative; width:34px; height:18px; flex-shrink:0;
        }
        .feature-switch input { opacity:0; width:0; height:0; position:absolute; }
        .feature-slider {
          position:absolute; inset:0; background:var(--border-subtle); border-radius:9px;
          cursor:pointer; transition:all .2s;
        }
        .feature-slider::before {
          content:""; position:absolute; width:14px; height:14px;
          border-radius:50%; background:#5a6478;
          bottom:2px; right:2px; transition:all .2s;
        }
        .feature-switch input:checked + .feature-slider { background:rgba(78,203,138,.2); }
        .feature-switch input:checked + .feature-slider::before {
          background:var(--status-success); transform:translateX(-16px);
        }

        /* ── Pricing Modal ── */
        .pricing-overlay {
          position:fixed; top:0; left:0; right:0; bottom:0;
          background:rgba(0,0,0,.7); z-index:1000;
          display:flex; align-items:center; justify-content:center;
          padding:20px;
        }
        .pricing-modal {
          background:var(--surface-deep); border:1px solid var(--border-subtle); border-radius:8px;
          padding:32px 24px; max-width:520px; width:100%; position:relative;
          max-height:85vh; overflow-y:auto;
        }
        .pricing-close {
          position:absolute; top:12px; left:12px; background:none; border:none;
          color:var(--text-muted); font-size:18px; cursor:pointer;
        }
        .pricing-close:hover { color:var(--stone-50); }
        .pricing-title {
          text-align:center; color:var(--stone-50); font-size:22px; margin-bottom:24px;
        }
        .phone-prompt { text-align:center; padding:20px 0; }
        .phone-prompt-desc {
          color:var(--text-secondary); font-size:14px; line-height:1.7;
          margin-bottom:20px; max-width:320px; margin-inline:auto;
        }
        .phone-prompt-input {
          display:block; width:100%; max-width:280px; margin:0 auto 20px;
          padding:12px 16px; font-size:18px; font-family:'Heebo',sans-serif;
          background:var(--stone-800); border:1px solid var(--border-default);
          border-radius:8px; color:var(--text-primary); text-align:center;
          letter-spacing:1px;
        }
        .phone-prompt-input:focus { border-color:var(--accent-primary); outline:none; }
        .phone-prompt-actions { display:flex; flex-direction:column; align-items:center; gap:12px; }
        .phone-prompt-back {
          background:none; border:none; color:var(--text-secondary); font-size:13px;
          cursor:pointer; font-family:'Heebo',sans-serif;
        }
        .phone-prompt-back:hover { color:var(--text-primary); }

        /* ── Payment Success ── */
        .payment-success-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,.75); z-index:9999;
          display:flex; align-items:center; justify-content:center;
          animation:fadeIn .3s;
        }
        .payment-success-card {
          background:var(--stone-900); border:1px solid var(--status-success);
          border-radius:8px; padding:40px 32px; max-width:400px; width:90vw;
          text-align:center;
        }
        .payment-success-icon {
          width:56px; height:56px; border-radius:50%;
          background:rgba(22,163,106,.15); color:var(--status-success);
          font-size:28px; font-weight:700; display:flex; align-items:center;
          justify-content:center; margin:0 auto 20px;
        }
        .payment-success-card h3 {
          color:var(--stone-50); font-size:20px; font-weight:700; margin-bottom:12px;
        }
        .payment-success-card p {
          color:var(--text-secondary); font-size:14px; line-height:1.7; margin-bottom:8px;
        }
        .payment-success-sub {
          font-size:12.5px; color:var(--text-muted); margin-bottom:24px;
        }
        .payment-success-btn {
          background:var(--status-success); color:#fff; border:none; border-radius:6px;
          padding:12px 32px; font-size:15px; font-weight:700; cursor:pointer;
          font-family:'Heebo',sans-serif; transition:background .15s;
        }
        .payment-success-btn:hover { background:#15803d; }
        .pricing-grid {
          display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));
          gap:12px;
        }
        .plan-card {
          background:var(--stone-950); border:1px solid var(--border-subtle); border-radius:8px;
          padding:20px 16px; text-align:center; transition:border-color .2s;
        }
        .plan-card:hover { border-color:var(--accent-primary); }
        .plan-featured { border-color:var(--accent-primary); box-shadow:0 0 20px rgba(244,162,78,.1); }
        .plan-icon { font-size:22px; margin-bottom:8px; color:var(--accent-primary); }
        .plan-name { color:var(--stone-50); font-weight:600; font-size:16px; margin-bottom:4px; }
        .plan-price { color:var(--accent-primary); font-size:22px; font-weight:700; margin-bottom:4px; }
        .plan-period { font-size:13px; color:var(--text-secondary); font-weight:400; }
        .plan-desc { color:var(--text-secondary); font-size:12.5px; margin-bottom:14px; min-height:36px; }
        .plan-btn {
          width:100%; padding:8px; border-radius:8px; border:1px solid var(--border-subtle);
          background:var(--border-default); color:var(--stone-50); font-size:14px; cursor:pointer;
          font-family:Heebo,sans-serif; transition:all .2s;
        }
        .plan-btn:hover:not(:disabled) { background:var(--accent-primary); color:var(--stone-950); border-color:var(--accent-primary); }
        .plan-btn:disabled { opacity:.5; cursor:not-allowed; }
        .plan-btn-current { background:transparent; border-color:var(--status-success); color:var(--status-success); }
        .plan-btn-premium { background:linear-gradient(135deg,var(--accent-primary),var(--copper-600)); color:var(--stone-950); border:none; font-weight:600; }
        .plan-btn-premium:hover:not(:disabled) { box-shadow:0 4px 16px rgba(244,162,78,.4); }

        /* ── Mobile Header (hidden on desktop) ── */
        .mobile-header { display:none; }
        .mobile-overlay { display:none; }
        .mobile-menu { display:none; }

        /* ── Legal Case ── */
        .case-section { max-width:800px; }
        .case-login-prompt {
          text-align:center; padding:60px 20px; background:var(--surface-deep); border:1px solid var(--border-subtle);
          border-radius:8px; margin-top:20px;
        }
        .case-login-icon { font-size:48px; margin-bottom:16px; }
        .case-login-prompt p { color:var(--text-secondary); margin-bottom:20px; font-size:15px; }
        .case-login-prompt .auth-btn { max-width:280px; margin:0 auto; }

        /* Stage Timeline */
        .stage-timeline {
          display:flex; gap:8px; overflow-x:auto; padding:16px 4px; margin-bottom:20px;
          scrollbar-width:thin; scrollbar-color:var(--border-default) transparent;
        }
        .stage-node {
          display:flex; flex-direction:column; align-items:center; gap:6px;
          min-width:72px; flex-shrink:0;
        }
        .stage-circle {
          width:40px; height:40px; border-radius:50%; background:var(--surface-card); border:2px solid var(--stone-700);
          display:flex; align-items:center; justify-content:center; font-size:16px;
          transition:all .3s ease;
        }
        .stage-node.done .stage-circle { background:rgba(78,203,138,.15); border-color:var(--status-success); }
        .stage-node.active .stage-circle {
          background:rgba(224,82,82,.15); border-color:var(--status-urgent);
          box-shadow:0 0 12px rgba(224,82,82,.3);
        }
        .stage-label { font-size:10.5px; color:var(--text-secondary); text-align:center; white-space:nowrap; }
        .stage-node.active .stage-label { color:var(--status-urgent); font-weight:700; }
        .stage-node.done .stage-label { color:var(--status-success); }

        /* Case Card */
        .case-card {
          background:var(--surface-deep); border:1px solid var(--border-subtle); border-radius:8px;
          padding:20px 24px; margin-bottom:16px;
        }
        .case-card-header { display:flex; align-items:center; gap:14px; margin-bottom:12px; }
        .case-card-icon { font-size:28px; }
        .case-card-header h3 { font-size:17px; font-weight:700; color:var(--stone-50); margin:0; }
        .case-card-desc { font-size:13.5px; color:var(--text-secondary); margin-top:2px; }
        .case-next-action {
          background:rgba(244,162,78,.06); border:1px solid rgba(244,162,78,.15);
          border-radius:10px; padding:12px 16px; font-size:13.5px; color:var(--stone-300);
        }
        .case-next-action strong { color:var(--accent-primary); }

        /* Countdown */
        .countdown-card {
          background:linear-gradient(135deg, rgba(224,82,82,.1), rgba(244,162,78,.08));
          border:1px solid rgba(224,82,82,.25); border-radius:8px;
          padding:28px; text-align:center; margin-bottom:16px;
        }
        .countdown-number {
          font-size:64px; font-weight:900; color:var(--status-urgent);
          line-height:1; margin-bottom:4px;
          text-shadow:0 0 20px rgba(224,82,82,.3);
        }
        .countdown-text { font-size:18px; font-weight:700; color:var(--stone-300); }
        .countdown-date { font-size:13px; color:var(--text-secondary); margin-top:4px; }
        .countdown-past { border-color:rgba(78,203,138,.25); background:linear-gradient(135deg, rgba(78,203,138,.08), rgba(52,211,153,.05)); }
        .countdown-past .countdown-number { color:var(--status-success); text-shadow:0 0 20px rgba(78,203,138,.3); }

        /* Prep Section */
        .prep-section {
          background:var(--surface-deep); border:1px solid var(--border-subtle); border-radius:8px;
          padding:20px 24px; margin-bottom:16px;
        }
        .prep-title { font-size:16px; font-weight:700; color:var(--accent-primary); margin-bottom:6px; }
        .prep-desc { font-size:13px; color:var(--text-secondary); margin-bottom:16px; }
        .prep-tasks { display:flex; flex-direction:column; gap:12px; }
        .prep-task {
          background:var(--surface-input); border:1px solid var(--border-default); border-radius:10px;
          padding:14px 16px; transition:all .2s ease;
        }
        .prep-task.checked { border-color:rgba(78,203,138,.3); background:rgba(78,203,138,.05); }
        .prep-check-label {
          display:flex; align-items:center; gap:10px; cursor:pointer;
          font-size:14.5px; font-weight:600; color:var(--stone-300);
        }
        .prep-check-label input[type="checkbox"] {
          width:18px; height:18px; accent-color:var(--status-success); cursor:pointer;
        }
        .prep-task.checked .prep-task-title { text-decoration:line-through; color:var(--text-secondary); }
        .prep-task-desc { font-size:12.5px; color:var(--text-secondary); margin:6px 0 8px 28px; line-height:1.5; }
        .prep-ask-btn {
          margin-right:28px; padding:6px 14px; border-radius:8px;
          border:1px solid rgba(244,162,78,.2); background:rgba(244,162,78,.06);
          color:var(--accent-primary); font-family:'Heebo',sans-serif; font-size:12.5px;
          font-weight:600; cursor:pointer; transition:all .2s ease;
        }
        .prep-ask-btn:hover { background:rgba(244,162,78,.12); }

        /* Injury Tips */
        .injury-tips { margin-bottom:16px; }
        .injury-tips h3 { font-size:16px; font-weight:700; color:var(--stone-50); margin-bottom:14px; }
        .tip-boxes { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; }
        .tip-box {
          background:var(--surface-deep); border:1px solid var(--border-subtle); border-radius:8px;
          padding:16px 18px;
        }
        .tip-box h4 { font-size:13.5px; font-weight:700; color:var(--stone-300); margin-bottom:10px; }
        .tip-box ul { list-style:none; padding:0; }
        .tip-box li { font-size:12.5px; color:var(--text-secondary); line-height:1.7; padding:2px 0; }
        .tip-box li::before { content:"• "; color:var(--accent-primary); }
        .tip-box-warn { border-color:rgba(224,82,82,.2); }
        .tip-box-warn h4 { color:var(--status-urgent); }
        .tip-box-warn li::before { color:var(--status-urgent); }

        /* Case Reminders */
        .case-reminders { margin-bottom:16px; }
        .case-reminders h3 { font-size:16px; font-weight:700; color:var(--stone-50); margin-bottom:12px; }
        .reminder-card {
          background:var(--surface-deep); border:1px solid var(--border-subtle); border-radius:10px;
          padding:14px 16px; margin-bottom:8px;
        }
        .reminder-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .reminder-type { font-size:16px; }
        .reminder-header strong { flex:1; font-size:14px; color:var(--stone-300); }
        .reminder-dismiss {
          background:none; border:none; color:var(--text-secondary); font-size:14px;
          cursor:pointer; padding:2px 6px;
        }
        .reminder-card p { font-size:13px; color:var(--text-secondary); margin:0; }

        /* Next Step Card */
        .next-step-card {
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-inline-start: 3px solid var(--copper-500);
          border-radius: 8px;
          padding: 20px 24px;
          margin-bottom: 24px;
        }
        .next-step-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--copper-500);
          margin-bottom: 8px;
        }
        .next-step-text {
          font-size: 15px;
          color: var(--text-primary);
          line-height: 1.7;
          margin-bottom: 12px;
        }
        .next-step-btn {
          background: var(--copper-500);
          color: var(--text-inverse);
          font-weight: 700;
          font-size: 14px;
          padding: 8px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-family: 'Heebo', sans-serif;
          transition: background 0.15s ease;
        }
        .next-step-btn:hover { background: var(--copper-600); }

        /* Medical Embed in Case */
        .case-medical-embed {
          margin: 24px 0;
          border: 1px solid var(--border-default);
          border-radius: 8px;
          overflow: hidden;
          max-height: 400px;
          overflow-y: auto;
        }
        .case-section-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--copper-500);
          padding: 16px 20px 8px;
        }

        /* Case Edit Button */
        .case-edit-btn {
          display:block; width:100%; padding:12px; border-radius:10px;
          border:1px solid var(--border-default); background:var(--surface-input); color:var(--text-secondary);
          font-family:'Heebo',sans-serif; font-size:14px; cursor:pointer;
          transition:all .2s ease; margin-bottom:16px;
        }
        .case-edit-btn:hover { border-color:var(--stone-700); color:var(--stone-300); }

        /* Case Modal */
        .case-modal-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:300;
          display:flex; align-items:center; justify-content:center; padding:16px;
        }
        .case-modal {
          background:var(--surface-deep); border:1px solid var(--border-subtle); border-radius:8px;
          padding:28px; max-width:500px; width:100%; max-height:85vh; overflow-y:auto;
        }
        .case-modal h3 { font-size:18px; font-weight:700; color:var(--stone-50); margin-bottom:20px; }

        /* Wizard */
        .case-wizard {
          background:var(--surface-deep); border:1px solid var(--border-subtle); border-radius:8px;
          padding:28px; margin-top:20px;
        }
        .wizard-step h3 { font-size:17px; font-weight:700; color:var(--stone-50); margin-bottom:18px; }
        .wizard-options { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:20px; }
        .wizard-opt {
          display:flex; flex-direction:column; align-items:center; gap:8px;
          padding:16px 10px; border-radius:8px; border:1px solid var(--border-default);
          background:var(--surface-input); color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:13px; cursor:pointer; transition:all .2s ease;
        }
        .wizard-opt:hover { border-color:var(--stone-700); }
        .wizard-opt.selected { border-color:var(--status-urgent); background:rgba(224,82,82,.08); color:var(--stone-300); }
        .wizard-opt-icon { font-size:24px; }
        .wizard-stages { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; max-height:360px; overflow-y:auto; }
        .wizard-stage {
          display:flex; align-items:center; gap:12px; padding:12px 16px;
          border-radius:10px; border:1px solid var(--border-default); background:var(--surface-input);
          color:var(--text-secondary); font-family:'Heebo',sans-serif; cursor:pointer;
          text-align:right; transition:all .2s ease;
        }
        .wizard-stage:hover { border-color:var(--stone-700); }
        .wizard-stage.selected { border-color:var(--status-urgent); background:rgba(224,82,82,.08); }
        .wizard-stage-icon { font-size:20px; flex-shrink:0; }
        .wizard-stage-label { font-size:14px; font-weight:600; color:var(--stone-300); }
        .wizard-stage-desc { font-size:11.5px; color:var(--text-secondary); margin-top:2px; }
        .wizard-field {
          display:block; margin-bottom:14px;
        }
        .wizard-field span {
          display:block; font-size:13px; color:var(--text-secondary); margin-bottom:4px; font-weight:500;
        }
        .wizard-field input, .wizard-field select, .wizard-field textarea {
          width:100%; padding:10px 14px; border-radius:8px; border:1px solid var(--border-default);
          background:var(--surface-input); color:var(--stone-300); font-family:'Heebo',sans-serif;
          font-size:14px; direction:rtl;
        }
        .wizard-field input:focus, .wizard-field select:focus, .wizard-field textarea:focus {
          outline:none; border-color:var(--status-urgent);
        }
        .wizard-nav { display:flex; gap:10px; justify-content:space-between; margin-top:20px; }
        .wizard-back {
          padding:10px 20px; border-radius:8px; border:1px solid var(--border-default);
          background:transparent; color:var(--text-secondary); font-family:'Heebo',sans-serif;
          font-size:14px; cursor:pointer;
        }
        .wizard-next {
          padding:10px 24px; border-radius:8px; border:none;
          background:linear-gradient(135deg,var(--copper-600),var(--status-urgent)); color:#fff;
          font-family:'Heebo',sans-serif; font-size:14px; font-weight:600;
          cursor:pointer; transition:all .2s ease;
        }
        .wizard-next:disabled { opacity:.4; cursor:default; }
        .wizard-submit { background:linear-gradient(135deg,var(--status-success),#34d399); }

        /* Edit injury grid */
        .edit-injury-grid {
          display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-top:4px;
        }
        .edit-injury-opt {
          display:flex; align-items:center; gap:8px; padding:8px 12px;
          border-radius:8px; border:1px solid var(--border-default); background:var(--surface-input);
          color:var(--text-secondary); font-size:13px; cursor:pointer; transition:all .2s ease;
        }
        .edit-injury-opt.selected { border-color:var(--status-urgent); background:rgba(224,82,82,.08); color:var(--stone-300); }
        .edit-injury-opt input[type="checkbox"] { accent-color:var(--status-urgent); }

        /* Stage Toast */
        .stage-toast {
          position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
          z-index:400; animation:slideUp .3s ease;
        }
        .stage-toast-content {
          background:var(--surface-card); border:1px solid rgba(244,162,78,.3);
          border-radius:8px; padding:14px 20px; display:flex;
          align-items:center; gap:14px; box-shadow:0 8px 32px rgba(0,0,0,.4);
          font-size:14px; color:var(--stone-300);
        }
        .stage-toast-btns { display:flex; gap:8px; }
        .stage-toast-yes {
          padding:6px 16px; border-radius:8px; border:none;
          background:var(--status-success); color:var(--stone-950); font-family:'Heebo',sans-serif;
          font-size:13px; font-weight:600; cursor:pointer;
        }
        .stage-toast-no {
          padding:6px 16px; border-radius:8px; border:1px solid var(--stone-700);
          background:transparent; color:var(--text-secondary); font-family:'Heebo',sans-serif;
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
            padding:12px 16px; background:var(--stone-900); border-bottom:1px solid var(--border-default);
            position:sticky; top:0; z-index:90;
          }
          .mobile-header .logo-icon-row { gap:8px; }
          .mobile-header .logo-main { font-size:22px; }

          /* Hamburger button */
          .hamburger-btn {
            display:flex; flex-direction:column; justify-content:center; gap:5px;
            width:36px; height:36px; padding:8px 6px; border:1px solid var(--border-default);
            border-radius:8px; background:transparent; cursor:pointer;
          }
          .hamburger-btn span {
            display:block; height:2px; background:var(--text-secondary); border-radius:2px;
            transition:all .2s ease;
          }
          .hamburger-btn:hover span { background:var(--stone-300); }

          /* Overlay */
          .mobile-overlay {
            display:block; position:fixed; inset:0; background:rgba(0,0,0,.55);
            z-index:200; animation:fadeIn .2s ease;
          }

          /* Side menu */
          .mobile-menu {
            display:flex; flex-direction:column; position:fixed; top:0; right:0;
            width:280px; max-width:85vw; height:100vh; background:var(--stone-900);
            border-left:1px solid var(--border-default); z-index:210; padding:24px 16px;
            transform:translateX(100%); transition:transform .3s ease;
            overflow-y:auto;
          }
          .mobile-menu.open { transform:translateX(0); }

          .mobile-menu-close {
            align-self:flex-start; background:transparent; border:none;
            color:var(--text-secondary); font-size:22px; cursor:pointer; padding:4px 8px;
            margin-bottom:16px; border-radius:6px; transition:all .2s ease;
          }
          .mobile-menu-close:hover { color:var(--text-primary); background:rgba(255,255,255,.05); }

          .mobile-nav { display:flex; flex-direction:column; gap:4px; margin-bottom:16px; }
          .mobile-nav .nav-btn { font-size:14px; padding:12px 14px; width:auto; height:auto; justify-content:flex-start; gap:10px; }
          .mobile-nav .nav-lbl { display:inline; }
          .mobile-nav .nav-btn::after { display:none; }
          .mobile-nav .nav-badge-dot { display:none; }
          .mobile-nav .nav-badge { display:inline; }

          .mobile-menu-profile { border-top:1px solid var(--border-default); padding-top:14px; margin-bottom:14px; }
          .mobile-menu-footer {
            border-top:1px solid var(--border-default); padding-top:14px; margin-top:auto;
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
      <WhatsAppButton />
      {showPricingGlobal && <PricingModal onClose={() => setShowPricingGlobal(false)} onSuccess={() => setShowPricingGlobal(false)} />}
      {showPortalAgent && <div className="portal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPortalAgent(false); }}>
        <div className="portal-container">
          <PortalAgent onClose={() => setShowPortalAgent(false)} onSaveReference={(ref) => console.log("Reference saved:", ref)} />
        </div>
      </div>}
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

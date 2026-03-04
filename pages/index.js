import { useState, useEffect, useRef, useCallback } from "react";
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

function SidebarProfile({ rights }) {
  const { user, profile, userRights, loading, signInWithGoogle, signOut, toggleProfilePanel } = useUser();

  const totalRights = rights.length;
  const completedRights = Object.values(userRights).filter(s => s === "completed").length;
  const notStarted = totalRights - Object.keys(userRights).length;
  const progressPct = totalRights > 0 ? Math.round((completedRights / totalRights) * 100) : 0;

  // Show login button by default (including SSR). Hide only when confirmed logged in.
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
      {notStarted > 0 && <div className="nudge">{notStarted} זכויות שטרם בדקת</div>}
      <button className="signout-link" onClick={signOut}>התנתק</button>
    </div>
  );
}

// ─── ProfileSettingsPanel ─────────────────────────────────

function ProfileSettingsPanel() {
  const { profile, showProfilePanel, toggleProfilePanel, updateProfile, signOut } = useUser();
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
  const { user, profile, loading } = useUser();
  if (loading || !user) return null;

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

function ProfileView({ rights }) {
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
              <div key={r.id} className="profile-right-item prog">
                <span className="badge cat-badge">{r.category}</span>
                <span>{r.title}</span>
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
              <div key={r.id} className="profile-right-item done">
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
              <div key={r.id} className="profile-right-item">
                <span className="badge cat-badge">{r.category}</span>
                <span>{r.title}</span>
              </div>
            ))}
            {notStarted.length > 5 && <p className="profile-more">ועוד {notStarted.length - 5} זכויות נוספות — בדוק בעמוד הזכויות</p>}
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
        page: typeof window !== "undefined" ? window.location.pathname : null,
      });
      setSent(true);
      setText("");
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

// ─── Chat ──────────────────────────────────────────────────

const HATS = [
  { id:"lawyer",  icon:"⚖",  label:"דן",  name:"דן", desc:"ייעוץ בזכויות ומשפט" },
  { id:"social",  icon:"🤝",  label:"מיכל", name:"מיכל", desc:"ניווט בירוקרטיה ושירותים" },
  { id:"psycho",  icon:"💙",  label:"אורי", name:"אורי", desc:"שיחה אישית ותמיכה" },
  { id:"events",  icon:"🎯",  label:"שירה", name:"שירה", desc:"אירועים ופעילויות" },
];

function Chat({ rights, events }) {
  const { user, profile } = useUser();
  const [hat, setHat]         = useState("lawyer");
  const [msgs, setMsgs]       = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner]   = useState(true);
  const [userCity, setUserCity] = useState(null);
  const [attachment, setAttachment] = useState(null); // { base64, media_type, file_name, preview }
  const [typingText, setTypingText] = useState(null); // for typing animation
  const [placeholder, setPlaceholder] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const bottom = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  const isPsycho = hat === "psycho";

  // Privacy banner fade out after 15s
  useEffect(() => {
    if (banner) {
      const t = setTimeout(() => setBanner(false), 15000);
      return () => clearTimeout(t);
    }
  }, [banner]);

  // Initialize greeting when hat changes
  useEffect(() => {
    const greetings = {
      lawyer:  "היי, אני דן 👋\n\nאני לא עו\"ד, אבל כנראה שאוכל לעזור לך בכל עניין מול משרד הביטחון.\n\nאיפה הדברים עומדים אצלך?",
      social:  "היי, אני מיכל 👋\n\nאני מכירה את כל הבלגן הבירוקרטי מבפנים, ואלווה אותך.\n\nמה הכי לוחץ עליך עכשיו?",
      psycho:  "היי, אני אורי 👋\n\nהכל כאן סודי — אף אחד לא רואה את השיחה.\n\nמה עובר עליך?",
      events:  "היי, אני שירה 👋\n\nיש אירועים, סדנאות, טיולים — הרבה בחינם.\n\nבאיזה אזור אתה? מה מעניין אותך?",
    };
    setMsgs([{ role: "assistant", content: greetings[hat] }]);
    setUserCity(null);
    setAttachment(null);
    setPlaceholder(getDefaultPlaceholder(hat));
  }, [hat]);

  function getDefaultPlaceholder(h) {
    switch(h) {
      case "lawyer": return "ספר לי על המצב שלך...";
      case "social": return "מה אתה צריך עזרה בו?";
      case "psycho": return "אפשר לכתוב, להקליט, או פשוט להגיד היי...";
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

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typingText]);

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
    }, isPsycho ? 60 : 30); // Slower for psycho

    return () => clearInterval(interval);
  }, [isPsycho]);

  async function send() {
    if ((!input.trim() && !attachment) || loading) return;
    const text = input.trim();
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
          disability_percent: profile.disability_percent,
          interests: profile.interests,
        };
      }

      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      const reply = d.reply || "שגיאה.";

      // Update placeholder from reply
      const newPh = extractPlaceholder(reply);
      if (newPh) setPlaceholder(newPh);

      // Typing animation
      setLoading(false);
      animateTyping(reply, (finalText) => {
        setMsgs(m => [...m, { role: "assistant", content: finalText }]);
      });
    } catch {
      setMsgs(m => [...m, { role: "assistant", content: "שגיאה בחיבור. נסה שוב." }]);
      setLoading(false);
    }
  }

  const curHat = HATS.find(h => h.id === hat);

  return (
    <div className={`chat-outer ${isPsycho ? "psycho-mode" : ""}`}>
      {/* Privacy banner — fades out */}
      {banner && (
        <div className="privacy-banner">
          <span className="prv-icon">🔒</span>
          <span>שיחה זו היא <strong>פרטית לחלוטין</strong> — המידע שתשתף לא נשמר בשרת, לא מועבר ולא מזוהה.</span>
          <button className="prv-close" onClick={() => setBanner(false)}>✕</button>
        </div>
      )}

      {/* Hat selector — in psycho mode, moves to corner */}
      <div className={`hat-row ${isPsycho && msgs.length > 1 ? "hat-row-mini" : ""}`}>
        {!(isPsycho && msgs.length > 1) && <span className="hat-label">דבר עם:</span>}
        {HATS.map(h => (
          <button key={h.id} className={`hat-btn ${hat===h.id?"active":""} ${h.id==="events"?"hat-events":""}`} onClick={() => setHat(h.id)} title={h.desc}>
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
            <div className="chat-name">{curHat.name} — מגן</div>
            <div className="chat-sub">{curHat.desc}</div>
          </div>
          <div className="chat-online">● מחובר</div>
        </div>

        <div className="chat-msgs">
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
                {m.content}
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

// ─── Main ──────────────────────────────────────────────────

export default function Home({ rights, updates, events }) {
  const [view,      setView]      = useState("chat");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
    { id:"chat",    icon:"◇", label:"יועץ AI" },
    { id:"rights",  icon:"◫", label:"זכויות" },
    { id:"events",  icon:"◉", label:"אירועים", badge: upcomingCount||null },
    { id:"updates", icon:"◎", label:"עדכונים", badge: updates.length||null },
  ];

  // SVG favicon (heart + shield)
  const faviconSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e8734a"/><stop offset="100%" stop-color="#f4a24e"/></linearGradient></defs><path d="M32 58 C20 48 6 38 6 24 C6 14 14 6 24 6 C28 6 30 8 32 10 C34 8 36 6 40 6 C50 6 58 14 58 24 C58 38 44 48 32 58Z" fill="url(#g)"/><path d="M32 22 L38 31 L26 31 Z" fill="rgba(255,255,255,0.35)"/><path d="M32 38 L26 29 L38 29 Z" fill="rgba(255,255,255,0.35)"/></svg>`)}`;

  return (
    <>
      <Head>
        <title>מגן — זכויות פצועי צה״ל</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <meta name="description" content="מרכז זכויות, אירועים ויועץ AI לפצועי צה״ל"/>
        <link rel="icon" href={faviconSvg} type="image/svg+xml"/>
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
      </Head>

      <div className="root" dir="rtl">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-icon-row">
              <svg className="logo-svg" viewBox="0 0 36 36" width="32" height="32">
                <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#e8734a"/><stop offset="100%" stopColor="#f4a24e"/></linearGradient></defs>
                <path d="M18 32 C12 27 4 21 4 14 C4 9 8 4 14 4 C16 4 17 5 18 6.5 C19 5 20 4 22 4 C28 4 32 9 32 14 C32 21 24 27 18 32Z" fill="url(#lg)"/>
                <path d="M18 13 L21 18.5 L15 18.5 Z" fill="rgba(255,255,255,0.3)"/>
                <path d="M18 23 L15 17.5 L21 17.5 Z" fill="rgba(255,255,255,0.3)"/>
              </svg>
              <div className="logo-main">מגן<span className="logo-en">MAGEN</span></div>
            </div>
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

          <SidebarProfile rights={rights} />

          <div className="sb-footer">
            <a href="tel:*6500" className="hotline">📞 מוקד פצועים <strong>*6500</strong></a>
            <a href="tel:*8944" className="hotline red">🆘 נפש אחת <strong>*8944</strong></a>
            <a href="https://mod.gov.il/" target="_blank" rel="noopener noreferrer" className="hotline">🌐 אגף השיקום</a>
            <button className="hotline feedback-btn" onClick={() => setFeedbackOpen(true)}>💬 רעיונות לשימור/שיפור?</button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main">

          {/* User avatar top bar */}
          <UserTopBar onProfile={() => setView("profile")} />

          {/* PROFILE */}
          {view==="profile" && <ProfileView rights={rights} />}

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
              <p>דן · מיכל · אורי · שירה — פרטי, אקטיבי, בשבילך</p>
            </div>
            <Chat rights={rights} events={events}/>
          </>}

        </main>
      </div>

      <ProfileSettingsPanel />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <style jsx global>{`
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
        body { background:#0c1018; color:#eef1f6; font-family:'Heebo',sans-serif; letter-spacing:.2px; }
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
        .logo-icon-row { display:flex; align-items:center; gap:10px; }
        .logo-svg { flex-shrink:0; }
        .logo-main { font-size:30px; font-weight:900; color:#e8734a; letter-spacing:-1px; line-height:1; }
        .logo-en { font-size:10px; font-weight:700; color:rgba(232,115,74,.35); letter-spacing:4px; margin-right:8px; vertical-align:middle; }
        .logo-sub { font-size:10.5px; color:#6b7a8d; margin-top:6px; letter-spacing:.5px; }
        nav { display:flex; flex-direction:column; gap:4px; flex:1; }
        .nav-btn {
          display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:10px;
          border:none; background:transparent; color:#8a95a7; font-family:'Heebo',sans-serif;
          font-size:14px; cursor:pointer; text-align:right; transition:all .2s ease;
        }
        .nav-btn:hover { background:rgba(244,162,78,.08); color:#d0d8e4; transform:translateX(-2px); }
        .nav-btn.active { background:rgba(244,162,78,.12); color:#f4a24e; font-weight:700; }
        .nav-icon { font-size:15px; opacity:.7; }
        .nav-btn.active .nav-icon { opacity:1; }
        .nav-lbl { flex:1; }
        .nav-badge { background:linear-gradient(135deg,#e8734a,#f4a24e); color:#fff; font-size:10px; font-weight:700; padding:2px 7px; border-radius:20px; }

        /* ── Sidebar Profile ── */
        .sb-profile-zone { padding:14px 0; border-top:1px solid #1e2835; border-bottom:1px solid #1e2835; margin-bottom:10px; }
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

        /* User top avatar */
        .user-top-btn {
          position:fixed; top:16px; left:16px; z-index:60;
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
        .user-top-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }

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
        .profile-right-item.prog { border-right:3px solid #f4a24e; }
        .profile-right-item.done { border-right:3px solid #34d399; }
        .profile-check { margin-right:auto; color:#34d399; font-weight:700; }
        .profile-more { font-size:13px; color:#8a95a7; margin-top:8px; }

        .sb-footer { border-top:1px solid #1e2835; padding-top:14px; display:flex; flex-direction:column; gap:6px; }
        .hotline {
          font-size:12px; padding:10px 12px; border-radius:8px; background:#161e28;
          color:#8a95a7; text-decoration:none; display:block; transition:all .2s ease;
        }
        .hotline:hover { color:#eef1f6; background:#1a2430; transform:translateX(-2px); }
        .hotline.red { color:#e8734a; }

        /* ── Main ── */
        .main { flex:1; padding:40px 48px; max-width:920px; overflow-y:auto; }
        .pg-hdr { margin-bottom:28px; }
        .pg-hdr h1 { font-size:28px; font-weight:900; letter-spacing:-.5px; color:#f5f3ef; }
        .pg-hdr p { font-size:13.5px; color:#8a95a7; margin-top:6px; line-height:1.6; }

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

        /* ── Chat outer ── */
        .chat-outer { display:flex; flex-direction:column; gap:16px; }

        /* Privacy banner — with fade out */
        .privacy-banner {
          display:flex; align-items:center; gap:14px;
          background:rgba(78,203,138,.08); border:1px solid rgba(78,203,138,.2);
          border-radius:12px; padding:14px 18px; font-size:13.5px; color:#8dd4a8; line-height:1.6;
          animation:bannerFade 15s ease-in-out forwards;
        }
        @keyframes bannerFade { 0%,80%{opacity:1} 100%{opacity:0; pointer-events:none;} }
        .prv-icon { font-size:18px; flex-shrink:0; }
        .prv-close { margin-right:auto; background:transparent; border:none; color:#8a95a7; cursor:pointer; font-size:16px; padding:2px 6px; transition:.2s; }
        .prv-close:hover { color:#eef1f6; }

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
        .chat-msgs { flex:1; overflow-y:auto; padding:18px 20px; display:flex; flex-direction:column; gap:14px; }
        .msg { display:flex; gap:10px; align-items:flex-end; animation:msgIn .3s ease; }
        .msg.user { flex-direction:row-reverse; }
        @keyframes msgIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg-ava { width:30px; height:30px; background:#1a2430; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
        .bubble { max-width:76%; padding:12px 16px; border-radius:18px; font-size:14px; line-height:1.8; white-space:pre-wrap; }
        .msg.user .bubble { background:rgba(244,162,78,.12); color:#eef1f6; border-bottom-right-radius:4px; }
        .msg.assistant .bubble { background:#1a2230; border:1px solid #1e2835; color:#c2ccd8; border-bottom-left-radius:4px; }

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

        /* ── Mobile ── */
        @media (max-width:760px) {
          .root { flex-direction:column; }
          .sidebar {
            width:100%; height:auto; position:static; flex-direction:row;
            flex-wrap:wrap; padding:12px 14px; gap:6px; border-left:none;
            border-bottom:1px solid #1e2835;
          }
          .logo { margin-bottom:0; }
          .logo-icon-row { gap:6px; }
          .logo-svg { width:24px; height:24px; }
          nav { flex-direction:row; flex:none; }
          .nav-btn { padding:8px 10px; font-size:12.5px; }
          .nav-btn:hover { transform:none; }
          .sb-profile-zone { border:none; padding:6px 0; margin-bottom:0; }
          .sb-footer { flex-direction:row; border-top:none; padding-top:0; }
          .main { padding:20px 16px; }
          .pg-hdr h1 { font-size:24px; }
          .ev-grid { grid-template-columns:1fr; }
          .chat-wrap { height:60vh; }
          .psycho-mode .chat-wrap-full { height:calc(100vh - 160px); }
          .camera-btn { display:flex; }
          .card:hover,.ev-card:hover,.update-card:hover { transform:none; }
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
    props: { rights:read("rights.json"), updates:read("updates.json"), events:read("events.json") },
    revalidate: 1800,
  };
}

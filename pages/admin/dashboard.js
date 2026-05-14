import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useUser } from "../../lib/UserContext";

// ─── Auth ────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min inactivity → auto-logout

function LoginGate({ onGoogleLogin, loading }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
        borderRadius: 12, padding: "2.5rem", width: 400, textAlign: "center",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🛡️</div>
        <h2 style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "0.5rem", fontSize: "1.3rem" }}>דשבורד אנליטיקס</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>משרד הביטחון — גישה מאובטחת בלבד</p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginBottom: "1.5rem" }}>התחברות דרך חשבון Google מורשה</p>
        <button onClick={onGoogleLogin} disabled={loading} style={{
          width: "100%", padding: "0.85rem", background: "var(--accent-primary)", color: "var(--text-inverse)",
          border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.95rem",
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "מתחבר..." : "כניסה עם Google"}
        </button>
        <div style={{ marginTop: "1.5rem", padding: "0.75rem", background: "rgba(220,38,38,0.08)", borderRadius: 8, border: "1px solid rgba(220,38,38,0.2)" }}>
          <p style={{ color: "var(--status-urgent)", fontSize: "0.7rem", margin: 0, lineHeight: 1.6 }}>
            גישה מותרת אך ורק למשתמשים עם הרשאת ministry/admin.
            <br />כל ניסיון גישה מתועד ומבוקר.
          </p>
        </div>
      </div>
    </div>
  );
}

function AccessDenied({ email, onLogout }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
        borderRadius: 12, padding: "2.5rem", width: 420, textAlign: "center",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🚫</div>
        <h2 style={{ color: "var(--status-urgent)", fontWeight: 700, marginBottom: "0.75rem", fontSize: "1.2rem" }}>גישה נדחתה</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          החשבון <strong style={{ color: "var(--text-primary)" }}>{email}</strong> אינו מורשה.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "1.5rem" }}>
          ניסיון הגישה תועד. פנה למנהל המערכת לקבלת הרשאה.
        </p>
        <button onClick={onLogout} style={{
          padding: "0.7rem 2rem", background: "transparent", border: "1px solid var(--border-default)",
          borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem",
        }}>התנתק</button>
      </div>
    </div>
  );
}

function SessionExpired({ onRelogin }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
        borderRadius: 12, padding: "2.5rem", width: 380, textAlign: "center",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⏱️</div>
        <h2 style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "0.75rem", fontSize: "1.15rem" }}>הסשן פג תוקף</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginBottom: "1.5rem" }}>
          עברו 30 דקות ללא פעילות. יש להתחבר מחדש.
        </p>
        <button onClick={onRelogin} style={{
          width: "100%", padding: "0.8rem", background: "var(--accent-primary)", color: "var(--text-inverse)",
          border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.95rem",
        }}>התחבר מחדש</button>
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
      borderRadius: 12, padding: "1.25rem 1.5rem",
      borderRight: accent ? `4px solid ${accent}` : undefined,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        {icon && <span style={{ fontSize: "1rem" }}>{icon}</span>}
        <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em" }}>{label}</div>
      </div>
      <div style={{ color: "var(--text-primary)", fontSize: "1.8rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
      {sub && <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: "0.4rem" }}>{sub}</div>}
    </div>
  );
}

// ─── Section Wrapper ────────────────────────────────────

function Section({ title, children, badge }) {
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)" }}>{title}</div>
        {badge && <span style={{
          fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 99,
          background: badge.bg || "var(--accent-primary)", color: badge.color || "var(--text-inverse)",
        }}>{badge.text}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Bar Chart ──────────────────────────────────────────

function BarChart({ data, labelKey, valueKey, color = "var(--accent-primary)", height = 120 }) {
  if (!data || !data.length) return <Empty />;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, padding: "0 0.25rem" }}>
      {data.map((d, i) => {
        const v = d[valueKey] || 0;
        const h = Math.max(2, (v / max) * (height - 30));
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: "0.55rem", color: "var(--text-secondary)", fontFamily: "'IBM Plex Mono', monospace" }}>{v || ""}</div>
            <div style={{ width: "100%", height: h, background: color, borderRadius: "3px 3px 0 0", opacity: 0.85, transition: "height 0.3s" }} />
            <div style={{ fontSize: "0.5rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{d[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Topic Row ──────────────────────────────────────────

function TopicRow({ topic, count, trend, maxCount }) {
  const barWidth = maxCount ? Math.max(8, (count / maxCount) * 100) : 50;
  const trendColor = trend > 0 ? "var(--status-urgent)" : trend < 0 ? "var(--status-success)" : "var(--text-muted)";
  const trendLabel = trend > 0 ? `+${trend}%` : trend < 0 ? `${trend}%` : "—";
  const TOPIC_LABELS = {
    "זכויות_ותגמולים": "זכויות ותגמולים",
    "ועדות_רפואיות": "ועדות רפואיות",
    "רכב_ותו_נכה": "רכב ותו נכה",
    "תרופות_וטיפולים": "תרופות וטיפולים",
    "דיור": "דיור",
    "תעסוקה": "תעסוקה",
    "נשק": "נשק",
    "עורכי_דין": "עורכי דין",
    "בירוקרטיה": "בירוקרטיה",
    "רגשי": "רגשי",
    "אחר": "אחר",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ width: 120, color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600, flexShrink: 0 }}>
        {TOPIC_LABELS[topic] || topic}
      </div>
      <div style={{ flex: 1, height: 8, background: "var(--border-subtle)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${barWidth}%`, height: "100%", background: "var(--accent-primary)", borderRadius: 4, transition: "width 0.5s" }} />
      </div>
      <div style={{ width: 50, textAlign: "left", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>{count}</div>
      <div style={{ width: 50, textAlign: "left", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.75rem", fontWeight: 500, color: trendColor }}>{trendLabel}</div>
    </div>
  );
}

// ─── Incident Card ──────────────────────────────────────

const SEVERITY_COLORS = {
  5: "#dc2626", 4: "#ea580c", 3: "#d97706", 2: "#ca8a04", 1: "#65a30d",
};
const SEVERITY_LABELS = {
  5: "קריטי", 4: "גבוה", 3: "בינוני", 2: "נמוך", 1: "מינורי",
};
const STATUS_LABELS = {
  new: "חדש", reviewed: "נבדק", escalated: "הועבר", resolved: "טופל",
};
const INCIDENT_TYPE_LABELS = {
  committee_abuse: "התנהגות לא תקינה בוועדה",
  systemic_failure: "כשל מערכתי",
  emotional_crisis: "מצוקה רגשית חמורה",
};

function IncidentCard({ incident, onStatusChange }) {
  const sColor = SEVERITY_COLORS[incident.severity] || "#888";
  return (
    <div style={{
      background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 8,
      padding: "1rem 1.25rem", borderRight: `4px solid ${sColor}`, marginBottom: "0.75rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <div>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.1rem 0.4rem", borderRadius: 4, background: sColor, color: "#fff", marginLeft: "0.5rem" }}>
            {SEVERITY_LABELS[incident.severity]}
          </span>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
            {INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type}
          </span>
        </div>
        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
          {new Date(incident.created_at).toLocaleDateString("he-IL")}
        </span>
      </div>

      {incident.committee_type && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
          סוג ועדה: <strong>{incident.committee_type}</strong>
        </div>
      )}

      <div style={{ fontSize: "0.82rem", color: "var(--text-primary)", lineHeight: 1.6, marginBottom: "0.5rem" }}>
        {incident.anonymized_summary}
      </div>

      {incident.anonymized_quote && (
        <div style={{
          fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic",
          borderRight: "3px solid var(--border-default)", paddingRight: "0.75rem", marginBottom: "0.75rem",
        }}>
          ״{incident.anonymized_quote}״
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{
          fontSize: "0.65rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: 4,
          background: incident.status === "new" ? "var(--status-urgent)" : incident.status === "resolved" ? "var(--status-success)" : "var(--status-warning)",
          color: "#fff",
        }}>
          {STATUS_LABELS[incident.status]}
        </span>
        {incident.status === "new" && (
          <button onClick={() => onStatusChange(incident.id, "reviewed")} style={{
            fontSize: "0.7rem", padding: "0.2rem 0.6rem", background: "transparent",
            border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-secondary)",
            cursor: "pointer",
          }}>סמן כנבדק</button>
        )}
        {incident.status === "reviewed" && (
          <>
            <button onClick={() => onStatusChange(incident.id, "escalated")} style={{
              fontSize: "0.7rem", padding: "0.2rem 0.6rem", background: "transparent",
              border: "1px solid var(--status-urgent)", borderRadius: 4, color: "var(--status-urgent)",
              cursor: "pointer",
            }}>העבר לטיפול</button>
            <button onClick={() => onStatusChange(incident.id, "resolved")} style={{
              fontSize: "0.7rem", padding: "0.2rem 0.6rem", background: "transparent",
              border: "1px solid var(--status-success)", borderRadius: 4, color: "var(--status-success)",
              cursor: "pointer",
            }}>טופל</button>
          </>
        )}
        {incident.status === "escalated" && (
          <button onClick={() => onStatusChange(incident.id, "resolved")} style={{
            fontSize: "0.7rem", padding: "0.2rem 0.6rem", background: "transparent",
            border: "1px solid var(--status-success)", borderRadius: 4, color: "var(--status-success)",
            cursor: "pointer",
          }}>טופל</button>
        )}
      </div>
    </div>
  );
}

// ─── Sentiment Sparkline ────────────────────────────────

function SentimentChart({ data }) {
  if (!data || !data.length) return <Empty />;
  const vals = data.map(d => d.avg_sentiment ?? 0);
  const min = Math.min(...vals, -1);
  const max = Math.max(...vals, 1);
  const range = max - min || 1;
  const h = 100;
  const w = data.length;

  const points = vals.map((v, i) => {
    const x = (i / (w - 1)) * 100;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");

  const zeroY = h - ((0 - min) / range) * h;

  return (
    <div style={{ position: "relative", height: h + 30 }}>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h }}>
        <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="2,2" />
        <polyline fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" points={points} />
        {vals.map((v, i) => {
          const x = (i / (w - 1)) * 100;
          const y = h - ((v - min) / range) * h;
          return <circle key={i} cx={x} cy={y} r="1.5" fill={v < -0.3 ? "var(--status-urgent)" : v > 0.3 ? "var(--status-success)" : "var(--accent-primary)"} />;
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{data[0]?.date?.slice(5)}</span>
        <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

// ─── Channel Donut ──────────────────────────────────────

function ChannelDonut({ web, whatsapp }) {
  const total = web + whatsapp;
  if (total === 0) return <Empty />;
  const webPct = Math.round((web / total) * 100);
  const waPct = 100 - webPct;
  const webAngle = (web / total) * 360;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2rem", justifyContent: "center", padding: "1rem 0" }}>
      <div style={{ position: "relative", width: 120, height: 120 }}>
        <svg viewBox="0 0 36 36" style={{ width: 120, height: 120, transform: "rotate(-90deg)" }}>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border-subtle)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--status-info)" strokeWidth="3"
            strokeDasharray={`${webPct} ${100 - webPct}`} strokeDashoffset="0" strokeLinecap="round" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--status-success)" strokeWidth="3"
            strokeDasharray={`${waPct} ${100 - waPct}`} strokeDashoffset={`${-webPct}`} strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 900, color: "var(--text-primary)", fontFamily: "'IBM Plex Mono', monospace" }}>{total}</div>
          <div style={{ fontSize: "0.55rem", color: "var(--text-muted)" }}>סה״כ</div>
        </div>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: "var(--status-info)" }} />
          <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>אתר — {web.toLocaleString()} ({webPct}%)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: "var(--status-success)" }} />
          <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>WhatsApp — {whatsapp.toLocaleString()} ({waPct}%)</span>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────

function Empty() {
  return <div style={{ color: "var(--text-muted)", padding: "1.5rem", textAlign: "center", fontSize: "0.8rem" }}>אין נתונים עדיין</div>;
}

// ─── Tab Button ─────────────────────────────────────────

function TabButton({ active, label, count, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "0.4rem 0.9rem", borderRadius: 6, fontSize: "0.78rem", fontWeight: active ? 700 : 500,
      background: active ? "var(--accent-primary)" : "transparent",
      color: active ? "var(--text-inverse)" : "var(--text-secondary)",
      border: active ? "none" : "1px solid var(--border-default)",
      cursor: "pointer", transition: "all 0.2s",
    }}>
      {label}{count != null && ` (${count})`}
    </button>
  );
}

// ─── Main Dashboard ─────────────────────────────────────

export default function AnalyticsDashboard() {
  const { user, profile, loading: authLoading, signInWithGoogle, signOut } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [incidentFilter, setIncidentFilter] = useState("all");
  const [authState, setAuthState] = useState("checking"); // checking | login | denied | timeout | ok
  const lastActivityRef = useRef(Date.now());

  // Track activity for session timeout
  useEffect(() => {
    const resetTimer = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("click", resetTimer);

    const interval = setInterval(() => {
      if (authState === "ok" && Date.now() - lastActivityRef.current > SESSION_TIMEOUT_MS) {
        setAuthState("timeout");
        setData(null);
      }
    }, 30_000);

    return () => {
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
      clearInterval(interval);
    };
  }, [authState]);

  // Check role once user/profile load
  useEffect(() => {
    if (authLoading) { setAuthState("checking"); return; }
    if (!user) { setAuthState("login"); return; }
    if (!profile) { setAuthState("checking"); return; }
    const role = profile.role;
    if (role === "admin" || role === "ministry") {
      setAuthState("ok");
    } else {
      setAuthState("denied");
    }
  }, [user, profile, authLoading]);

  const fetchData = useCallback(() => {
    if (authState !== "ok") return;
    setLoading(true);
    setError(null);
    fetch("/api/admin/conversation-analytics?view=summary", {
      headers: { "x-last-activity": String(lastActivityRef.current) },
      credentials: "same-origin",
    })
      .then(r => {
        if (r.status === 401) { setAuthState("login"); throw new Error("session_expired"); }
        if (r.status === 403) { setAuthState("denied"); throw new Error("access_denied"); }
        if (!r.ok) throw new Error("שגיאה בטעינת נתונים");
        return r.json();
      })
      .then(d => { if (d.error === "session_timeout") { setAuthState("timeout"); } else { setData(d); } })
      .catch(e => { if (!["session_expired", "access_denied"].includes(e.message)) setError(e.message); })
      .finally(() => setLoading(false));
  }, [authState]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleIncidentStatusChange = useCallback(async (id, status) => {
    try {
      const r = await fetch("/api/admin/incidents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-last-activity": String(lastActivityRef.current) },
        credentials: "same-origin",
        body: JSON.stringify({ id, status }),
      });
      if (!r.ok) throw new Error();
      setData(prev => ({
        ...prev,
        incidents: prev.incidents.map(inc => inc.id === id ? { ...inc, status, reviewed_at: new Date().toISOString() } : inc),
        overview: {
          ...prev.overview,
          active_incidents: status === "new"
            ? prev.overview.active_incidents
            : Math.max(0, prev.overview.active_incidents - 1),
        },
      }));
    } catch {
      alert("שגיאה בעדכון הסטטוס");
    }
  }, []);

  if (authState === "checking") return (
    <div style={{ minHeight: "100vh", background: "#1c1917", display: "flex", alignItems: "center", justifyContent: "center", color: "#a8a29e", fontFamily: "'Heebo', sans-serif" }}>
      מאמת הרשאות...
    </div>
  );
  if (authState === "login") return <LoginGate onGoogleLogin={signInWithGoogle} loading={authLoading} />;
  if (authState === "denied") return <AccessDenied email={user?.email} onLogout={signOut} />;
  if (authState === "timeout") return <SessionExpired onRelogin={() => { lastActivityRef.current = Date.now(); setAuthState("ok"); }} />;

  const overview = data?.overview || {};
  const filteredIncidents = (data?.incidents || []).filter(
    inc => incidentFilter === "all" || inc.status === incidentFilter
  );
  const newIncidentsCount = (data?.incidents || []).filter(i => i.status === "new").length;

  return (
    <>
      <Head>
        <title>מגן — דשבורד אנליטיקס</title>
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <div dir="rtl" style={{
        minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)",
        fontFamily: "'Heebo', sans-serif", padding: "2rem clamp(1rem, 4vw, 3rem)",
      }}>
        <style jsx global>{`
          :root {
            --stone-950: #0c0a09; --stone-900: #1c1917; --stone-800: #292524;
            --stone-700: #44403c; --stone-600: #57534e; --stone-400: #a8a29e;
            --stone-300: #d6d3d1; --stone-200: #e7e5e4; --stone-50: #fafaf9;
            --copper-600: #c2410c; --copper-500: #d97706; --copper-400: #e09f3e;
            --copper-100: #fef3c7; --olive-700: #4a5c3e; --olive-400: #8fa677;
            --status-urgent: #dc2626; --status-warning: #d97706;
            --status-info: #2563eb; --status-success: #16a34a;
            --bg-primary: var(--stone-900); --bg-elevated: var(--stone-800);
            --text-primary: var(--stone-200); --text-secondary: var(--stone-400);
            --text-muted: var(--stone-600); --text-inverse: var(--stone-900);
            --border-default: var(--stone-700); --border-subtle: rgba(68,64,60,0.5);
            --accent-primary: var(--copper-500); --accent-hover: var(--copper-600);
          }
          body { margin: 0; background: var(--bg-primary); }
        `}</style>

        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
            <div>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.15em", color: "var(--accent-primary)", marginBottom: "0.5rem" }}>אנליטיקס — משרד הביטחון</div>
              <h1 style={{ fontWeight: 900, fontSize: "clamp(1.5rem, 3vw, 2.2rem)", letterSpacing: "-0.02em", lineHeight: 1.2, margin: 0 }}>מגן — דשבורד תובנות</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginTop: "0.4rem" }}>נתונים אנונימיים ומצרפיים בלבד. ללא מעקב אישי.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", fontWeight: 600 }}>{profile?.name || user?.email}</div>
                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>{profile?.role === "ministry" ? "משרד הביטחון" : "אדמין"}</div>
              </div>
              <button onClick={fetchData} disabled={loading} style={{
                padding: "0.5rem 0.8rem", background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.75rem",
              }}>
                {loading ? "..." : "רענן"}
              </button>
              <button onClick={signOut} style={{
                padding: "0.5rem 0.8rem", background: "transparent", border: "1px solid var(--border-default)",
                borderRadius: 8, color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem",
              }}>
                התנתק
              </button>
            </div>
          </div>

          {loading && !data && <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>טוען נתונים...</div>}
          {error && <div style={{ textAlign: "center", padding: "2rem", color: "var(--status-urgent)" }}>{error}</div>}

          {data && (
            <>
              {/* ═══ 1. Overview Cards ═══ */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
                <StatCard icon="💬" label="שיחות היום" value={overview.today_conversations || 0} accent="var(--accent-primary)" />
                <StatCard icon="✅" label="אחוז פתרון (שבוע)" value={`${overview.resolution_rate || 0}%`}
                  sub={`${overview.week_total || 0} שיחות`} accent="var(--status-success)" />
                <StatCard icon="⚡" label="זמן תגובה ממוצע" value={overview.avg_response_time_ms ? `${(overview.avg_response_time_ms / 1000).toFixed(1)}s` : "—"}
                  accent="var(--status-info)" />
                <StatCard icon="🚨" label="אירועים חריגים פתוחים" value={overview.active_incidents || 0}
                  accent={overview.active_incidents > 0 ? "var(--status-urgent)" : "var(--status-success)"} />
                <StatCard icon="📊" label="סנטימנט ממוצע" value={overview.avg_sentiment != null ? overview.avg_sentiment.toFixed(2) : "—"}
                  accent={overview.avg_sentiment < -0.3 ? "var(--status-urgent)" : overview.avg_sentiment > 0.3 ? "var(--status-success)" : "var(--accent-primary)"} />
              </div>

              {/* ═══ Main Grid ═══ */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

                {/* ═══ 2. Topic Distribution ═══ */}
                <Section title="פילוח נושאים" badge={data.topics?.length ? { text: `${data.topics.length} נושאים`, bg: "var(--olive-400)" } : null}>
                  {data.topics?.length ? (
                    <>
                      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", fontSize: "0.65rem", color: "var(--text-muted)" }}>
                        <span style={{ width: 120 }}>נושא</span>
                        <span style={{ flex: 1 }}></span>
                        <span style={{ width: 50, textAlign: "left" }}>כמות</span>
                        <span style={{ width: 50, textAlign: "left" }}>מגמה</span>
                      </div>
                      {data.topics.map((t, i) => (
                        <TopicRow key={i} topic={t.topic} count={t.count} trend={t.trend} maxCount={data.topics[0]?.count || 1} />
                      ))}
                    </>
                  ) : <Empty />}
                </Section>

                {/* ═══ 3. Hourly Distribution ═══ */}
                <Section title="התפלגות שעתית (שבוע אחרון)">
                  <BarChart data={data.hourly || []} labelKey="hour" valueKey="count" color="var(--olive-400)" />
                </Section>

                {/* ═══ 6. Sentiment Trend ═══ */}
                <Section title="מגמת סנטימנט (30 יום)">
                  <SentimentChart data={data.sentiment || []} />
                </Section>

                {/* ═══ 7. Channel Split ═══ */}
                <Section title="פילוח ערוצים">
                  <ChannelDonut web={data.channels?.web || 0} whatsapp={data.channels?.whatsapp || 0} />
                </Section>
              </div>

              {/* ═══ 5. Critical Incidents Feed (Full Width) ═══ */}
              <Section title="אירועים חריגים" badge={newIncidentsCount > 0 ? { text: `${newIncidentsCount} חדשים`, bg: "var(--status-urgent)" } : null}>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                  <TabButton active={incidentFilter === "all"} label="הכל" count={data.incidents?.length} onClick={() => setIncidentFilter("all")} />
                  <TabButton active={incidentFilter === "new"} label="חדשים" count={newIncidentsCount} onClick={() => setIncidentFilter("new")} />
                  <TabButton active={incidentFilter === "reviewed"} label="נבדקו"
                    count={(data.incidents || []).filter(i => i.status === "reviewed").length}
                    onClick={() => setIncidentFilter("reviewed")} />
                  <TabButton active={incidentFilter === "escalated"} label="הועברו"
                    count={(data.incidents || []).filter(i => i.status === "escalated").length}
                    onClick={() => setIncidentFilter("escalated")} />
                  <TabButton active={incidentFilter === "resolved"} label="טופלו"
                    count={(data.incidents || []).filter(i => i.status === "resolved").length}
                    onClick={() => setIncidentFilter("resolved")} />
                </div>
                {filteredIncidents.length > 0 ? (
                  filteredIncidents.map(inc => (
                    <IncidentCard key={inc.id} incident={inc} onStatusChange={handleIncidentStatusChange} />
                  ))
                ) : (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                    {incidentFilter === "all" ? "לא זוהו אירועים חריגים" : `אין אירועים בסטטוס "${STATUS_LABELS[incidentFilter]}"`}
                  </div>
                )}
              </Section>

              {/* ═══ 4. Recurring Questions ═══ */}
              <Section title="שאלות חוזרות — טופ 20">
                {(data.recurring || []).length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--border-default)" }}>
                          {["דפוס שאלה", "קטגוריה", "חזרות", "נראה לראשונה", "נראה לאחרונה"].map(h => (
                            <th key={h} style={{ padding: "0.5rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.04em" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.recurring.map((q, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-primary)", maxWidth: 400 }}>{q.question_pattern}</td>
                            <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>{q.category || "—"}</td>
                            <td style={{ padding: "0.6rem 0.5rem", fontFamily: "'IBM Plex Mono', monospace", color: "var(--accent-primary)", fontWeight: 600 }}>{q.occurrence_count}</td>
                            <td style={{ padding: "0.6rem 0.5rem", fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                              {q.first_seen ? new Date(q.first_seen).toLocaleDateString("he-IL") : "—"}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                              {q.last_seen ? new Date(q.last_seen).toLocaleDateString("he-IL") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <Empty />}
              </Section>

              {/* Footer */}
              <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-muted)", fontSize: "0.7rem" }}>
                מגן — מערכת תובנות | כל הנתונים אנונימיים ומצרפיים | {new Date().toLocaleDateString("he-IL")}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

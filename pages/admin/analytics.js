import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

// ─── Auth ────────────────────────────────────────────────

function AdminLogin({ onLogin }) {
  const [key, setKey] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={e => { e.preventDefault(); onLogin(key); }} style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
        borderRadius: 8, padding: "2rem", width: 340, textAlign: "center",
      }}>
        <h2 style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "1rem", fontSize: "1.25rem" }}>כניסת אדמין</h2>
        <input type="password" value={key} onChange={e => setKey(e.target.value)}
          placeholder="מפתח אדמין" style={{
            width: "100%", padding: "0.7rem", background: "var(--bg-primary)", border: "1px solid var(--border-default)",
            borderRadius: 6, color: "var(--text-primary)", fontSize: "1rem", marginBottom: "1rem", textAlign: "center",
          }}
        />
        <button type="submit" style={{
          width: "100%", padding: "0.75rem", background: "var(--accent-primary)", color: "var(--text-inverse)",
          border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: "0.9rem",
        }}>כניסה</button>
      </form>
    </div>
  );
}

// ─── Cards ───────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
      borderRadius: 8, padding: "1.25rem 1.5rem",
      borderTop: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontSize: "1.75rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
      {sub && <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.35rem" }}>{sub}</div>}
    </div>
  );
}

// ─── Bar Chart (CSS only) ────────────────────────────────

function BarChart({ data, labelKey, valueKey, maxBars = 14, color = "var(--accent-primary)" }) {
  if (!data || !data.length) return <div style={{ color: "var(--text-secondary)", padding: "2rem", textAlign: "center" }}>אין נתונים</div>;
  const items = data.slice(0, maxBars).reverse();
  const max = Math.max(...items.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140, padding: "0 0.5rem" }}>
      {items.map((d, i) => {
        const h = Math.max(4, ((d[valueKey] || 0) / max) * 120);
        const label = typeof d[labelKey] === "string" ? d[labelKey].slice(5) : d[labelKey]; // trim year
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: "0.6rem", color: "var(--text-secondary)", fontFamily: "'IBM Plex Mono', monospace" }}>{d[valueKey]}</div>
            <div style={{ width: "100%", height: h, background: color, borderRadius: "3px 3px 0 0", opacity: 0.85 }} />
            <div style={{ fontSize: "0.55rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Breakdown Table ─────────────────────────────────────

function BreakdownTable({ data, nameKey, countKey, extraCols = [] }) {
  if (!data || !data.length) return <div style={{ color: "var(--text-secondary)", padding: "1rem", textAlign: "center" }}>אין נתונים</div>;
  const total = data.reduce((s, d) => s + (d[countKey] || 0), 0);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {data.map((d, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <td style={{ padding: "0.6rem 0", color: "var(--text-primary)", fontWeight: 600, fontSize: "0.9rem" }}>{d[nameKey] || "—"}</td>
            <td style={{ padding: "0.6rem 0", textAlign: "left", fontFamily: "'IBM Plex Mono', monospace", color: "var(--accent-primary)", fontWeight: 500 }}>{d[countKey]}</td>
            <td style={{ padding: "0.6rem 0", textAlign: "left", color: "var(--text-muted)", fontSize: "0.8rem" }}>{total ? `${Math.round((d[countKey] / total) * 100)}%` : ""}</td>
            {extraCols.map((col, ci) => (
              <td key={ci} style={{ padding: "0.6rem 0", textAlign: "left", color: "var(--text-secondary)", fontSize: "0.8rem", fontFamily: "'IBM Plex Mono', monospace" }}>{d[col.key] ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main Dashboard ──────────────────────────────────────

export default function AnalyticsDashboard() {
  const [adminKey, setAdminKey] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Persist admin key in sessionStorage
  useEffect(() => {
    const saved = typeof window !== "undefined" && sessionStorage.getItem("magen_admin_key");
    if (saved) setAdminKey(saved);
  }, []);

  const handleLogin = useCallback((key) => {
    setAdminKey(key);
    if (typeof window !== "undefined") sessionStorage.setItem("magen_admin_key", key);
  }, []);

  // Fetch data
  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    fetch("/api/admin/analytics?view=summary", { headers: { "x-admin-key": adminKey } })
      .then(r => { if (!r.ok) throw new Error(r.status === 403 ? "מפתח שגוי" : "שגיאה"); return r.json(); })
      .then(setData)
      .catch(e => { setError(e.message); setAdminKey(null); sessionStorage.removeItem("magen_admin_key"); })
      .finally(() => setLoading(false));
  }, [adminKey]);

  if (!adminKey) return <AdminLogin onLogin={handleLogin} />;

  // Compute top-line stats from daily data
  const today = data?.daily?.[0];
  const last30 = data?.daily || [];
  const totalMessages30 = last30.reduce((s, d) => s + (d.messages || 0), 0);
  const totalSessions30 = last30.reduce((s, d) => s + (d.sessions || 0), 0);
  const totalCost30 = last30.reduce((s, d) => s + parseFloat(d.estimated_cost || 0), 0);
  const avgRating = last30.filter(d => d.avg_rating).reduce((s, d, _, a) => s + parseFloat(d.avg_rating) / a.length, 0);

  return (
    <>
      <Head>
        <title>מגן — אנליטיקס</title>
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

        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.15em", color: "var(--accent-primary)", marginBottom: "0.5rem" }}>אנליטיקס</div>
            <h1 style={{ fontWeight: 900, fontSize: "clamp(1.5rem, 3vw, 2rem)", letterSpacing: "-0.02em", lineHeight: 1.2, margin: 0 }}>מגן — דשבורד</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.4rem" }}>נתונים אנונימיים מצרפיים בלבד. אין מעקב אחר משתמשים.</p>
          </div>

          {loading && <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>טוען...</div>}
          {error && <div style={{ textAlign: "center", padding: "2rem", color: "var(--status-urgent)" }}>{error}</div>}

          {data && (
            <>
              {/* Top stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
                <StatCard label="הודעות היום" value={today?.messages || 0} sub={`${today?.sessions || 0} שיחות`} accent="var(--accent-primary)" />
                <StatCard label="הודעות 30 יום" value={totalMessages30.toLocaleString()} sub={`${totalSessions30} שיחות`} accent="var(--olive-400)" />
                <StatCard label="עלות חודשית" value={`$${totalCost30.toFixed(2)}`} sub="משוערת" accent="var(--status-warning)" />
                <StatCard label="דירוג ממוצע" value={avgRating ? avgRating.toFixed(1) : "—"} sub="1-5" accent="var(--status-success)" />
              </div>

              {/* Charts grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
                {/* Daily messages chart */}
                <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "1.25rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "1rem" }}>הודעות יומיות</div>
                  <BarChart data={last30} labelKey="date" valueKey="messages" color="var(--accent-primary)" />
                </div>

                {/* Daily cost chart */}
                <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "1.25rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "1rem" }}>עלות יומית ($)</div>
                  <BarChart data={last30} labelKey="date" valueKey="estimated_cost" color="var(--status-warning)" />
                </div>

                {/* Category breakdown */}
                <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "1.25rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "1rem" }}>פילוח לפי קטגוריה</div>
                  <BreakdownTable data={data.categories} nameKey="category" countKey="total"
                    extraCols={[{ key: "avg_rating", label: "דירוג" }, { key: "avg_ms", label: "ms" }]} />
                </div>

                {/* Persona breakdown */}
                <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "1.25rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "1rem" }}>פילוח לפי כובע</div>
                  <BreakdownTable data={data.personas} nameKey="persona" countKey="total"
                    extraCols={[{ key: "total_tokens", label: "טוקנים" }, { key: "avg_rating", label: "דירוג" }]} />
                </div>
              </div>

              {/* Hourly heatmap */}
              {data.hourly?.length > 0 && (
                <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "1.25rem", marginBottom: "2rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "1rem" }}>שעות שיא (שבוע אחרון)</div>
                  <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 80 }}>
                    {Array.from({ length: 24 }, (_, h) => {
                      const d = data.hourly.find(x => Number(x.hour_il) === h);
                      const v = d?.messages || 0;
                      const max = Math.max(...data.hourly.map(x => x.messages || 0), 1);
                      return (
                        <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ width: "100%", height: Math.max(2, (v / max) * 60), background: v > 0 ? "var(--olive-400)" : "var(--border-subtle)", borderRadius: 2 }} />
                          <div style={{ fontSize: "0.5rem", color: "var(--text-muted)" }}>{h}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Daily breakdown table */}
              <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "1.25rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "1rem" }}>פירוט יומי</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border-default)" }}>
                        {["תאריך", "שיחות", "הודעות", "Input", "Output", "עלות $", "ms", "דירוג"].map(h => (
                          <th key={h} style={{ padding: "0.5rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.04em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {last30.map((d, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "0.5rem", fontFamily: "'IBM Plex Mono', monospace" }}>{d.date}</td>
                          <td style={{ padding: "0.5rem", fontFamily: "'IBM Plex Mono', monospace" }}>{d.sessions}</td>
                          <td style={{ padding: "0.5rem", fontFamily: "'IBM Plex Mono', monospace" }}>{d.messages}</td>
                          <td style={{ padding: "0.5rem", fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-secondary)" }}>{(d.input_tokens || 0).toLocaleString()}</td>
                          <td style={{ padding: "0.5rem", fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-secondary)" }}>{(d.output_tokens || 0).toLocaleString()}</td>
                          <td style={{ padding: "0.5rem", fontFamily: "'IBM Plex Mono', monospace", color: "var(--status-warning)" }}>{d.estimated_cost || "—"}</td>
                          <td style={{ padding: "0.5rem", fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)" }}>{d.avg_response_ms || "—"}</td>
                          <td style={{ padding: "0.5rem", fontFamily: "'IBM Plex Mono', monospace" }}>{d.avg_rating || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

import { useState, useEffect } from "react";

// =============================================
// חישוב נכות משוקללת — שיטת משרד הביטחון
// =============================================
function calcWeightedDisability(injuries) {
  const sorted = [...injuries].sort((a, b) => b.disabilityPercent - a.disabilityPercent);
  const paired = sorted.filter(i => i.pairedOrgan);
  const regular = sorted.filter(i => !i.pairedOrgan);

  let remaining = 100;
  let total = 0;
  const steps = [];

  for (const inj of regular) {
    const contribution = (inj.disabilityPercent / 100) * remaining;
    const rounded = Math.round(contribution * 100) / 100;
    steps.push({ label: inj.label, percent: inj.disabilityPercent, contribution: rounded, remaining });
    total += rounded;
    remaining -= rounded;
  }

  let pairedTotal = 0;
  for (const inj of paired) {
    pairedTotal += inj.disabilityPercent;
    steps.push({ label: inj.label + " (זוגי)", percent: inj.disabilityPercent, contribution: inj.disabilityPercent, remaining: null });
  }

  const finalTotal = Math.round(total + pairedTotal);
  return { total: finalTotal, steps };
}

// =============================================
// קבועים
// =============================================

const SEV = { severe: "#EF4444", moderate: "#D97706", mild: "#10B981" };

const STAT = {
  chronic: { l: "כרוני", c: "#EF4444" },
  active_treatment: { l: "בטיפול", c: "#F59E0B" },
  post_surgical: { l: "פוסט-ניתוחי", c: "#3B82F6" },
  healed: { l: "החלים", c: "#10B981" },
  monitoring: { l: "במעקב", c: "#8B5CF6" },
};

const EVT = {
  injury: { c: "#EF4444", l: "פגיעה" },
  surgery: { c: "#8B5CF6", l: "ניתוח" },
  hospitalization: { c: "#EC4899", l: "אשפוז" },
  diagnosis: { c: "#F59E0B", l: "אבחנה" },
  treatment: { c: "#3B82F6", l: "טיפול" },
  committee: { c: "#10B981", l: "ועדה" },
  milestone: { c: "#06B6D4", l: "אבן דרך" },
};

const ZONE_POS = {
  head:          { x: 50, y: 6,  side: "right" },
  "chest-left":  { x: 54, y: 22, side: "right" },
  "chest-right": { x: 46, y: 22, side: "left" },
  abdomen:       { x: 50, y: 30, side: "left" },
  pelvis:        { x: 50, y: 37, side: "right" },
  "shoulder-left":  { x: 62, y: 16, side: "right" },
  "shoulder-right": { x: 38, y: 16, side: "left" },
  "arm-left":    { x: 68, y: 30, side: "right" },
  "arm-right":   { x: 32, y: 30, side: "left" },
  "knee-left":   { x: 55, y: 60, side: "right" },
  "knee-right":  { x: 45, y: 60, side: "left" },
  "ankle-left":  { x: 55, y: 80, side: "right" },
  "ankle-right": { x: 45, y: 80, side: "left" },
  back:          { x: 50, y: 25, side: "left" },
};

// =============================================
// מפת הגוף — SVG עם קווי מתאר
// =============================================

function HumanBody({ injuries, selectedId, onSelect }) {
  const s = "#64748B";
  const w = "1.2";
  return (
    <svg viewBox="0 0 200 500" style={{ width: "100%", height: "100%" }}>
      {/* Head */}
      <ellipse cx="100" cy="28" rx="17" ry="20" fill="none" stroke={s} strokeWidth={w} />
      {/* Neck */}
      <rect x="93" y="48" width="14" height="16" rx="6" fill="none" stroke={s} strokeWidth={w} />
      {/* Torso */}
      <rect x="74" y="66" width="52" height="92" rx="12" fill="none" stroke={s} strokeWidth={w} />
      {/* Hip area */}
      <rect x="76" y="162" width="48" height="36" rx="18" fill="none" stroke={s} strokeWidth={w} />
      {/* Left arm */}
      <rect x="56" y="68" width="20" height="12" rx="6" fill="none" stroke={s} strokeWidth={w} />
      <rect x="48" y="82" width="14" height="56" rx="7" fill="none" stroke={s} strokeWidth={w} />
      <rect x="46" y="142" width="12" height="52" rx="6" fill="none" stroke={s} strokeWidth={w} />
      <ellipse cx="52" cy="198" rx="6" ry="7" fill="none" stroke={s} strokeWidth={w} />
      {/* Right arm */}
      <rect x="124" y="68" width="20" height="12" rx="6" fill="none" stroke={s} strokeWidth={w} />
      <rect x="138" y="82" width="14" height="56" rx="7" fill="none" stroke={s} strokeWidth={w} />
      <rect x="142" y="142" width="12" height="52" rx="6" fill="none" stroke={s} strokeWidth={w} />
      <ellipse cx="148" cy="198" rx="6" ry="7" fill="none" stroke={s} strokeWidth={w} />
      {/* Left leg */}
      <rect x="80" y="200" width="18" height="108" rx="9" fill="none" stroke={s} strokeWidth={w} />
      <rect x="80" y="314" width="16" height="104" rx="8" fill="none" stroke={s} strokeWidth={w} />
      <ellipse cx="88" cy="422" rx="10" ry="5" fill="none" stroke={s} strokeWidth={w} />
      {/* Right leg */}
      <rect x="102" y="200" width="18" height="108" rx="9" fill="none" stroke={s} strokeWidth={w} />
      <rect x="104" y="314" width="16" height="104" rx="8" fill="none" stroke={s} strokeWidth={w} />
      <ellipse cx="112" cy="422" rx="10" ry="5" fill="none" stroke={s} strokeWidth={w} />

      {/* Injury markers */}
      {injuries.map((injury) => {
        const pos = ZONE_POS[injury.zone];
        if (!pos) return null;
        const px = pos.x * 2;
        const py = pos.y * 5;
        const color = SEV[injury.severity] || SEV.moderate;
        const sel = selectedId === injury.id;

        return (
          <g key={injury.id} onClick={() => onSelect(injury.id)} style={{ cursor: "pointer" }}>
            <circle cx={px} cy={py} r={sel ? 11 : 8} fill="none" stroke={color} strokeWidth="1" opacity="0.25">
              <animate attributeName="r" values={sel ? "11;17;11" : "8;13;8"} dur="2.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.25;0;0.25" dur="2.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={px} cy={py} r={sel ? 6 : 4.5} fill={color} stroke={sel ? "#FFF" : "none"} strokeWidth={sel ? 1.2 : 0} />
            <circle cx={px} cy={py} r={sel ? 2.2 : 1.6} fill="#FFF" opacity="0.9" />
            {(() => {
              const labelX = pos.side === "left" ? 2 : 198;
              return (
                <>
                  <line x1={px + (pos.side === "left" ? -6 : 6)} y1={py} x2={labelX} y2={py} stroke={sel ? color : "rgba(255,255,255,0.08)"} strokeWidth={sel ? 0.6 : 0.3} strokeDasharray="2 2" />
                  <text x={pos.side === "left" ? 4 : 196} y={py + 3} fill={sel ? color : "#64748B"} fontSize={sel ? 8.5 : 7} fontWeight={sel ? 700 : 400} fontFamily="'JetBrains Mono', monospace" textAnchor={pos.side === "left" ? "start" : "end"}>
                    {injury.label}
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}

// =============================================
// חישוב נכות — תצוגה
// =============================================

function DisabilityCalc({ injuries }) {
  const { total, steps } = calcWeightedDisability(injuries);
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", direction: "rtl", fontFamily: "Heebo, sans-serif" }}>
      <div style={{ fontSize: 11, color: "#718096", marginBottom: 8, fontWeight: 600 }}>
        חישוב נכות משוקללת (שיטת משרד הביטחון)
      </div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#A0AEC0", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", flexWrap: "wrap", gap: 4 }}>
          <span>{s.label} — {s.percent}%</span>
          <span>
            {s.remaining !== null ? (
              <span>{s.percent}% מתוך {s.remaining.toFixed(0)}% יתרה = <span style={{ color: "#F7FAFC", fontWeight: 600 }}>{s.contribution.toFixed(1)}%</span></span>
            ) : (
              <span style={{ color: "#F7FAFC", fontWeight: 600 }}>{s.contribution}% (איבר זוגי — ללא שקלול)</span>
            )}
          </span>
        </div>
      ))}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", alignItems: "center", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <span style={{ fontSize: 11, color: "#718096" }}>נכות משוקללת: </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#60A5FA" }}>{total}%</span>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: "#4A5568", lineHeight: 1.5 }}>
        * הערכה בלבד לפי שיטת השקלול הרשמית. אחוזי הנכות הסופיים נקבעים אך ורק ע"י הוועדה הרפואית של משרד הביטחון.
      </div>
    </div>
  );
}

// =============================================
// רכיב ראשי
// =============================================

const STAGE_LABELS = {
  initial_claim: "תביעה ראשונית",
  recognition: "הכרה",
  committee_scheduled: "ועדה נקבעה",
  committee_done: "ועדה בוצעה",
  appeal: "ערעור",
  increase_request: "בקשת החמרה",
  closed: "סגור",
};

const CAT_COLORS = {
  "כספי": "#F59E0B",
  "בריאות": "#EF4444",
  "משפטי": "#8B5CF6",
  "לימודים": "#3B82F6",
  "תעסוקה": "#10B981",
  "מיסים": "#06B6D4",
  "פנאי": "#EC4899",
  "דיור": "#F97316",
};

export default function MagenMedicalSummary({
  injuries = [],
  events = [],
  legalCase = null,
  profile = null,
  eligibleRights = [],
  loading = false,
  onRefresh,
}) {
  const [selInj, setSelInj] = useState(null);
  const [selEvt, setSelEvt] = useState(null);
  const [showRights, setShowRights] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#718096", direction: "rtl", fontFamily: "Heebo, sans-serif" }}>
        <div style={{ fontSize: 14 }}>טוען תקציר רפואי...</div>
      </div>
    );
  }

  if (injuries.length === 0 && !legalCase) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#718096", direction: "rtl", fontFamily: "Heebo, sans-serif" }}>
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.5 }}>🛡</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#dde3ec" }}>אין פגיעות מתועדות</div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>ספר ליועץ AI על הפגיעות שלך — הוא ישמור אותן<br/>בתקציר הרפואי אחרי שתאשר</div>
      </div>
    );
  }

  const disabilityResult = calcWeightedDisability(injuries);
  const officialPercent = legalCase?.disabilityPercent ?? profile?.disabilityPercent;

  return (
    <div style={{ color: "#F7FAFC", fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
      {/* Legal Case Summary */}
      {legalCase && (
        <div style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.15)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#d97706", fontWeight: 700, marginBottom: 8 }}>תיק משפטי</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 12, color: "#CBD5E0" }}>
            {legalCase.stage && (
              <span>שלב: <strong style={{ color: "#F7FAFC" }}>{STAGE_LABELS[legalCase.stage] || legalCase.stage}</strong></span>
            )}
            {officialPercent != null && (
              <span>נכות רשמית: <strong style={{ color: "#60A5FA" }}>{officialPercent}%</strong></span>
            )}
            {legalCase.injuryTypes?.length > 0 && (
              <span>סוגי פגיעה: <strong style={{ color: "#F7FAFC" }}>{legalCase.injuryTypes.join(", ")}</strong></span>
            )}
            {legalCase.representative && (
              <span>מייצג: <strong style={{ color: "#F7FAFC" }}>{legalCase.representative}</strong></span>
            )}
            {legalCase.committeeDate && (
              <span>ועדה: <strong style={{ color: "#F7FAFC" }}>{new Date(legalCase.committeeDate).toLocaleDateString("he-IL")}</strong></span>
            )}
          </div>
          {legalCase.notes && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#A0AEC0", lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
              {legalCase.notes}
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { v: injuries.length, l: "פגיעות", c: "#F7FAFC" },
          { v: injuries.filter(i => i.severity === "severe").length, l: "חמורות", c: "#EF4444" },
          ...(officialPercent != null
            ? [{ v: officialPercent + "%", l: "נכות רשמית", c: "#60A5FA" }]
            : [{ v: disabilityResult.total + "%", l: "נכות משוקללת", c: "#60A5FA" }]),
        ].map((s, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 18px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</span>
            <span style={{ fontSize: 12, color: "#A0AEC0" }}>{s.l}</span>
          </div>
        ))}
        {onRefresh && (
          <button onClick={onRefresh} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px", color: "#718096", fontSize: 12, cursor: "pointer" }}>
            רענן
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* LEFT: Body Map */}
        <div style={{ flex: "0 0 220px", minWidth: 200 }}>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 4px", minHeight: 440 }}>
            <HumanBody injuries={injuries} selectedId={selInj} onSelect={id => setSelInj(selInj === id ? null : id)} />
          </div>
        </div>

        {/* RIGHT: Cards + Calc + Timeline */}
        <div style={{ flex: 1, minWidth: 280 }}>
          {/* Injury Cards */}
          <div style={{ fontSize: 12, color: "#718096", fontWeight: 600, marginBottom: 8 }}>פגיעות ({injuries.length})</div>
          {injuries.map((inj, i) => {
            const sel = selInj === inj.id;
            const st = STAT[inj.status] || { l: inj.status, c: "#718096" };
            return (
              <div key={inj.id} onClick={() => setSelInj(sel ? null : inj.id)} style={{
                background: sel ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                border: sel ? `1px solid ${SEV[inj.severity]}60` : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10, padding: "10px 12px", cursor: "pointer", marginBottom: 6, transition: "all 0.2s",
                opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateX(20px)",
                transitionDelay: `${0.2 + i * 0.06}s`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: SEV[inj.severity], boxShadow: `0 0 6px ${SEV[inj.severity]}66`, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{inj.hebrewLabel}</span>
                    <span style={{ fontSize: 10, color: "#718096" }}>{inj.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 8, background: `${st.c}20`, color: st.c, fontWeight: 600 }}>{st.l}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#60A5FA" }}>{inj.disabilityPercent}%</span>
                  </div>
                </div>
                {sel && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "#CBD5E0", lineHeight: 1.6 }}>
                    {inj.details}
                    {inj.date && <div style={{ color: "#718096", fontSize: 11, marginTop: 4 }}>תאריך: {inj.date}</div>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Disability Calculation */}
          <div style={{ marginTop: 12 }}>
            <DisabilityCalc injuries={injuries} />
          </div>

          {/* Timeline */}
          {events.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, color: "#718096", fontWeight: 600, marginBottom: 10 }}>ציר זמן ({events.length} אירועים)</div>
              {events.map((evt, i) => {
                const sel = selEvt === evt.id;
                const ec = EVT[evt.type] || EVT.treatment;
                const isLast = i === events.length - 1;
                const dateStr = new Date(evt.date).toLocaleDateString("he-IL", { year: "2-digit", month: "short" });
                return (
                  <div key={evt.id} onClick={() => setSelEvt(sel ? null : evt.id)} style={{ display: "flex", gap: 12, cursor: "pointer", opacity: mounted ? 1 : 0, transition: `opacity 0.4s ${0.4 + i * 0.05}s` }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 30, flexShrink: 0 }}>
                      <div style={{
                        width: sel ? 28 : 22, height: sel ? 28 : 22, borderRadius: "50%",
                        background: sel ? ec.c : `${ec.c}30`, border: `2px solid ${ec.c}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: sel ? 13 : 10,
                        transition: "all 0.2s", boxShadow: sel ? `0 0 12px ${ec.c}50` : "none", zIndex: 1,
                      }}>{evt.icon || "•"}</div>
                      {!isLast && <div style={{ width: 1.5, flex: 1, minHeight: 12, background: `${ec.c}30` }} />}
                    </div>
                    <div style={{
                      flex: 1, background: sel ? "rgba(255,255,255,0.06)" : "transparent",
                      borderRadius: 8, padding: sel ? "8px 10px" : "4px 6px", marginBottom: 4, transition: "all 0.2s",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#F7FAFC" }}>{evt.title}</span>
                          {sel && evt.titleEn && <span style={{ fontSize: 10, color: "#718096", marginRight: 6 }}>{evt.titleEn}</span>}
                        </div>
                        <span style={{ fontSize: 9, color: "#718096" }}>{dateStr}</span>
                      </div>
                      {sel && evt.description && (
                        <div style={{ fontSize: 11, color: "#A0AEC0", marginTop: 4 }}>{evt.description}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Eligible Rights */}
      {eligibleRights.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button onClick={() => setShowRights(!showRights)} style={{
            width: "100%", padding: "14px 18px", borderRadius: 10,
            background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)",
            color: "#d97706", cursor: "pointer", fontFamily: "Heebo, sans-serif",
            fontSize: 14, fontWeight: 700, textAlign: "right", direction: "rtl",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>מה מגיע לי? — {eligibleRights.length} זכויות מתאימות</span>
            <span style={{ fontSize: 18, transition: "transform 0.2s", transform: showRights ? "rotate(180deg)" : "none" }}>&#9660;</span>
          </button>

          {showRights && (
            <div style={{ marginTop: 8 }}>
              {Object.entries(
                eligibleRights.reduce((acc, r) => {
                  (acc[r.category] = acc[r.category] || []).push(r);
                  return acc;
                }, {})
              ).map(([cat, rights]) => (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: CAT_COLORS[cat] || "#718096", marginBottom: 6, paddingRight: 4 }}>
                    {cat} ({rights.length})
                  </div>
                  {rights.map(r => (
                    <div key={r.id} style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8, padding: "8px 12px", marginBottom: 4,
                      borderInlineStart: `3px solid ${CAT_COLORS[r.category] || "#718096"}`,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#F7FAFC", marginBottom: 2 }}>{r.title}</div>
                      <div style={{ fontSize: 11, color: "#A0AEC0", lineHeight: 1.5 }}>{r.summary}</div>
                      {r.matchReason && (
                        <div style={{ fontSize: 10, color: "#d97706", marginTop: 4 }}>{r.matchReason}</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 24, fontSize: 10, color: "#4A5568" }}>
        תקציר רפואי • לא מהווה תחליף לתיק רפואי מלא • חישוב הנכות לפי שיטת השקלול של משרד הביטחון
      </div>
    </div>
  );
}

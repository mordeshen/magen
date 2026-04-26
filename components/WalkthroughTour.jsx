import { useState, useEffect, useCallback } from "react";

const STEPS = [
  {
    target: ".chat-input-area",
    title: "יועץ AI אישי",
    body: "כאן אפשר לשאול כל שאלה על זכויות, ועדות, מסמכים — מגן מכיר את התיק שלך ועונה בהתאם.",
    position: "top",
  },
  {
    target: '[data-tour="hats"]',
    title: "5 כובעים — 5 פרסונות",
    body: "דן (עו\"ד), מיכל (סוציאלית), פסיכולוג, רועי (ותיק), ומגן. כל אחד מתמחה בתחום אחר.",
    position: "bottom",
  },
  {
    target: '[data-tour="rights"]',
    title: "זכויות שמגיעות לך",
    body: "כל הזכויות במקום אחד — מסוננות לפי אחוזי נכות וסוג פגיעה. אפשר לעקוב אחרי מה כבר מימשת.",
    position: "bottom",
  },
  {
    target: '[data-tour="medical"]',
    title: "תקציר רפואי",
    body: "תיק רפואי דיגיטלי — פגיעות, ועדות, חישוב נכות משוקלל, וזכויות שמתאימות לך.",
    position: "bottom",
  },
  {
    target: '[data-tour="case"]',
    title: "התיק המשפטי",
    body: "מעקב שלב-אחר-שלב בתהליך ההכרה — מאיסוף מסמכים ועד מימוש זכויות.",
    position: "bottom",
  },
  {
    target: ".sb-agent-btn",
    title: "סוכן אוטומציה",
    body: "מגן יכול להיכנס לאתר אגף השיקום ולמלא טפסים בשבילך — או להנחות אותך צעד-אחר-צעד.",
    position: "left",
  },
];

export default function WalkthroughTour({ onComplete }) {
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState(null);
  const [visible, setVisible] = useState(true);

  const updatePosition = useCallback(() => {
    const s = STEPS[step];
    if (!s) return;
    const el = document.querySelector(s.target);
    if (!el) {
      if (step < STEPS.length - 1) setStep(step + 1);
      else finish();
      return;
    }
    const rect = el.getBoundingClientRect();
    setPos({ rect, step: s });
  }, [step]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [updatePosition]);

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  }

  function finish() {
    setVisible(false);
    try { localStorage.setItem("magen-tour-done", "1"); } catch {}
    if (onComplete) onComplete();
  }

  if (!visible || !pos) return null;

  const { rect, step: s } = pos;
  const tooltipStyle = {};
  const arrowStyle = {};

  if (s.position === "top") {
    tooltipStyle.bottom = `${window.innerHeight - rect.top + 14}px`;
    tooltipStyle.left = `${Math.max(16, Math.min(rect.left + rect.width / 2 - 160, window.innerWidth - 336))}px`;
    arrowStyle.bottom = "-6px";
    arrowStyle.left = `${Math.min(Math.max(rect.left + rect.width / 2 - parseInt(tooltipStyle.left) - 6, 16), 296)}px`;
    arrowStyle.transform = "rotate(45deg)";
  } else if (s.position === "bottom") {
    tooltipStyle.top = `${rect.bottom + 14}px`;
    tooltipStyle.left = `${Math.max(16, Math.min(rect.left + rect.width / 2 - 160, window.innerWidth - 336))}px`;
    arrowStyle.top = "-6px";
    arrowStyle.left = `${Math.min(Math.max(rect.left + rect.width / 2 - parseInt(tooltipStyle.left) - 6, 16), 296)}px`;
    arrowStyle.transform = "rotate(45deg)";
  } else {
    tooltipStyle.top = `${rect.top + rect.height / 2 - 60}px`;
    tooltipStyle.right = `${window.innerWidth - rect.left + 14}px`;
    arrowStyle.top = "50%";
    arrowStyle.right = "-6px";
    arrowStyle.transform = "translateY(-50%) rotate(45deg)";
  }

  return (
    <div className="wt-overlay" dir="rtl">
      {/* Highlight box */}
      <div className="wt-highlight" style={{
        top: rect.top - 6, left: rect.left - 6,
        width: rect.width + 12, height: rect.height + 12,
      }} />

      {/* Tooltip */}
      <div className="wt-tooltip" style={tooltipStyle}>
        <div className="wt-arrow" style={arrowStyle} />
        <div className="wt-title">{s.title}</div>
        <div className="wt-body">{s.body}</div>
        <div className="wt-footer">
          <span className="wt-counter">{step + 1} / {STEPS.length}</span>
          <div className="wt-btns">
            <button className="wt-skip" onClick={finish}>דלג</button>
            <button className="wt-next" onClick={next}>
              {step === STEPS.length - 1 ? "סיום" : "הבא"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .wt-overlay {
          position: fixed; inset: 0; z-index: 10001;
          background: rgba(12,10,9,0.7);
          font-family: 'Heebo', sans-serif;
        }
        .wt-highlight {
          position: fixed; border-radius: 10px;
          box-shadow: 0 0 0 9999px rgba(12,10,9,0.7);
          border: 2px solid var(--copper-500, #d97706);
          z-index: 10002; pointer-events: none;
          transition: all 0.3s ease;
        }
        .wt-tooltip {
          position: fixed; z-index: 10003;
          width: 320px; padding: 18px 20px;
          background: var(--stone-900, #1c1917);
          border: 1px solid var(--stone-700, #44403c);
          border-radius: 12px;
          color: var(--text-primary, #e7e5e4);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .wt-arrow {
          position: absolute; width: 12px; height: 12px;
          background: var(--stone-900, #1c1917);
          border-right: 1px solid var(--stone-700);
          border-bottom: 1px solid var(--stone-700);
        }
        .wt-title {
          font-size: 16px; font-weight: 800; margin-bottom: 6px;
          color: var(--copper-400, #e09f3e);
        }
        .wt-body {
          font-size: 13px; line-height: 1.7; color: var(--stone-300, #d6d3d1);
        }
        .wt-footer {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 14px; padding-top: 10px;
          border-top: 1px solid var(--stone-700);
        }
        .wt-counter { font-size: 11px; color: var(--stone-500); }
        .wt-btns { display: flex; gap: 8px; }
        .wt-skip {
          background: none; border: none; color: var(--stone-500);
          font-size: 12px; cursor: pointer; font-family: 'Heebo';
          padding: 6px 10px;
        }
        .wt-skip:hover { color: var(--stone-300); }
        .wt-next {
          background: var(--copper-500, #d97706); color: var(--stone-950);
          border: none; border-radius: 8px; padding: 6px 18px;
          font-size: 13px; font-weight: 700; cursor: pointer;
          font-family: 'Heebo'; transition: background 0.15s;
        }
        .wt-next:hover { background: var(--copper-600, #b45309); }
        @media (prefers-reduced-motion: reduce) {
          .wt-highlight { transition: none; }
        }
      `}</style>
    </div>
  );
}

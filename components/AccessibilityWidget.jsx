import { useState, useEffect } from "react";

const LS_KEY = "magen-a11y";

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch { return {}; }
}

function savePrefs(prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch {}
}

function applyPrefs(prefs) {
  const root = document.documentElement;
  // Font size
  const scale = prefs.fontSize || 100;
  root.style.setProperty("--a11y-font-scale", `${scale}%`);
  root.style.fontSize = `${scale}%`;

  // High contrast
  root.classList.toggle("a11y-high-contrast", !!prefs.highContrast);

  // Reduce motion
  root.classList.toggle("a11y-reduce-motion", !!prefs.reduceMotion);

  // Large cursor
  root.classList.toggle("a11y-large-cursor", !!prefs.largeCursor);

  // Link highlight
  root.classList.toggle("a11y-highlight-links", !!prefs.highlightLinks);
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState({ fontSize: 100, highContrast: false, reduceMotion: false, largeCursor: false, highlightLinks: false });

  useEffect(() => {
    const saved = loadPrefs();
    setPrefs(p => ({ ...p, ...saved }));
    applyPrefs({ ...prefs, ...saved });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
    applyPrefs(next);
  }

  function reset() {
    const defaults = { fontSize: 100, highContrast: false, reduceMotion: false, largeCursor: false, highlightLinks: false };
    setPrefs(defaults);
    savePrefs(defaults);
    applyPrefs(defaults);
  }

  return (
    <>
      <button
        className="a11y-toggle"
        onClick={() => setOpen(!open)}
        aria-label="הגדרות נגישות"
        title="נגישות"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4.5" r="2.5"/>
          <path d="M12 7v6m0 0l-3 5m3-5l3 5"/>
          <path d="M5 10h14"/>
        </svg>
      </button>

      {open && (
        <div className="a11y-panel" dir="rtl" role="dialog" aria-label="הגדרות נגישות">
          <div className="a11y-header">
            <h3>נגישות</h3>
            <button className="a11y-close" onClick={() => setOpen(false)} aria-label="סגור">✕</button>
          </div>

          <div className="a11y-option">
            <span>גודל טקסט</span>
            <div className="a11y-font-controls">
              <button onClick={() => update("fontSize", Math.max(80, prefs.fontSize - 10))} aria-label="הקטן טקסט">א-</button>
              <span className="a11y-font-value">{prefs.fontSize}%</span>
              <button onClick={() => update("fontSize", Math.min(150, prefs.fontSize + 10))} aria-label="הגדל טקסט">א+</button>
            </div>
          </div>

          <label className="a11y-option a11y-toggle-row">
            <span>ניגודיות גבוהה</span>
            <input type="checkbox" checked={prefs.highContrast} onChange={e => update("highContrast", e.target.checked)} />
          </label>

          <label className="a11y-option a11y-toggle-row">
            <span>הפחתת אנימציות</span>
            <input type="checkbox" checked={prefs.reduceMotion} onChange={e => update("reduceMotion", e.target.checked)} />
          </label>

          <label className="a11y-option a11y-toggle-row">
            <span>סמן מוגדל</span>
            <input type="checkbox" checked={prefs.largeCursor} onChange={e => update("largeCursor", e.target.checked)} />
          </label>

          <label className="a11y-option a11y-toggle-row">
            <span>הדגשת קישורים</span>
            <input type="checkbox" checked={prefs.highlightLinks} onChange={e => update("highlightLinks", e.target.checked)} />
          </label>

          <button className="a11y-reset" onClick={reset}>איפוס הגדרות</button>
        </div>
      )}

      <style jsx>{`
        .a11y-toggle {
          position: fixed;
          bottom: 80px;
          inset-inline-start: 16px;
          z-index: 9999;
          width: 44px; height: 44px;
          border-radius: 50%;
          background: var(--stone-800, #292524);
          border: 2px solid var(--copper-500, #d97706);
          color: var(--copper-400, #e09f3e);
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .a11y-toggle:hover { background: var(--stone-700, #44403c); }
        .a11y-toggle:focus-visible { outline: 3px solid var(--copper-500); outline-offset: 2px; }

        .a11y-panel {
          position: fixed;
          bottom: 132px;
          inset-inline-start: 16px;
          z-index: 9999;
          width: 280px;
          background: var(--stone-900, #1c1917);
          border: 1px solid var(--stone-700, #44403c);
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          font-family: 'Heebo', sans-serif;
          color: var(--text-primary, #e7e5e4);
        }

        .a11y-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 14px; padding-bottom: 10px;
          border-bottom: 1px solid var(--stone-700, #44403c);
        }
        .a11y-header h3 { margin: 0; font-size: 16px; font-weight: 700; }
        .a11y-close {
          background: none; border: none; color: var(--stone-400);
          font-size: 16px; cursor: pointer; padding: 4px;
        }
        .a11y-close:hover { color: var(--text-primary); }

        .a11y-option {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 0; font-size: 14px;
        }
        .a11y-toggle-row { cursor: pointer; }
        .a11y-toggle-row input[type="checkbox"] {
          width: 18px; height: 18px; accent-color: var(--copper-500, #d97706);
          cursor: pointer;
        }

        .a11y-font-controls {
          display: flex; align-items: center; gap: 8px;
        }
        .a11y-font-controls button {
          width: 32px; height: 32px; border-radius: 6px;
          border: 1px solid var(--stone-700); background: var(--stone-800);
          color: var(--text-primary); cursor: pointer; font-size: 14px;
          font-family: 'Heebo', sans-serif; font-weight: 700;
          transition: background 0.15s ease;
        }
        .a11y-font-controls button:hover { background: var(--stone-700); }
        .a11y-font-value {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px; min-width: 40px; text-align: center;
        }

        .a11y-reset {
          width: 100%; margin-top: 12px; padding: 8px;
          background: transparent; border: 1px solid var(--stone-700);
          border-radius: 6px; color: var(--stone-400);
          font-family: 'Heebo', sans-serif; font-size: 13px;
          cursor: pointer; transition: all 0.15s ease;
        }
        .a11y-reset:hover { border-color: var(--copper-500); color: var(--text-primary); }
      `}</style>

      <style jsx global>{`
        /* High contrast mode */
        .a11y-high-contrast { --text-primary: #ffffff !important; --text-secondary: #d6d3d1 !important; --bg-primary: #000000 !important; --stone-900: #000000 !important; --stone-800: #111111 !important; --border-default: #666 !important; }
        .a11y-high-contrast .bubble { border-width: 2px !important; }

        /* Reduce motion */
        .a11y-reduce-motion, .a11y-reduce-motion * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }

        /* Large cursor */
        .a11y-large-cursor, .a11y-large-cursor * { cursor: default; }
        .a11y-large-cursor a, .a11y-large-cursor button, .a11y-large-cursor [role="button"], .a11y-large-cursor input, .a11y-large-cursor select, .a11y-large-cursor textarea { cursor: pointer; }

        /* Highlight links */
        .a11y-highlight-links a { text-decoration: underline !important; text-underline-offset: 3px; }
        .a11y-highlight-links a:focus-visible, .a11y-highlight-links button:focus-visible { outline: 3px solid #d97706 !important; outline-offset: 2px !important; }
      `}</style>
    </>
  );
}

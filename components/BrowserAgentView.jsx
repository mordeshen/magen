import { useState, useRef, useEffect } from "react";
import { useUser } from "../lib/UserContext";

const EXAMPLE_TASKS = [
  { title: "הגשת בקשה לרכב רפואי", desc: "פנייה באתר אגף השיקום", example: true },
  { title: "ערעור על אחוזי נכות", desc: "הגשת ערעור על החלטת ועדה", example: true },
  { title: "בקשה להחזר הוצאות", desc: "העלאת קבלות ואישורים", example: true },
  { title: "הפניה רפואית חדשה", desc: "פתיחת הפניה לטיפול", example: true },
];

const STATUS_LABELS = {
  idle: "מוכן",
  starting: "פותח את אתר אגף השיקום...",
  waiting_login: "ממתין להתחברות",
  waiting_phone: "הכנס מספר טלפון",
  waiting_otp: "הכנס קוד חד-פעמי",
  working: "עובד...",
  awaiting_confirmation: "ממתין לאישור שלך",
  done: "הושלם!",
  error: "שגיאה",
};

export default function BrowserAgentView({ onClose, initialTask }) {
  const { user, profile, legalCase } = useUser();
  const [status, setStatus] = useState("starting"); // start immediately
  const [screenshot, setScreenshot] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [taskInput, setTaskInput] = useState(initialTask || "");
  const [loginId, setLoginId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [correction, setCorrection] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState("chat"); // "chat" | "browser"
  const [otpMethod, setOtpMethod] = useState("sms"); // "sms" | "email"
  const msgsEndRef = useRef(null);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-start — always open the site immediately
  useEffect(() => {
    autoStart();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function autoStart() {
    setStatus("starting");
    addMessage(initialTask ? `משימה: ${initialTask}` : "פותח את אתר אגף השיקום...", initialTask ? "user" : "agent");
    try {
      const r = await fetch("/api/browser-agent/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: initialTask || "ניווט חופשי" }),
      });
      const d = await r.json();
      if (!r.ok) {
        addMessage(d.error || "שגיאה בהפעלה", "error");
        setStatus("error");
        return;
      }
      setSessionId(d.sessionId);
      setScreenshot(d.screenshot);
      setStatus(d.status || "waiting_login");
      addMessage(d.message, "agent");
    } catch {
      addMessage("שגיאה בחיבור לשרת", "error");
      setStatus("error");
    }
  }

  function addMessage(text, from = "agent") {
    setMessages((prev) => [...prev, { text, from, time: new Date() }]);
  }

  async function handleStart() {
    if (!taskInput.trim() || loading) return;
    setLoading(true);
    setStatus("starting");
    addMessage(`משימה: ${taskInput}`, "user");

    try {
      const r = await fetch("/api/browser-agent/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskInput }),
      });
      const d = await r.json();
      if (!r.ok) {
        addMessage(d.error || "שגיאה בהפעלה", "error");
        setStatus("error");
        return;
      }
      setSessionId(d.sessionId);
      setScreenshot(d.screenshot);
      setStatus(d.status || "waiting_login");
      addMessage(d.message, "agent");
    } catch {
      addMessage("שגיאה בחיבור לשרת", "error");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendId() {
    if (!loginId || loading) return;
    setLoading(true);
    addMessage("שולח תעודת זהות...", "agent");

    try {
      const r = await fetch("/api/browser-agent/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, idNumber: loginId }),
      });
      const d = await r.json();
      if (d.screenshot) setScreenshot(d.screenshot);
      addMessage(d.message, d.step === "error" ? "error" : "agent");
      if (d.step === "need_phone") {
        setStatus("waiting_phone");
      } else if (d.step === "otp_sent") {
        setStatus("waiting_otp");
      }
    } catch {
      addMessage("שגיאה בשליחת ת.ז.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPhone() {
    if (!phoneNumber || loading) return;
    setLoading(true);
    addMessage("שולח מספר טלפון...", "agent");

    try {
      const r = await fetch("/api/browser-agent/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, phoneNumber }),
      });
      const d = await r.json();
      if (d.screenshot) setScreenshot(d.screenshot);
      addMessage(d.message, d.step === "error" ? "error" : "agent");
      if (d.step === "otp_sent") {
        setStatus("waiting_otp");
      }
    } catch {
      addMessage("שגיאה בשליחת מספר טלפון", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!otpCode || loading) return;
    setLoading(true);
    addMessage("מאמת קוד...", "agent");

    try {
      const r = await fetch("/api/browser-agent/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otpCode }),
      });
      const d = await r.json();
      if (d.screenshot) setScreenshot(d.screenshot);
      addMessage(d.message, d.success === false ? "error" : "agent");
      if (d.success) {
        setStatus("working");
        setLoginId("");
        setOtpCode("");
        handleStep();
      } else {
        setOtpCode("");
        setStatus("waiting_otp");
      }
    } catch {
      addMessage("שגיאה באימות הקוד", "error");
      setStatus("waiting_otp");
    } finally {
      setLoading(false);
    }
  }

  const steppingRef = useRef(false);

  async function handleStep(userCorrection) {
    if (steppingRef.current) return;
    steppingRef.current = true;
    setLoading(true);
    setStatus("working");

    try {
      const r = await fetch("/api/browser-agent/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          confirmed: true,
          correction: userCorrection || null,
        }),
      });
      const d = await r.json();
      if (!r.ok && d.error === "session not active") {
        // Session not ready yet — wait and retry once
        await new Promise(resolve => setTimeout(resolve, 2000));
        steppingRef.current = false;
        return handleStep(userCorrection);
      }
      if (d.screenshot) setScreenshot(d.screenshot);
      if (d.message && d.message !== "session not active") addMessage(d.message, "agent");
      if (d.error && d.error !== "session not active") addMessage(d.error, "error");

      if (d.done) {
        setStatus("done");
        addMessage("המשימה הושלמה בהצלחה!", "agent");
      } else if (d.awaitConfirmation) {
        setStatus("awaiting_confirmation");
      } else {
        // Auto-continue
        setTimeout(() => handleStep(), 500);
      }
    } catch {
      addMessage("שגיאה בביצוע", "error");
      setStatus("error");
    } finally {
      setLoading(false);
      steppingRef.current = false;
    }
  }

  async function handleCancel() {
    if (sessionId) {
      fetch("/api/browser-agent/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
    if (onClose) onClose();
  }

  function handleCorrection() {
    if (!correction.trim()) return;
    addMessage(`תיקון: ${correction}`, "user");
    handleStep(correction);
    setCorrection("");
  }

  const [browserFocused, setBrowserFocused] = useState(false);

  async function refreshScreenshot() {
    if (!sessionId) return;
    try {
      const r = await fetch("/api/browser-agent/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const d = await r.json();
      if (d.screenshot) setScreenshot(d.screenshot);
      if (d.loggedIn && status !== "active") {
        setStatus("active");
        addMessage("מחובר! עכשיו אני מתחיל לעבוד.", "agent");
        handleStep();
      }
    } catch {}
  }
  const keyBufferRef = useRef("");
  const keyTimerRef = useRef(null);
  const flushingRef = useRef(false);

  async function flushKeys() {
    if (flushingRef.current || !keyBufferRef.current) return;
    flushingRef.current = true;
    const text = keyBufferRef.current;
    keyBufferRef.current = "";
    try {
      const r = await fetch("/api/browser-agent/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text }),
      });
      const d = await r.json();
      if (d.screenshot) setScreenshot(d.screenshot);
      if (d.loggedIn && status !== "active") {
        setStatus("active");
        addMessage("מחובר! עכשיו אני מתחיל לעבוד.", "agent");
        handleStep();
      }
    } catch {}
    flushingRef.current = false;
    if (keyBufferRef.current) flushKeys();
  }

  useEffect(() => {
    if (!browserFocused || !sessionId) return;
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      e.preventDefault();
      const key = e.key;
      // Special keys — send immediately
      if (["Backspace", "Enter", "Tab", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete"].includes(key)) {
        if (keyTimerRef.current) { clearTimeout(keyTimerRef.current); keyTimerRef.current = null; }
        if (keyBufferRef.current) flushKeys();
        fetch("/api/browser-agent/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, key }),
        }).then(r => r.json()).then(d => {
          if (d.screenshot) setScreenshot(d.screenshot);
          if (d.loggedIn && status !== "active") {
            setStatus("active");
            addMessage("מחובר! עכשיו אני מתחיל לעבוד.", "agent");
            handleStep();
          }
        }).catch(() => {});
        return;
      }
      // Regular characters — buffer and debounce
      if (key.length === 1) {
        keyBufferRef.current += key;
        if (keyTimerRef.current) clearTimeout(keyTimerRef.current);
        keyTimerRef.current = setTimeout(() => { keyTimerRef.current = null; flushKeys(); }, 300);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (keyTimerRef.current) clearTimeout(keyTimerRef.current); };
  }, [browserFocused, sessionId, status]);

  async function handleScreenClick(e) {
    if (!sessionId || loading) return;
    const img = e.target;
    if (img.tagName !== "IMG") return;
    const rect = img.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 800);
    setLoading(true);
    try {
      const r = await fetch("/api/browser-agent/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, x, y }),
      });
      const d = await r.json();
      if (d.screenshot) setScreenshot(d.screenshot);
      if (d.pageContext?.otpMethod && d.pageContext.otpMethod !== otpMethod) {
        setOtpMethod(d.pageContext.otpMethod);
        addMessage(d.pageContext.otpMethod === "email" ? "בחרת לקבל קוד במייל." : "בחרת לקבל קוד ב-SMS.", "agent");
      }
      if (d.pageContext?.hasOtpField && status !== "waiting_otp") {
        setStatus("waiting_otp");
      }
      if (d.loggedIn && status !== "active") {
        setStatus("active");
        addMessage("מחובר! עכשיו אני מתחיל לעבוד.", "agent");
        handleStep();
      }
    } catch {}
    setLoading(false);
  }

  return (
    <div className="ba-container" dir="rtl">
      <div className="ba-header">
        <h3>סוכן אוטומציה — אגף השיקום</h3>
        <div className="ba-status">{STATUS_LABELS[status] || status}</div>
        <button className="ba-close" onClick={handleCancel} aria-label="סגור">✕</button>
      </div>

      <div className="ba-mobile-tabs">
        <button className={`ba-tab ${mobileTab === "chat" ? "ba-tab-active" : ""}`} onClick={() => setMobileTab("chat")}>פעולות</button>
        <button className={`ba-tab ${mobileTab === "browser" ? "ba-tab-active" : ""}`} onClick={() => setMobileTab("browser")}>מסך האתר</button>
      </div>

      <div className="ba-content">
        {/* Screenshot panel */}
        <div className={`ba-browser ${mobileTab !== "browser" ? "ba-mobile-hidden" : ""} ${browserFocused ? "ba-browser-focused" : ""}`} onClick={(e) => { setBrowserFocused(true); handleScreenClick(e); }} tabIndex={0} onFocus={() => setBrowserFocused(true)} onBlur={() => setBrowserFocused(false)}>
          {screenshot ? (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="מסך אתר אגף השיקום"
              className="ba-screenshot"
            />
          ) : (
            <div className="ba-placeholder">
              <div className="ba-loading-site">
                <div className="ba-loading-bar" />
                <p>טוען את אתר אגף השיקום...</p>
              </div>
            </div>
          )}
          {loading && screenshot && (
            <div className="ba-loading-overlay">
              <div className="ba-loading-bar" />
              <span>מעבד...</span>
            </div>
          )}
          {screenshot && (
            <div className="ba-browser-bar">
              {(status === "waiting_login" || status === "waiting_phone" || status === "waiting_otp") && (
                <span className="ba-interact-hint">לחץ על המסך כדי להתחבר ידנית</span>
              )}
              <button className="ba-refresh-btn" onClick={refreshScreenshot} title="רענן מסך">↻</button>
            </div>
          )}
        </div>

        {/* Chat/controls panel */}
        <div className={`ba-chat ${mobileTab !== "chat" ? "ba-mobile-hidden" : ""}`}>
          {/* Task suggestions */}
          <div className="ba-suggestions">
            <div className="ba-suggestions-title">מה אפשר לעשות כאן?</div>
            <div className="ba-suggestions-list">
              {EXAMPLE_TASKS.map((t, i) => (
                <button key={i} className="ba-suggestion" onClick={() => {
                  setTaskInput(t.title);
                  if (sessionId && status !== "starting") {
                    addMessage(`משימה: ${t.title}`, "user");
                  }
                }}>
                  <span className="ba-suggestion-title">{t.title}</span>
                  <span className="ba-suggestion-desc">{t.desc}</span>
                  {t.example && <span className="ba-suggestion-badge">דוגמה</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="ba-messages">
            {messages.map((m, i) => (
              <div key={i} className={`ba-msg ba-msg-${m.from}`}>
                {m.text}
              </div>
            ))}
            <div ref={msgsEndRef} />
          </div>

          {/* Controls based on status */}
          <div className="ba-controls">
            {status === "idle" && (
              <div className="ba-working">
                <div className="ba-spinner" />
                <span>מתחיל...</span>
              </div>
            )}

            {status === "waiting_login" && (
              <div className="ba-login-form">
                <p className="ba-login-note">הזן ת.ז. — נשלח קוד חד-פעמי ב-SMS. הפרטים לא נשמרים.</p>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleSendId()}
                  placeholder="תעודת זהות"
                  className="ba-input"
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={9}
                />
                <button onClick={handleSendId} disabled={loading || !loginId} className="ba-btn ba-btn-primary">
                  {loading ? "שולח..." : "שלח קוד חד-פעמי"}
                </button>
              </div>
            )}

            {status === "waiting_phone" && (
              <div className="ba-login-form">
                <p className="ba-login-note">
                  {otpMethod === "email"
                    ? "הכנס את כתובת המייל שרשומה אצל אגף השיקום."
                    : "הכנס את מספר הטלפון הנייד שרשום אצל אגף השיקום."}
                </p>
                <p className="ba-login-switch" onClick={() => { setOtpMethod(m => m === "sms" ? "email" : "sms"); }}>
                  {otpMethod === "email" ? "מעדיף SMS? לחץ כאן" : "מעדיף מייל? לחץ כאן"}
                </p>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(otpMethod === "email" ? e.target.value : e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleSendPhone()}
                  placeholder={otpMethod === "email" ? "כתובת מייל" : "מספר טלפון נייד"}
                  className="ba-input"
                  autoComplete="off"
                  inputMode={otpMethod === "email" ? "email" : "numeric"}
                  maxLength={otpMethod === "email" ? 100 : 10}
                />
                <button onClick={handleSendPhone} disabled={loading || !phoneNumber} className="ba-btn ba-btn-primary">
                  {loading ? "שולח..." : "שלח קוד"}
                </button>
              </div>
            )}

            {status === "waiting_otp" && (
              <div className="ba-login-form">
                <p className="ba-login-note">הכנס את הקוד שקיבלת {otpMethod === "email" ? "במייל" : "ב-SMS"}.</p>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                  placeholder="קוד חד-פעמי"
                  className="ba-input"
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={6}
                />
                <button onClick={handleSendOtp} disabled={loading || !otpCode} className="ba-btn ba-btn-primary">
                  {loading ? "מאמת..." : "אימות והתחברות"}
                </button>
              </div>
            )}

            {status === "awaiting_confirmation" && (
              <div className="ba-confirm">
                <p>בדוק את המסך — הכל נכון?</p>
                <div className="ba-confirm-btns">
                  <button onClick={() => handleStep()} disabled={loading} className="ba-btn ba-btn-primary">
                    אוקיי, המשך
                  </button>
                  <div className="ba-correction-row">
                    <input
                      type="text"
                      value={correction}
                      onChange={(e) => setCorrection(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCorrection()}
                      placeholder="מה לתקן?"
                      className="ba-input ba-input-small"
                    />
                    <button onClick={handleCorrection} disabled={loading || !correction.trim()} className="ba-btn ba-btn-secondary">
                      תקן
                    </button>
                  </div>
                </div>
              </div>
            )}

            {status === "working" && (
              <div className="ba-working">
                <div className="ba-spinner" />
                <span>עובד...</span>
              </div>
            )}

            {status === "done" && (
              <div className="ba-done">
                <p>המשימה הושלמה בהצלחה!</p>
                <button onClick={handleCancel} className="ba-btn ba-btn-primary">סגור</button>
              </div>
            )}

            {status === "error" && (
              <div className="ba-error-actions">
                <button onClick={() => setStatus("idle")} className="ba-btn ba-btn-secondary">נסה שוב</button>
                <button onClick={handleCancel} className="ba-btn ba-btn-secondary">סגור</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .ba-container {
          position: fixed; inset: 0; z-index: 10000;
          background: var(--stone-950, #0c0a09);
          display: flex; flex-direction: column;
          font-family: 'Heebo', sans-serif;
          color: var(--text-primary, #e7e5e4);
        }
        .ba-header {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 20px;
          background: var(--stone-900, #1c1917);
          border-bottom: 1px solid var(--stone-700, #44403c);
        }
        .ba-header h3 { margin: 0; font-size: 16px; font-weight: 700; flex: 1; }
        .ba-status {
          font-size: 13px; color: var(--copper-400, #e09f3e);
          font-weight: 600;
        }
        .ba-close {
          background: none; border: none; color: var(--stone-400);
          font-size: 18px; cursor: pointer; padding: 4px 8px;
        }
        .ba-close:hover { color: var(--text-primary); }

        /* Mobile tabs */
        .ba-mobile-tabs { display: none; }
        @media (max-width: 768px) {
          .ba-mobile-tabs {
            display: flex; border-bottom: 1px solid var(--stone-700);
          }
          .ba-tab {
            flex: 1; padding: 10px; border: none; background: var(--stone-900);
            color: var(--stone-400); font-family: 'Heebo', sans-serif;
            font-size: 14px; font-weight: 600; cursor: pointer;
            transition: all 0.15s ease;
          }
          .ba-tab-active { color: var(--copper-400); border-bottom: 2px solid var(--copper-500); }
          .ba-mobile-hidden { display: none !important; }
        }

        .ba-content {
          flex: 1; display: flex; overflow: hidden;
        }

        .ba-browser {
          flex: 3; background: #111; display: flex; align-items: center; justify-content: center;
          overflow: auto; padding: 8px; position: relative; cursor: pointer;
        }
        .ba-screenshot {
          max-width: 100%; max-height: 100%; object-fit: contain;
          border-radius: 4px; border: 1px solid var(--stone-700);
        }
        .ba-placeholder {
          color: var(--stone-400); text-align: center; font-size: 14px;
          display: flex; align-items: center; justify-content: center;
        }
        .ba-loading-site {
          display: flex; flex-direction: column; align-items: center; gap: 16px;
        }
        .ba-loading-site p { font-family: 'Heebo', sans-serif; margin: 0; }
        .ba-loading-bar {
          width: 200px; height: 3px; background: var(--stone-700);
          border-radius: 3px; overflow: hidden; position: relative;
        }
        .ba-loading-bar::after {
          content: ''; position: absolute; top: 0; left: 0;
          width: 40%; height: 100%; background: var(--copper-500);
          border-radius: 3px;
          animation: ba-loading-slide 1.5s ease-in-out infinite;
        }
        @keyframes ba-loading-slide {
          0% { left: -40%; }
          100% { left: 100%; }
        }
        .ba-loading-overlay {
          position: absolute; top: 0; left: 0; right: 0;
          display: flex; align-items: center; gap: 10px;
          padding: 8px 16px; background: rgba(12,10,9,0.85);
          font-family: 'Heebo', sans-serif; font-size: 13px;
          color: var(--copper-400); z-index: 2;
        }
        .ba-loading-overlay .ba-loading-bar { flex: 1; height: 2px; }
        .ba-browser-focused { outline: 2px solid var(--copper-500); outline-offset: -2px; }
        .ba-browser-bar {
          position: absolute; bottom: 8px; left: 8px; right: 8px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .ba-interact-hint {
          background: rgba(0,0,0,0.7); color: var(--copper-400);
          padding: 6px 16px; border-radius: 20px; font-size: 12px;
          font-family: 'Heebo', sans-serif;
        }
        .ba-refresh-btn {
          position: absolute; inset-inline-end: 0;
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(0,0,0,0.7); border: 1px solid var(--stone-600);
          color: var(--stone-300); font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .ba-refresh-btn:hover { background: rgba(0,0,0,0.9); color: var(--copper-400); }

        .ba-chat {
          flex: 2; display: flex; flex-direction: column;
          border-inline-start: 1px solid var(--stone-700);
          min-width: 300px; max-width: 400px;
        }
        @media (max-width: 768px) {
          .ba-chat { max-width: 100%; min-width: 0; border-inline-start: none; flex: 1; }
          .ba-browser { flex: 1; }
        }

        /* Suggestions panel */
        .ba-suggestions {
          padding: 10px 12px; border-bottom: 1px solid var(--stone-700);
          background: var(--stone-900);
        }
        .ba-suggestions-title {
          font-size: 12px; font-weight: 600; color: var(--stone-400);
          margin-bottom: 8px; font-family: 'Heebo', sans-serif;
        }
        .ba-suggestions-list {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .ba-suggestion {
          display: flex; flex-direction: column; gap: 2px;
          padding: 6px 10px; border-radius: 6px;
          border: 1px solid var(--stone-700); background: var(--stone-800);
          cursor: pointer; text-align: right; direction: rtl;
          font-family: 'Heebo', sans-serif;
          transition: all 0.15s ease; position: relative;
        }
        .ba-suggestion:hover { border-color: var(--copper-500); background: rgba(217,119,6,.06); }
        .ba-suggestion-title { font-size: 12px; font-weight: 600; color: var(--stone-200); }
        .ba-suggestion-desc { font-size: 10px; color: var(--stone-400); }
        .ba-suggestion-badge {
          position: absolute; top: -4px; inset-inline-start: -4px;
          font-size: 9px; font-weight: 700; color: var(--stone-950);
          background: var(--stone-500); padding: 1px 5px; border-radius: 3px;
        }

        .ba-messages {
          flex: 1; overflow-y: auto; padding: 12px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .ba-msg {
          padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.6;
          max-width: 90%;
        }
        .ba-msg-agent { background: var(--stone-800); align-self: flex-start; border-inline-start: 2px solid var(--copper-500); }
        .ba-msg-user { background: rgba(217,119,6,.1); align-self: flex-end; border-inline-end: 2px solid var(--copper-500); }
        .ba-msg-error { background: rgba(220,38,38,.1); color: var(--status-urgent, #dc2626); align-self: flex-start; border-inline-start: 2px solid var(--status-urgent); }

        .ba-controls { padding: 12px; border-top: 1px solid var(--stone-700); }

        .ba-input {
          width: 100%; padding: 10px 14px; border-radius: 8px;
          border: 1px solid var(--stone-700); background: var(--stone-800);
          color: var(--text-primary); font-family: 'Heebo', sans-serif;
          font-size: 14px; margin-bottom: 8px;
        }
        .ba-input:focus { outline: none; border-color: var(--copper-500); }
        .ba-input-small { margin-bottom: 0; }

        .ba-btn {
          padding: 10px 20px; border-radius: 8px; border: none;
          font-family: 'Heebo', sans-serif; font-weight: 700; font-size: 14px;
          cursor: pointer; transition: background 0.15s ease;
        }
        .ba-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ba-btn-primary { background: var(--copper-500); color: var(--stone-950); width: 100%; }
        .ba-btn-primary:hover:not(:disabled) { background: var(--copper-600); }
        .ba-btn-secondary { background: var(--stone-700); color: var(--text-primary); }
        .ba-btn-secondary:hover:not(:disabled) { background: var(--stone-600); }

        .ba-task-input { display: flex; flex-direction: column; gap: 8px; }
        .ba-login-form { display: flex; flex-direction: column; gap: 4px; }
        .ba-login-note { font-size: 12px; color: var(--stone-400); margin: 0 0 4px; }
        .ba-login-switch { font-size: 11px; color: var(--copper-400); cursor: pointer; margin: 0 0 6px; text-decoration: underline; }
        .ba-login-switch:hover { color: var(--copper-500); }

        .ba-confirm p { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
        .ba-confirm-btns { display: flex; flex-direction: column; gap: 8px; }
        .ba-correction-row { display: flex; gap: 8px; }
        .ba-correction-row .ba-input-small { flex: 1; }

        .ba-working {
          display: flex; align-items: center; gap: 10px; justify-content: center;
          padding: 16px; color: var(--copper-400);
        }
        .ba-spinner {
          width: 20px; height: 20px; border: 2px solid var(--stone-700);
          border-top-color: var(--copper-500); border-radius: 50%;
          animation: ba-spin 0.8s linear infinite;
        }
        @keyframes ba-spin { to { transform: rotate(360deg); } }

        .ba-done { text-align: center; }
        .ba-done p { margin: 0 0 12px; font-weight: 600; color: var(--status-success, #16a34a); }

        .ba-error-actions { display: flex; gap: 8px; }
        .ba-error-actions .ba-btn { flex: 1; }

        @media (prefers-reduced-motion: reduce) {
          .ba-spinner { animation: none; }
        }
      `}</style>
    </div>
  );
}

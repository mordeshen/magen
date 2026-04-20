import { useState, useRef, useEffect } from "react";

const STATUS_LABELS = {
  idle: "מוכן",
  starting: "פותח את אתר אגף השיקום...",
  waiting_login: "ממתין להתחברות",
  working: "עובד...",
  awaiting_confirmation: "ממתין לאישור שלך",
  done: "הושלם!",
  error: "שגיאה",
};

export default function BrowserAgentView({ onClose, initialTask }) {
  const [status, setStatus] = useState("idle");
  const [screenshot, setScreenshot] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [taskInput, setTaskInput] = useState(initialTask || "");
  const [loginId, setLoginId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [correction, setCorrection] = useState("");
  const [loading, setLoading] = useState(false);
  const msgsEndRef = useRef(null);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      if (d.step === "otp_sent") {
        setStatus("waiting_otp");
      }
    } catch {
      addMessage("שגיאה בשליחת ת.ז.", "error");
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

  async function handleStep(userCorrection) {
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
      if (d.screenshot) setScreenshot(d.screenshot);
      if (d.message) addMessage(d.message, "agent");
      if (d.error) addMessage(d.error, "error");

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

  return (
    <div className="ba-container" dir="rtl">
      <div className="ba-header">
        <h3>סוכן אוטומציה — אגף השיקום</h3>
        <div className="ba-status">{STATUS_LABELS[status] || status}</div>
        <button className="ba-close" onClick={handleCancel} aria-label="סגור">✕</button>
      </div>

      <div className="ba-content">
        {/* Screenshot panel */}
        <div className="ba-browser">
          {screenshot ? (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="מסך אתר אגף השיקום"
              className="ba-screenshot"
            />
          ) : (
            <div className="ba-placeholder">
              <p>מסך האתר יופיע כאן</p>
            </div>
          )}
        </div>

        {/* Chat/controls panel */}
        <div className="ba-chat">
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
              <div className="ba-task-input">
                <input
                  type="text"
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  placeholder="מה תרצה לעשות? (למשל: הגשת בקשה לעזרת ניידות)"
                  className="ba-input"
                  disabled={loading}
                />
                <button onClick={handleStart} disabled={loading || !taskInput.trim()} className="ba-btn ba-btn-primary">
                  {loading ? "מפעיל..." : "התחל"}
                </button>
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

            {status === "waiting_otp" && (
              <div className="ba-login-form">
                <p className="ba-login-note">הכנס את הקוד שקיבלת ב-SMS.</p>
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

        .ba-content {
          flex: 1; display: flex; overflow: hidden;
        }
        @media (max-width: 768px) {
          .ba-content { flex-direction: column; }
        }

        .ba-browser {
          flex: 3; background: #111; display: flex; align-items: center; justify-content: center;
          overflow: auto; padding: 8px;
        }
        .ba-screenshot {
          max-width: 100%; max-height: 100%; object-fit: contain;
          border-radius: 4px; border: 1px solid var(--stone-700);
        }
        .ba-placeholder {
          color: var(--stone-600); text-align: center; font-size: 14px;
        }

        .ba-chat {
          flex: 2; display: flex; flex-direction: column;
          border-inline-start: 1px solid var(--stone-700);
          min-width: 300px; max-width: 400px;
        }
        @media (max-width: 768px) {
          .ba-chat { max-width: 100%; min-width: 0; border-inline-start: none; border-top: 1px solid var(--stone-700); }
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

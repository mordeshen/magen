import { useState, useEffect } from "react";

// Probability that the widget appears after a given response.
// Tweak via env if needed: NEXT_PUBLIC_FEEDBACK_RATE=0.15
const SHOW_RATE = parseFloat(
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_FEEDBACK_RATE) || "0.1"
);

// Cooldown so the same user doesn't get asked twice in a row
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const LS_KEY = "magen-feedback-last-shown";

/**
 * FeedbackWidget — small inline rating popup that appears after some
 * assistant responses. Anonymous, no PII. Sends rating + optional comment
 * to /api/feedback referencing the chat_logs row id.
 *
 * Props:
 *   chatLogId: string  — id returned from /api/chat (response._logId)
 *   onClose:   function — called when user dismisses or submits
 */
export default function FeedbackWidget({ chatLogId, onClose }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!rating || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_log_id: chatLogId || null,
          rating,
          comment: comment.trim() || null,
        }),
      });
      setSubmitted(true);
      try { localStorage.setItem(LS_KEY, String(Date.now())); } catch {}
      setTimeout(() => { if (onClose) onClose(); }, 1500);
    } catch {
      // Silently fail — don't bother the user
      if (onClose) onClose();
    }
    setSubmitting(false);
  }

  function handleStarClick(n) {
    setRating(n);
    if (n <= 3) setShowComment(true);
  }

  if (submitted) {
    return (
      <div className="feedback-widget feedback-widget-thanks" dir="rtl">
        תודה על המשוב 🙏
        <style jsx>{`
          .feedback-widget {
            margin: 12px auto;
            max-width: 420px;
            padding: 14px 20px;
            background: rgba(22, 163, 74, 0.08);
            border: 1px solid rgba(22, 163, 74, 0.4);
            border-radius: 8px;
            color: #d6d3d1;
            font-family: Heebo, sans-serif;
            font-size: 14px;
            text-align: center;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="feedback-widget" dir="rtl">
      <div className="feedback-row">
        <span className="feedback-q">איך הייתה התשובה?</span>
        <div className="feedback-stars">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              className={`feedback-star ${n <= (hover || rating) ? "active" : ""}`}
              onClick={() => handleStarClick(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${n} כוכבים`}
            >
              ★
            </button>
          ))}
        </div>
        <button
          type="button"
          className="feedback-close"
          onClick={onClose}
          aria-label="סגור"
        >
          ✕
        </button>
      </div>

      {showComment && (
        <div className="feedback-comment-row">
          <input
            type="text"
            className="feedback-comment"
            placeholder="מה היה חסר? (לא חובה)"
            value={comment}
            onChange={e => setComment(e.target.value.slice(0, 300))}
            maxLength={300}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
          <button
            type="button"
            className="feedback-submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            שלח
          </button>
        </div>
      )}

      {!showComment && rating > 0 && (
        <button
          type="button"
          className="feedback-submit feedback-submit-only"
          onClick={handleSubmit}
          disabled={submitting}
        >
          שלח דירוג
        </button>
      )}

      <style jsx>{`
        .feedback-widget {
          margin: 12px auto 8px;
          max-width: 460px;
          padding: 12px 16px;
          background: rgba(217, 119, 6, 0.06);
          border: 1px solid rgba(217, 119, 6, 0.35);
          border-radius: 8px;
          font-family: Heebo, sans-serif;
        }
        .feedback-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .feedback-q {
          font-size: 13px;
          color: #d6d3d1;
          flex: 1;
        }
        .feedback-stars {
          display: flex;
          gap: 2px;
        }
        .feedback-star {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 22px;
          color: #44403c;
          padding: 0 2px;
          transition: color 0.15s ease, transform 0.1s ease;
          line-height: 1;
        }
        .feedback-star.active {
          color: #d97706;
        }
        .feedback-star:hover {
          transform: scale(1.1);
        }
        .feedback-close {
          background: none;
          border: none;
          color: #57534e;
          font-size: 14px;
          cursor: pointer;
          padding: 4px;
        }
        .feedback-close:hover {
          color: #d6d3d1;
        }
        .feedback-comment-row {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .feedback-comment {
          flex: 1;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid #44403c;
          border-radius: 6px;
          color: #e7e5e4;
          font-family: Heebo, sans-serif;
          font-size: 13px;
        }
        .feedback-comment:focus {
          outline: none;
          border-color: #d97706;
        }
        .feedback-submit {
          padding: 8px 16px;
          background: #d97706;
          border: none;
          border-radius: 6px;
          color: #0c0a09;
          font-family: Heebo, sans-serif;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .feedback-submit:hover:not(:disabled) {
          background: #c2410c;
        }
        .feedback-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .feedback-submit-only {
          margin-top: 10px;
          width: 100%;
        }
      `}</style>
    </div>
  );
}

/**
 * Helper to decide whether the widget should appear for a given response.
 * - Random sampling at SHOW_RATE
 * - Cooldown so we don't pester the same session
 */
export function shouldShowFeedback() {
  if (typeof window === "undefined") return false;
  try {
    const last = parseInt(localStorage.getItem(LS_KEY) || "0", 10);
    if (last && Date.now() - last < COOLDOWN_MS) return false;
  } catch {}
  return Math.random() < SHOW_RATE;
}

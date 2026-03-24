import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useUser } from "../lib/UserContext";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

function parseToken(tokenStr) {
  try {
    const json = atob(tokenStr);
    const data = JSON.parse(json);
    if (!data.phone || !data.exp) return null;
    if (Date.now() > data.exp) return { expired: true };
    return data;
  } catch {
    return null;
  }
}

export default function PairPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const [status, setStatus] = useState("loading"); // loading | login | pairing | success | already | error
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [sending, setSending] = useState(false);

  const token = router.query.token;

  // Parse and validate token once router is ready
  const tokenData = token ? parseToken(token) : null;

  async function doPairing() {
    setStatus("pairing");
    try {
      const res = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "ALREADY_PAIRED") {
          setStatus("already");
        } else {
          setError(data.error || "שגיאה בחיבור");
          setStatus("error");
        }
        return;
      }
      setStatus("success");
    } catch {
      setError("שגיאה בתקשורת עם השרת");
      setStatus("error");
    }
  }

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) { setError("לינק לא תקין — חסר טוקן"); setStatus("error"); return; }

    const parsed = parseToken(token);
    if (!parsed) { setError("לינק לא תקין"); setStatus("error"); return; }
    if (parsed.expired) { setError("תוקף הלינק פג. שלחו הודעה חדשה בוואטסאפ כדי לקבל לינק חדש."); setStatus("error"); return; }

    if (authLoading) return; // wait for auth

    if (user) {
      doPairing();
    } else {
      setStatus("login");
    }
  }, [router.isReady, token, user, authLoading]);

  async function handleMagicLink(e) {
    e.preventDefault();
    if (!email.trim() || !isSupabaseConfigured) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/pair?token=${token}`,
      },
    });
    setSending(false);
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setMagicLinkSent(true);
    }
  }

  function renderContent() {
    if (status === "loading" || status === "pairing") {
      return (
        <div className="pair-card">
          <div className="spinner" />
          <p className="pair-text">
            {status === "pairing" ? "מחבר את החשבון..." : "טוען..."}
          </p>
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className="pair-card">
          <div className="icon-circle icon-error">!</div>
          <h2 className="pair-title">שגיאה</h2>
          <p className="pair-text">{error}</p>
        </div>
      );
    }

    if (status === "already") {
      return (
        <div className="pair-card">
          <div className="icon-circle icon-info">&#10003;</div>
          <h2 className="pair-title">כבר מחובר</h2>
          <p className="pair-text">מספר הוואטסאפ הזה כבר מחובר לחשבון שלך.</p>
        </div>
      );
    }

    if (status === "success") {
      return (
        <div className="pair-card">
          <div className="icon-circle icon-success">&#10003;</div>
          <h2 className="pair-title">החיבור הצליח</h2>
          <p className="pair-text">חשבון הוואטסאפ חובר בהצלחה לחשבון מגן שלך.</p>
          <p className="pair-text-secondary">אפשר לחזור לוואטסאפ.</p>
        </div>
      );
    }

    // status === "login"
    if (magicLinkSent) {
      return (
        <div className="pair-card">
          <div className="icon-circle icon-info">&#9993;</div>
          <h2 className="pair-title">בדוק את המייל</h2>
          <p className="pair-text">
            שלחנו לינק התחברות ל-<strong>{email}</strong>.
            <br />לחץ על הלינק במייל כדי להמשיך.
          </p>
        </div>
      );
    }

    return (
      <div className="pair-card">
        <h2 className="pair-title">התחברות לחשבון מגן</h2>
        <p className="pair-text">כדי לחבר את הוואטסאפ לחשבון, צריך קודם להתחבר.</p>
        <form onSubmit={handleMagicLink} className="pair-form">
          <label htmlFor="email" className="pair-label">כתובת מייל</label>
          <input
            id="email"
            type="email"
            required
            className="pair-input"
            placeholder="you@example.com"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="pair-btn" disabled={sending}>
            {sending ? "שולח..." : "שליחת לינק התחברות"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>חיבור וואטסאפ | מגן</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
      </Head>

      <main className="pair-page" dir="rtl">
        <span className="section-tag">חיבור וואטסאפ לחשבון מגן</span>
        {renderContent()}
      </main>

      <style jsx>{`
        .pair-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: clamp(1rem, 4vw, 3rem);
          background: var(--bg-primary, #1c1917);
          font-family: 'Heebo', sans-serif;
          color: var(--text-primary, #e7e5e4);
        }

        .section-tag {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          color: var(--accent-primary, #d97706);
          margin-bottom: 1.5rem;
          display: block;
        }

        .pair-card {
          background: var(--bg-elevated, #292524);
          border: 1px solid var(--border-default, #44403c);
          border-radius: 8px;
          padding: clamp(1.5rem, 3vw, 2.5rem);
          max-width: 420px;
          width: 100%;
          text-align: center;
        }

        .pair-title {
          font-weight: 700;
          font-size: 1.25rem;
          line-height: 1.3;
          letter-spacing: -0.02em;
          margin: 0 0 0.75rem 0;
          color: var(--text-primary, #e7e5e4);
        }

        .pair-text {
          font-weight: 400;
          font-size: 1rem;
          line-height: 1.7;
          color: var(--text-secondary, #a8a29e);
          margin: 0 0 0.5rem 0;
        }

        .pair-text strong {
          color: var(--text-primary, #e7e5e4);
        }

        .pair-text-secondary {
          font-size: 0.875rem;
          color: var(--text-secondary, #a8a29e);
          margin: 1rem 0 0 0;
          line-height: 1.6;
        }

        .pair-form {
          margin-top: 1.25rem;
          text-align: start;
        }

        .pair-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.4rem;
          color: var(--text-primary, #e7e5e4);
        }

        .pair-input {
          width: 100%;
          padding: 0.75em 0.85em;
          border: 1px solid var(--border-default, #44403c);
          border-radius: 6px;
          background: var(--bg-primary, #1c1917);
          color: var(--text-primary, #e7e5e4);
          font-family: 'Heebo', sans-serif;
          font-size: 1rem;
          outline: none;
          transition: border-color 0.15s ease;
          box-sizing: border-box;
        }

        .pair-input:focus {
          border-color: var(--accent-primary, #d97706);
        }

        .pair-btn {
          margin-top: 1rem;
          width: 100%;
          background: var(--accent-primary, #d97706);
          color: var(--text-inverse, #1c1917);
          font-weight: 700;
          font-size: 0.9rem;
          letter-spacing: 0.02em;
          padding: 0.85em 2em;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-family: 'Heebo', sans-serif;
          transition: background 0.15s ease;
        }

        .pair-btn:hover:not(:disabled) {
          background: var(--accent-hover, #c2410c);
        }

        .pair-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .icon-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }

        .icon-success {
          background: rgba(22, 163, 74, 0.15);
          color: var(--status-success, #16a34a);
        }

        .icon-error {
          background: rgba(220, 38, 38, 0.15);
          color: var(--status-urgent, #dc2626);
        }

        .icon-info {
          background: rgba(37, 99, 235, 0.15);
          color: var(--status-info, #2563eb);
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border-default, #44403c);
          border-top-color: var(--accent-primary, #d97706);
          border-radius: 50%;
          margin: 0 auto 1rem auto;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </>
  );
}

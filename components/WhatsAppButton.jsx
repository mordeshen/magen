import { useState, useEffect, useCallback } from "react";
import { useUser } from "../lib/UserContext";
import { supabase } from "../lib/supabase";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "18667186816";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("היי מגן!")}`;

export default function WhatsAppButton() {
  const { user, signInWithGoogle } = useUser();
  const [open, setOpen] = useState(false);
  const [hasPulsed, setHasPulsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHasPulsed(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Allow external triggers (sidebar icon)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-whatsapp-modal", handler);
    return () => window.removeEventListener("open-whatsapp-modal", handler);
  }, []);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) setOpen(false);
  }, []);

  const handleGoogleAuth = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: "google" });
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <>
      {/* Floating Button */}
      <button
        className={`wa-fab ${!hasPulsed ? "wa-fab--pulse" : ""}`}
        onClick={handleOpen}
        aria-label="פתח צ׳אט וואטסאפ"
        type="button"
      >
        <svg
          className="wa-fab__icon"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="#fff"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div className="wa-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="חיבור וואטסאפ">
          <div className="wa-modal">
            <button
              className="wa-modal__close"
              onClick={handleClose}
              aria-label="סגור"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12.5 3.5L3.5 12.5M3.5 3.5l9 9" stroke="var(--stone-400)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {user ? (
              /* ─── State 2: Logged in ─── */
              <div className="wa-modal__body">
                <div className="wa-modal__check">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="16" cy="16" r="16" fill="rgba(22,163,74,0.15)" />
                    <path d="M10 16.5l4 4 8-8" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="wa-modal__title">החשבון שלך מחובר!</h3>
                <p className="wa-modal__text">הבוט יכיר אותך.</p>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wa-modal__btn wa-modal__btn--wa"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span>פתח וואטסאפ</span>
                </a>
              </div>
            ) : (
              /* ─── State 1: Not logged in ─── */
              <div className="wa-modal__body">
                <h3 className="wa-modal__title">דבר איתנו בוואטסאפ</h3>
                <p className="wa-modal__text">
                  חבר את החשבון שלך כדי שנכיר אותך גם בוואטסאפ.
                  <br />
                  אפשר גם בלי — פשוט לדבר.
                </p>
                <button
                  className="wa-modal__btn wa-modal__btn--primary"
                  onClick={handleGoogleAuth}
                  type="button"
                >
                  התחבר עם Google
                </button>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wa-modal__btn wa-modal__btn--secondary"
                >
                  בלי חשבון, קח אותי לוואטסאפ
                </a>
                <p className="wa-modal__hint">אפשר תמיד לחבר את החשבון אח״כ</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        /* ─── Floating Action Button ─── */
        .wa-fab {
          position: fixed;
          bottom: clamp(1rem, 4vw, 1.5rem);
          inset-inline-start: clamp(1rem, 4vw, 1.5rem);
          z-index: 900;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #25D366;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform var(--duration-fast) var(--ease-out-quad),
                      box-shadow var(--duration-fast) var(--ease-out-quad);
        }
        .wa-fab:hover {
          transform: translateY(-2px);
        }
        .wa-fab:focus-visible {
          outline: 2px solid var(--copper-500);
          outline-offset: 2px;
        }
        .wa-fab:active {
          transform: translateY(0);
        }

        /* Pulse animation — only on first load */
        .wa-fab--pulse {
          animation: waPulse 2s var(--ease-out-expo) 0.5s 2;
        }
        @keyframes waPulse {
          0%   { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.5); }
          70%  { box-shadow: 0 0 0 14px rgba(37, 211, 102, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
        }

        /* ─── Overlay ─── */
        .wa-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: var(--bg-overlay);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          animation: waOverlayIn var(--duration-normal) var(--ease-out-expo);
        }
        @keyframes waOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ─── Modal ─── */
        .wa-modal {
          position: relative;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: 8px;
          width: 100%;
          max-width: 380px;
          padding: clamp(1.5rem, 3vw, 2.5rem);
          direction: rtl;
          font-family: 'Heebo', sans-serif;
          animation: fadeSlideUp var(--duration-slow) var(--ease-out-expo);
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ─── Close button — top-left for RTL ─── */
        .wa-modal__close {
          position: absolute;
          top: 0.75rem;
          inset-inline-start: 0.75rem;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.4rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background var(--duration-fast) var(--ease-out-quad);
        }
        .wa-modal__close:hover {
          background: var(--bg-surface);
        }
        .wa-modal__close:focus-visible {
          outline: 2px solid var(--copper-500);
          outline-offset: 2px;
        }

        /* ─── Modal Body ─── */
        .wa-modal__body {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.75rem;
        }

        .wa-modal__check {
          margin-bottom: 0.25rem;
        }

        .wa-modal__title {
          font-weight: 700;
          font-size: clamp(1.25rem, 2.5vw, 1.5rem);
          line-height: 1.2;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          margin: 0;
        }

        .wa-modal__text {
          font-weight: 400;
          font-size: 0.95rem;
          line-height: 1.7;
          color: var(--text-secondary);
          margin: 0 0 0.5rem;
          max-width: 30ch;
        }

        /* ─── Buttons ─── */
        .wa-modal__btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          font-family: 'Heebo', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 0.85em 2em;
          border-radius: 6px;
          cursor: pointer;
          text-decoration: none;
          transition: background var(--duration-fast) var(--ease-out-quad),
                      border-color var(--duration-fast) var(--ease-out-quad);
        }
        .wa-modal__btn:focus-visible {
          outline: 2px solid var(--copper-500);
          outline-offset: 2px;
        }

        /* Primary — copper accent */
        .wa-modal__btn--primary {
          background: var(--accent-primary);
          color: var(--text-inverse);
          border: none;
        }
        .wa-modal__btn--primary:hover {
          background: var(--accent-hover);
        }

        /* Secondary — ghost */
        .wa-modal__btn--secondary {
          background: transparent;
          color: var(--text-primary);
          font-weight: 600;
          border: 1px solid var(--border-default);
        }
        .wa-modal__btn--secondary:hover {
          border-color: var(--text-primary);
        }

        /* WhatsApp green CTA */
        .wa-modal__btn--wa {
          background: #25D366;
          color: #fff;
          border: none;
          font-size: 1rem;
          padding: 1em 2em;
        }
        .wa-modal__btn--wa:hover {
          background: #1ebe57;
        }

        /* ─── Hint text ─── */
        .wa-modal__hint {
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          color: var(--text-muted);
          margin: 0.25rem 0 0;
        }

        /* ─── Reduced motion ─── */
        @media (prefers-reduced-motion: reduce) {
          .wa-fab--pulse,
          .wa-overlay,
          .wa-modal {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
          .wa-fab,
          .wa-modal__close,
          .wa-modal__btn {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </>
  );
}

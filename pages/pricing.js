import { useState, useEffect } from "react";
import Head from "next/head";
import { useUser } from "../lib/UserContext";

const PLAN_FEATURES = {
  free: [
    "שיחה עם 5 מומחים — עו\"ד, עו\"ס, פסיכולוג, ותיק ומגן",
    "בסיס ידע זכויות מלא",
    "זיכרון שיחות",
    "50K טוקנים ליום",
    "מודל: מגן בסיסי",
  ],
  one_time: [
    "הכל ב-חינם, ועוד:",
    "200K טוקנים (עד שנגמר)",
    "תיק משפטי אישי",
    "רקע רפואי + זיהוי פגיעות",
    "מודל: מגן מתקדם — תשובות מדויקות יותר",
  ],
  monthly: [
    "הכל בחד-פעמי, ועוד:",
    "שימוש ללא הגבלה — 30 ימים",
    "קבצים ותמונות (PDF, צילומים)",
    "✦ תשובה מעמיקה — המודל החזק ביותר, לחיצה אחת",
    "מודל: מגן מתקדם + גישה ל-Opus",
  ],
  premium: [
    "הכל בחודשי, ועוד:",
    "✦ תשובה מעמיקה בכל שאלה — ללא הגבלה",
    "Agent — ביצוע פעולות אוטומטי בפורטל",
    "עדיפות בתור",
    "מודל: Opus בלבד — הדיוק הגבוה ביותר",
  ],
};

const PLAN_LABELS = {
  free: "חינם",
  one_time: "חד-פעמי",
  monthly: "חודשי",
  premium: "פרימיום",
};

export default function PricingPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [justPurchased, setJustPurchased] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const { user, subscription, loadSubscription } = useUser();
  const currentPlan = user ? (subscription?.plan_id || "free") : null;

  useEffect(() => {
    fetch("/api/plans")
      .then(r => r.json())
      .then(data => { setPlans(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Detect payment=success and reload subscription
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("payment=success")) {
      window.history.replaceState(null, "", window.location.pathname);
      setJustPurchased(true);
      if (loadSubscription) loadSubscription();
      setTimeout(() => setJustPurchased(false), 4000);
    }
  }, []);

  async function handleUpgrade(planId) {
    if (!user) {
      const { supabase } = await import("../lib/supabase");
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/pricing", queryParams: { prompt: "select_account" } },
      });
      return;
    }

    setCheckoutLoading(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.paymentUrl) {
        window.location.href = d.paymentUrl;
        return; // keep loading until redirect
      }
      alert("שגיאה ביצירת התשלום. נסה שוב.");
    } catch {
      alert("שגיאה בחיבור לשרת.");
    }
    setCheckoutLoading(false);
  }

  return (
    <>
      <Head>
        <title>מסלולים ומחירים — מגן</title>
        <meta name="description" content="מסלולי שימוש בפלטפורמת מגן — יועץ AI לזכויות פצועי צה״ל" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;900&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet" />
      </Head>

      <div className="pricing-page" dir="rtl">
        {checkoutLoading && (
          <div className="checkout-overlay">
            <div className="checkout-loader">
              <div className="checkout-spinner" />
              <p>מעביר לדף תשלום מאובטח...</p>
            </div>
          </div>
        )}
        <nav className="pricing-nav">
          <a href="/" className="pricing-nav-logo">מגן</a>
          {user && subscription && (
            <div className={`nav-tokens${justPurchased ? " tokens-pop" : ""}`}>
              <span className="nav-tokens-label">טוקנים</span>
              <span className="nav-tokens-value">
                {subscription.unlimited
                  ? "ללא הגבלה"
                  : subscription.remaining >= 0
                    ? `${Math.round(subscription.remaining / 1000)}K`
                    : "—"}
              </span>
              {currentPlan && currentPlan !== "free" && (
                <span className="nav-tokens-plan">{PLAN_LABELS[currentPlan]}</span>
              )}
            </div>
          )}
        </nav>

        <header className="pricing-hero">
          <span className="section-tag">מסלולים</span>
          <h1 className="pricing-h1">
            בחר את המסלול<br />שמתאים לך
          </h1>
          <p className="pricing-subtitle">
            כל המסלולים כוללים גישה ל-3 מומחים — עו״ד, עו״ס ופסיכולוג.<br />
            המידע שלך פרטי לחלוטין. ללא שמירת מידע אישי.
          </p>
          <a href="#transparency" className="pricing-cost-note">
            <span className="cost-note-title">למה זה עולה כסף? אין פה רווחים.</span>
            <span className="cost-note-sub">גללו למטה להסבר המלא</span>
          </a>
        </header>

        <section className="pricing-cards-section">
          <div className="pricing-cards">
            {(loading ? [null, null, null, null] : plans).map((plan, i) => {
              const id = plan?.id || ["free", "one_time", "monthly", "premium"][i];
              const isCurrent = id === currentPlan;
              const isFeatured = id === "monthly";
              const price = plan?.price ?? 0;
              const features = PLAN_FEATURES[id] || [];

              return (
                <article
                  key={id}
                  className={`p-card${isFeatured ? " p-card-featured" : ""}${isCurrent ? " p-card-current" : ""}`}
                >
                  {isFeatured && <div className="p-card-badge">הכי פופולרי</div>}
                  <div className="p-card-header">
                    <h2 className="p-card-name">{plan?.name || PLAN_LABELS[id]}</h2>
                    <div className="p-card-price">
                      {price === 0 ? (
                        <span className="p-price-amount">0₪</span>
                      ) : (
                        <>
                          <span className="p-price-amount">{price / 100}₪</span>
                          {plan?.period_days ? <span className="p-price-period">/חודש</span> : <span className="p-price-period">חד-פעמי</span>}
                        </>
                      )}
                    </div>
                  </div>

                  <ul className="p-card-features">
                    {features.map((f, fi) => (
                      <li key={fi} className={fi === 0 && id !== "free" ? "p-feature-inherit" : ""}>
                        {fi === 0 && id !== "free" ? f : <><span className="p-check">✓</span>{f}</>}
                      </li>
                    ))}
                  </ul>

                  <div className="p-card-footer">
                    {isCurrent ? (
                      <button className="p-btn p-btn-current" disabled>המסלול שלך</button>
                    ) : id === "free" ? (
                      <a href="/" className="p-btn p-btn-secondary">התחל בחינם</a>
                    ) : (
                      <button className="p-btn p-btn-primary" onClick={() => handleUpgrade(id)}>
                        {user ? "שדרג עכשיו" : "התחבר ושדרג"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="pricing-transparency" id="transparency">
          <div className="transparency-box">
            <h3>למה זה עולה כסף?</h3>
            <p>כל תשובה עוברת דרך שרתי AI שעולים כסף אמיתי. ככל שהמודל חכם יותר — העלות גבוהה יותר.<br />אין פה רווחים — הכל חוזר לתחזוקה, שיפור, וקידום מול משרד הביטחון.<br />המסלול החינמי פתוח תמיד ונותן תשובות טובות.<br />התשלום מאפשר גישה למודלים חזקים יותר — ולמגן להמשיך לפעול.</p>
          </div>
        </section>

        <section className="pricing-faq">
          <h2 className="pricing-faq-title">שאלות נפוצות</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>מה קורה כשנגמרים הטוקנים?</h3>
              <p>במסלול חינם — מתאפסים למחרת. בחד-פעמי — אפשר לקנות עוד. בחודשי — אין הגבלה.</p>
            </div>
            <div className="faq-item">
              <h3>האם המידע שלי נשמר?</h3>
              <p>זיכרון השיחות נשמר מוצפן ונגיש רק לך. אנחנו לא שומרים מידע אישי ולא חולקים עם צד שלישי.</p>
            </div>
            <div className="faq-item">
              <h3>אפשר לבטל?</h3>
              <p>מסלול חודשי לא מתחדש אוטומטית. בסוף 30 הימים חוזרים לחינם ואפשר לחדש מתי שרוצים.</p>
            </div>
            <div className="faq-item">
              <h3>מה ההבדל בין המודלים?</h3>
              <p>בחינם — מודל מגן בסיסי שמכיר זכויות ונותן תשובות טובות. במסלולים בתשלום — מודל מתקדם יותר עם הבנה עמוקה. מחודשי ומעלה — גישה ל-Opus, המודל החכם ביותר בעולם, שנותן תשובות מדויקות ומפורטות במיוחד.</p>
            </div>
          </div>
        </section>

        <footer className="pricing-footer">
          <a href="/">חזרה לאתר מגן</a>
          {user && (
            <button className="test-payment-btn" onClick={() => handleUpgrade("test")}>
              בדיקת תשלום (0.50₪)
            </button>
          )}
        </footer>
      </div>

      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
          --stone-950: #0c0a09;
          --stone-900: #1c1917;
          --stone-800: #292524;
          --stone-700: #44403c;
          --stone-600: #57534e;
          --stone-400: #a8a29e;
          --stone-300: #d6d3d1;
          --stone-200: #e7e5e4;
          --stone-50:  #fafaf9;
          --copper-600: #c2410c;
          --copper-500: #d97706;
          --copper-400: #e09f3e;
          --copper-100: #fef3c7;
          --status-success: #16a34a;
          --olive-700: #4a5c3e;
          --border-default: var(--stone-700);
          --border-subtle: rgba(68, 64, 60, 0.5);
          --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
          --ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
          --duration-fast: 0.15s;
          --duration-slow: 0.6s;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }

        body {
          font-family: 'Heebo', sans-serif;
          background: var(--stone-950);
          color: var(--stone-200);
          line-height: 1.7;
          -webkit-font-smoothing: antialiased;
        }

        .pricing-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* ── Nav ── */
        .pricing-nav {
          padding: 20px clamp(1rem, 4vw, 3rem);
          border-bottom: 1px solid var(--border-subtle);
        }
        .pricing-nav-logo {
          font-weight: 900;
          font-size: 1.5rem;
          color: var(--stone-50);
          text-decoration: none;
          letter-spacing: -0.03em;
        }
        .pricing-nav-logo:hover { color: var(--copper-500); }

        .pricing-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .nav-tokens {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          font-size: 0.8rem;
          transition: all 0.3s ease;
        }
        .nav-tokens-label { color: var(--stone-400); }
        .nav-tokens-value {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 500;
          color: var(--stone-50);
          font-size: 0.95rem;
        }
        .nav-tokens-plan {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--copper-500);
          padding: 2px 8px;
          border: 1px solid var(--copper-500);
          border-radius: 3px;
        }
        .tokens-pop {
          border-color: var(--status-success);
          animation: tokenPulse 0.6s ease-out;
        }
        .tokens-pop .nav-tokens-value {
          color: var(--status-success);
        }
        @keyframes tokenPulse {
          0% { transform: scale(1); }
          30% { transform: scale(1.08); border-color: var(--status-success); }
          100% { transform: scale(1); }
        }

        /* ── Cost Note ── */
        .pricing-cost-note {
          display: inline-block;
          margin-top: 1.5rem;
          text-decoration: none;
          padding: 10px 20px;
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          transition: border-color var(--duration-fast) var(--ease-out-quad);
        }
        .pricing-cost-note:hover { border-color: var(--copper-500); }
        .cost-note-title {
          display: block;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--stone-200);
        }
        .cost-note-sub {
          display: block;
          font-size: 0.75rem;
          color: var(--stone-400);
          margin-top: 2px;
        }

        /* ── Hero ── */
        .pricing-hero {
          text-align: center;
          padding: clamp(3rem, 8vw, 6rem) clamp(1rem, 4vw, 3rem) clamp(2rem, 4vw, 3rem);
        }
        .section-tag {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          color: var(--copper-500);
          margin-bottom: 0.75rem;
          display: block;
        }
        .pricing-h1 {
          font-weight: 900;
          font-size: clamp(2rem, 5vw, 3.5rem);
          line-height: 1.1;
          letter-spacing: -0.03em;
          color: var(--stone-50);
          margin-bottom: 1.25rem;
        }
        .pricing-subtitle {
          font-size: 1rem;
          color: var(--stone-400);
          max-width: 480px;
          margin: 0 auto;
          line-height: 1.8;
        }

        /* ── Cards Section ── */
        .pricing-cards-section {
          padding: 0 clamp(1rem, 4vw, 4rem) clamp(3rem, 6vw, 5rem);
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
        }
        .pricing-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: clamp(12px, 2vw, 24px);
          align-items: stretch;
        }

        /* ── Single Card ── */
        .p-card {
          background: var(--stone-900);
          border: 1px solid var(--border-default);
          border-radius: 8px;
          padding: clamp(1.5rem, 2vw, 2rem) clamp(1.25rem, 2vw, 1.5rem);
          display: flex;
          flex-direction: column;
          position: relative;
          transition: transform var(--duration-fast) var(--ease-out-quad),
                      border-color var(--duration-fast) var(--ease-out-quad);
        }
        .p-card:hover {
          transform: translateY(-2px);
          border-color: var(--stone-600);
        }
        .p-card-featured {
          border-color: var(--copper-500);
          background: linear-gradient(180deg, var(--stone-900) 0%, rgba(217,119,6,0.04) 100%);
        }
        .p-card-featured:hover {
          border-color: var(--copper-400);
        }
        .p-card-current {
          border-color: var(--status-success);
        }

        .p-card-badge {
          position: absolute;
          top: -11px;
          inset-inline-start: 50%;
          transform: translateX(50%);
          background: var(--copper-500);
          color: var(--stone-950);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 3px 14px;
          border-radius: 3px;
          white-space: nowrap;
        }

        .p-card-header {
          text-align: center;
          margin-bottom: 1.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-subtle);
        }
        .p-card-name {
          font-weight: 700;
          font-size: 1.25rem;
          color: var(--stone-50);
          letter-spacing: -0.02em;
          margin-bottom: 0.75rem;
        }
        .p-price-amount {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 500;
          font-size: 2.25rem;
          color: var(--stone-50);
          letter-spacing: -0.03em;
        }
        .p-price-period {
          font-size: 0.875rem;
          color: var(--stone-400);
          margin-inline-start: 4px;
        }

        /* ── Features ── */
        .p-card-features {
          list-style: none;
          flex: 1;
          margin-bottom: 1.5rem;
        }
        .p-card-features li {
          font-size: 0.875rem;
          color: var(--stone-300);
          padding: 6px 0;
          display: flex;
          align-items: baseline;
          gap: 8px;
          line-height: 1.5;
        }
        .p-check {
          color: var(--status-success);
          font-weight: 700;
          font-size: 0.8rem;
          flex-shrink: 0;
        }
        .p-feature-inherit {
          color: var(--stone-400) !important;
          font-size: 0.8rem !important;
          font-style: italic;
          margin-bottom: 4px;
        }

        /* ── Buttons ── */
        .p-card-footer { margin-top: auto; }

        .p-btn {
          display: block;
          width: 100%;
          padding: 12px;
          border-radius: 6px;
          font-family: 'Heebo', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          transition: background var(--duration-fast) var(--ease-out-quad),
                      border-color var(--duration-fast) var(--ease-out-quad);
        }
        .p-btn-primary {
          background: var(--copper-500);
          color: var(--stone-950);
          border: none;
        }
        .p-btn-primary:hover { background: var(--copper-600); }

        .p-btn-secondary {
          background: transparent;
          color: var(--stone-200);
          border: 1px solid var(--border-default);
        }
        .p-btn-secondary:hover { border-color: var(--stone-200); }

        .p-btn-current {
          background: transparent;
          border: 1px solid var(--status-success);
          color: var(--status-success);
          cursor: default;
        }

        /* ── Transparency ── */
        .pricing-transparency {
          max-width: 680px;
          margin: 0 auto;
          padding: clamp(2rem, 4vw, 3rem) clamp(1rem, 4vw, 3rem) 0;
        }
        .transparency-box {
          background: var(--stone-900);
          border: 1px solid var(--border-subtle);
          border-inline-start: 3px solid var(--copper-500);
          border-radius: 8px;
          padding: clamp(1.25rem, 2vw, 2rem);
        }
        .transparency-box h3 {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--stone-50);
          margin-bottom: 0.75rem;
          letter-spacing: -0.01em;
        }
        .transparency-box p {
          font-size: 0.9rem;
          color: var(--stone-400);
          line-height: 1.8;
          margin-bottom: 0.5rem;
        }
        .transparency-box p:last-child { margin-bottom: 0; }

        /* ── FAQ ── */
        .pricing-faq {
          max-width: 800px;
          margin: 0 auto;
          padding: clamp(3rem, 6vw, 5rem) clamp(1rem, 4vw, 3rem);
          border-top: 1px solid var(--border-subtle);
        }
        .pricing-faq-title {
          font-weight: 700;
          font-size: 1.5rem;
          color: var(--stone-50);
          letter-spacing: -0.02em;
          margin-bottom: 2rem;
          text-align: center;
        }
        .faq-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .faq-item h3 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--stone-200);
          margin-bottom: 6px;
        }
        .faq-item p {
          font-size: 0.875rem;
          color: var(--stone-400);
          line-height: 1.7;
        }

        /* ── Footer ── */
        .pricing-footer {
          text-align: center;
          padding: 2rem;
          border-top: 1px solid var(--border-subtle);
          margin-top: auto;
        }
        .pricing-footer a {
          color: var(--stone-400);
          text-decoration: none;
          font-size: 0.875rem;
        }
        .pricing-footer a:hover { color: var(--copper-500); }
        .test-payment-btn {
          display: inline-block;
          margin-top: 12px;
          padding: 6px 16px;
          font-family: 'Heebo', sans-serif;
          font-size: 0.7rem;
          color: var(--stone-600);
          background: transparent;
          border: 1px dashed var(--stone-700);
          border-radius: 4px;
          cursor: pointer;
          transition: border-color var(--duration-fast) var(--ease-out-quad);
        }
        .test-payment-btn:hover { border-color: var(--stone-400); color: var(--stone-400); }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .pricing-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 560px) {
          .pricing-cards {
            grid-template-columns: 1fr;
            max-width: 340px;
            margin: 0 auto;
          }
          .faq-grid {
            grid-template-columns: 1fr;
          }
        }

        /* ── Checkout Loading ── */
        .checkout-overlay {
          position: fixed;
          inset: 0;
          background: rgba(12, 10, 9, 0.85);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .checkout-loader {
          text-align: center;
        }
        .checkout-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--stone-700);
          border-top-color: var(--copper-500);
          border-radius: 50%;
          margin: 0 auto 20px;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .checkout-loader p {
          color: var(--stone-300);
          font-size: 1rem;
          font-weight: 500;
        }

        *:focus-visible {
          outline: 2px solid var(--copper-500);
          outline-offset: 2px;
        }
      `}</style>
    </>
  );
}

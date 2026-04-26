import { useState } from "react";

const PORTAL_BASE = "https://myshikum.mod.gov.il";

const TASKS = [
  {
    id: "medical-referral",
    label: "הפניה רפואית חדשה",
    desc: "פתיחת הפניה לטיפול או בדיקה",
    portalPath: "/medical-referrals/new",
    agentTask: "הפניה רפואית חדשה",
    steps: [
      "התחבר לאתר אגף השיקום עם ת.ז. + קוד חד-פעמי",
      "בדף הראשי, לחץ על \"הפניות רפואיות\"",
      "לחץ על \"הפניה חדשה\"",
      "מלא את פרטי ההפניה: סוג טיפול, תיאור, רופא מפנה",
      "צרף מסמכים רפואיים אם יש",
      "לחץ \"שלח\"",
    ],
    docs: ["הפניה מרופא מטפל (אם יש)", "תוצאות בדיקות אחרונות"],
  },
  {
    id: "submit-request",
    label: "הגשת פנייה לאגף",
    desc: "פנייה כללית לאגף השיקום",
    portalPath: "/requests/new",
    agentTask: "הגשת פנייה לאגף השיקום",
    steps: [
      "התחבר לאתר אגף השיקום",
      "לחץ על \"הגשת פנייה לאגף\"",
      "בחר קטגוריה (טיפול רפואי, ציוד, החזר הוצאות...)",
      "מלא את פרטי הפנייה ותיאור הבקשה",
      "צרף מסמכים רלוונטיים",
      "לחץ \"שלח\" ושמור את מספר הפנייה",
    ],
    docs: ["מסמכים תומכים לפי סוג הפנייה"],
  },
  {
    id: "appeal",
    label: "ערעור על אחוזי נכות",
    desc: "הגשת ערעור על החלטת ועדה",
    portalPath: "/requests/new",
    agentTask: "ערעור על אחוזי נכות",
    steps: [
      "התחבר לאתר אגף השיקום",
      "לחץ על \"הגשת פנייה לאגף\" → \"הכרה בנכות\"",
      "בחר \"ערעור על החלטת ועדה\"",
      "פרט את סיבת הערעור ואת השינוי במצב",
      "צרף חוות דעת רפואית עדכנית + מסמכים תומכים",
      "שלח — יש 45 יום מיום ההחלטה להגיש ערעור",
    ],
    docs: ["חוות דעת רפואית עדכנית", "פרוטוקול הוועדה", "מסמכים רפואיים נוספים"],
    tip: "מומלץ מאוד עם ייצוג משפטי — ארגון נכי צה\"ל מציע ייצוג חינם",
  },
  {
    id: "expense-refund",
    label: "החזר הוצאות",
    desc: "העלאת קבלות ואישורים להחזר",
    portalPath: "/requests/new",
    agentTask: "בקשה להחזר הוצאות",
    steps: [
      "התחבר לאתר אגף השיקום",
      "לחץ על \"הגשת פנייה לאגף\" → \"החזר הוצאות\"",
      "בחר סוג ההוצאה (נסיעות, תרופות, ציוד...)",
      "מלא פרטים ותאריכים",
      "צרף קבלות מקוריות (סרוקות או צילום ברור)",
      "שלח ושמור מספר פנייה",
    ],
    docs: ["קבלות מקוריות", "אישור טיפול/בדיקה (לנסיעות)"],
  },
  {
    id: "vehicle",
    label: "רכב רפואי",
    desc: "פנייה בנושא רכב רפואי / ניידות",
    portalPath: "/requests/new",
    agentTask: "הגשת בקשה לרכב רפואי",
    steps: [
      "התחבר לאתר אגף השיקום",
      "לחץ על \"הגשת פנייה לאגף\" → \"רכב\"",
      "בחר סוג בקשה (רכב חדש, החלפה, תחזוקה...)",
      "מלא את הפרטים הנדרשים",
      "צרף מסמכים רלוונטיים",
      "שלח",
    ],
    docs: ["רישיון נהיגה", "חוות דעת רפואית (לרכב חדש)"],
  },
  {
    id: "update-details",
    label: "עדכון פרטים אישיים",
    desc: "שינוי כתובת, טלפון, חשבון בנק",
    portalPath: "/profile",
    agentTask: "עדכון פרטים אישיים",
    steps: [
      "התחבר לאתר אגף השיקום",
      "לחץ על \"הפרטים שלך\" (בסרגל העליון)",
      "עדכן את הפרטים הרלוונטיים",
      "שמור",
    ],
    docs: [],
  },
];

export default function AgentChoiceModal({ onClose, onChooseAgent, onChooseGuided, initialTaskId }) {
  const [selectedTask, setSelectedTask] = useState(initialTaskId ? TASKS.find(t => t.id === initialTaskId) : null);
  const [showSteps, setShowSteps] = useState(false);

  if (!selectedTask) {
    return (
      <div className="acm-overlay" dir="rtl">
        <div className="acm-container">
          <div className="acm-header">
            <h3>מה תרצה לעשות באתר אגף השיקום?</h3>
            <button className="acm-close" onClick={onClose} aria-label="סגור">✕</button>
          </div>
          <div className="acm-tasks">
            {TASKS.map(t => (
              <button key={t.id} className="acm-task" onClick={() => setSelectedTask(t)}>
                <span className="acm-task-label">{t.label}</span>
                <span className="acm-task-desc">{t.desc}</span>
              </button>
            ))}
          </div>
          <style jsx>{styles}</style>
        </div>
      </div>
    );
  }

  if (showSteps) {
    return (
      <div className="acm-overlay" dir="rtl">
        <div className="acm-container">
          <div className="acm-header">
            <button className="acm-back" onClick={() => setShowSteps(false)} aria-label="חזור">&#8594;</button>
            <h3>{selectedTask.label} — הנחיות</h3>
            <button className="acm-close" onClick={onClose} aria-label="סגור">✕</button>
          </div>
          <div className="acm-steps">
            <div className="acm-steps-list">
              {selectedTask.steps.map((s, i) => (
                <div key={i} className="acm-step">
                  <span className="acm-step-num">{i + 1}</span>
                  <span className="acm-step-text">{s}</span>
                </div>
              ))}
            </div>
            {selectedTask.docs?.length > 0 && (
              <div className="acm-docs">
                <div className="acm-docs-title">מסמכים להכין מראש:</div>
                {selectedTask.docs.map((d, i) => (
                  <div key={i} className="acm-doc">{d}</div>
                ))}
              </div>
            )}
            {selectedTask.tip && (
              <div className="acm-tip">{selectedTask.tip}</div>
            )}
            <a
              href={PORTAL_BASE}
              target="_blank"
              rel="noopener noreferrer"
              className="acm-btn acm-btn-primary"
              onClick={onClose}
            >
              פתח את אתר אגף השיקום
            </a>
            <button className="acm-btn acm-btn-secondary" onClick={() => { setShowSteps(false); }}>
              חזרה
            </button>
          </div>
          <style jsx>{styles}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="acm-overlay" dir="rtl">
      <div className="acm-container">
        <div className="acm-header">
          <button className="acm-back" onClick={() => setSelectedTask(null)} aria-label="חזור">&#8594;</button>
          <h3>{selectedTask.label}</h3>
          <button className="acm-close" onClick={onClose} aria-label="סגור">✕</button>
        </div>
        <div className="acm-choices">
          <p className="acm-subtitle">איך תעדיף לבצע?</p>

          <button className="acm-choice" onClick={() => setShowSteps(true)}>
            <div className="acm-choice-icon">&#x1F4CB;</div>
            <div className="acm-choice-content">
              <div className="acm-choice-title">עצמאי עם הנחיית מגן</div>
              <div className="acm-choice-desc">
                אתה נכנס לאתר אגף השיקום בעצמך.
                מגן נותן לך הנחיות צעד-אחר-צעד + רשימת מסמכים + טיפים.
              </div>
              <div className="acm-choice-tag">מהיר ופשוט</div>
            </div>
          </button>

          <button className="acm-choice" onClick={() => { onChooseAgent(selectedTask.agentTask); onClose(); }}>
            <div className="acm-choice-icon">&#x1F916;</div>
            <div className="acm-choice-content">
              <div className="acm-choice-title">סוכן אוטומטי</div>
              <div className="acm-choice-desc">
                מגן פותח את האתר, מתחבר בשבילך,
                ומבצע את הפעולה. אתה רק מאשר.
              </div>
              <div className="acm-choice-tag">בטא — דורש התחברות</div>
            </div>
          </button>
        </div>
        <style jsx>{styles}</style>
      </div>
    </div>
  );
}

const styles = `
  .acm-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(12,10,9,0.85);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    font-family: 'Heebo', sans-serif;
  }
  .acm-container {
    background: var(--stone-900, #1c1917);
    border: 1px solid var(--stone-700, #44403c);
    border-radius: 16px;
    width: 100%; max-width: 520px;
    max-height: 90vh; overflow-y: auto;
    color: var(--text-primary, #e7e5e4);
  }
  .acm-header {
    display: flex; align-items: center; gap: 10px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--stone-700, #44403c);
  }
  .acm-header h3 { margin: 0; font-size: 16px; font-weight: 700; flex: 1; }
  .acm-close, .acm-back {
    background: none; border: none; color: var(--stone-400, #a8a29e);
    font-size: 18px; cursor: pointer; padding: 4px 8px;
  }
  .acm-close:hover, .acm-back:hover { color: var(--text-primary); }

  .acm-tasks { padding: 12px; display: flex; flex-direction: column; gap: 6px; }
  .acm-task {
    display: flex; flex-direction: column; gap: 2px;
    padding: 12px 16px; border-radius: 10px;
    border: 1px solid var(--stone-700, #44403c);
    background: var(--stone-800, #292524);
    cursor: pointer; text-align: right;
    font-family: 'Heebo', sans-serif;
    transition: border-color 0.15s;
  }
  .acm-task:hover { border-color: var(--copper-500, #d97706); }
  .acm-task-label { font-size: 14px; font-weight: 700; color: var(--text-primary); }
  .acm-task-desc { font-size: 12px; color: var(--stone-400); }

  .acm-choices { padding: 20px; }
  .acm-subtitle { font-size: 14px; color: var(--stone-400); margin: 0 0 14px; text-align: center; }

  .acm-choice {
    display: flex; gap: 14px; padding: 16px;
    border-radius: 12px; border: 1px solid var(--stone-700, #44403c);
    background: var(--stone-800, #292524);
    cursor: pointer; text-align: right; width: 100%;
    font-family: 'Heebo', sans-serif;
    margin-bottom: 10px; transition: border-color 0.15s;
    align-items: flex-start;
  }
  .acm-choice:hover { border-color: var(--copper-500, #d97706); }
  .acm-choice-icon { font-size: 28px; flex-shrink: 0; margin-top: 2px; }
  .acm-choice-content { flex: 1; }
  .acm-choice-title { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .acm-choice-desc { font-size: 12px; color: var(--stone-400); line-height: 1.6; }
  .acm-choice-tag {
    display: inline-block; margin-top: 8px;
    font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 6px;
    background: rgba(217,119,6,0.1); color: var(--copper-400, #e09f3e);
  }

  .acm-steps { padding: 20px; }
  .acm-steps-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .acm-step {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 10px 12px; border-radius: 8px;
    background: rgba(255,255,255,0.03);
    border-inline-start: 3px solid var(--copper-500, #d97706);
  }
  .acm-step-num {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--copper-500, #d97706); color: var(--stone-950, #0c0a09);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800; flex-shrink: 0;
  }
  .acm-step-text { font-size: 13px; line-height: 1.6; }

  .acm-docs {
    background: rgba(255,255,255,0.03); border-radius: 8px;
    padding: 12px; margin-bottom: 12px;
  }
  .acm-docs-title { font-size: 12px; font-weight: 700; color: var(--copper-400); margin-bottom: 6px; }
  .acm-doc {
    font-size: 12px; color: var(--stone-300); padding: 3px 0;
    padding-inline-start: 14px; position: relative;
  }
  .acm-doc::before {
    content: "•"; position: absolute; inset-inline-start: 0; color: var(--copper-500);
  }

  .acm-tip {
    font-size: 12px; color: #5a6f4a; line-height: 1.6;
    background: rgba(90,111,74,0.1); border-radius: 8px;
    padding: 10px 12px; margin-bottom: 12px;
    border-inline-start: 3px solid #5a6f4a;
  }

  .acm-btn {
    display: block; width: 100%; padding: 12px;
    border-radius: 10px; border: none;
    font-family: 'Heebo', sans-serif;
    font-size: 14px; font-weight: 700;
    cursor: pointer; text-align: center;
    text-decoration: none; margin-bottom: 8px;
    transition: background 0.15s;
  }
  .acm-btn-primary {
    background: var(--copper-500, #d97706);
    color: var(--stone-950, #0c0a09);
  }
  .acm-btn-primary:hover { background: var(--copper-600, #b45309); }
  .acm-btn-secondary {
    background: var(--stone-800, #292524);
    color: var(--stone-300);
    border: 1px solid var(--stone-700);
  }
  .acm-btn-secondary:hover { background: var(--stone-700); }

  @media (prefers-reduced-motion: reduce) {
    .acm-choice, .acm-task { transition: none; }
  }
`;

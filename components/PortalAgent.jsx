import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Category definitions ────────────────────────────────────
const CATEGORIES = [
  { id: "recognition",   label: "הכרה בנכות",          icon: "\u{1F3DB}\uFE0F" },
  { id: "medical",       label: "טיפול רפואי ובדיקות",  icon: "\u2764\uFE0F" },
  { id: "mental",        label: "טיפול נפשי",           icon: "\u{1F49C}" },
  { id: "equipment",     label: "ציוד רפואי",           icon: "\u{1F9BD}" },
  { id: "expenses",      label: "החזר הוצאות",          icon: "\u{1F4B0}" },
  { id: "vehicle",       label: "רכב",                  icon: "\u{1F697}" },
  { id: "benefits",      label: "תגמולים והטבות",       icon: "\u{1F4CB}" },
  { id: "rehab",         label: "שיקום ותעסוקה",        icon: "\u{1F4BC}" },
  { id: "prescriptions", label: "מרשמים ותרופות",       icon: "\u{1F48A}" },
  { id: "education",     label: "לימודים",              icon: "\u{1F4DA}" },
  { id: "housing",       label: "דיור ומגורים",         icon: "\u{1F3E0}" },
  { id: "personal",      label: "עדכון פרטים",          icon: "\u{1F4DD}" },
  { id: "certificates",  label: "אישורים ותעודות",      icon: "\u{1F4C4}" },
];

// ─── Field definitions per category ──────────────────────────
const CATEGORY_FIELDS = {
  recognition: {
    subcategories: [
      { value: "תביעה חדשה", label: "תביעה חדשה להכרה" },
      { value: "הוספת פגימה", label: "הוספת פגימה חדשה" },
      { value: "ערעור", label: "ערעור על החלטה / אחוזים" },
    ],
    fields: [
      { name: "requestType", label: "סוג בקשה", type: "select", options: ["תביעה חדשה", "הוספת פגימה", "ערעור"], required: true },
      { name: "unit", label: "יחידה צבאית", type: "text", placeholder: "למשל: גולני, 8200..." },
      { name: "injuryDesc", label: "תיאור הפגיעה", type: "textarea", placeholder: "תאר בקצרה את הפגיעה ואיך קרתה", required: true },
      { name: "committeeDate", label: "תאריך ועדה (לערעור)", type: "text", placeholder: "DD/MM/YYYY", showIf: { field: "requestType", value: "ערעור" } },
      { name: "currentPercent", label: "אחוזי נכות שנקבעו", type: "text", placeholder: "למשל: 20%", showIf: { field: "requestType", value: "ערעור" } },
      { name: "appealReason", label: "למה לא מסכים?", type: "textarea", placeholder: "הסבר קצר", showIf: { field: "requestType", value: "ערעור" } },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 הכרה בנכות",
    requiredDocs: ["תיק רפואי צבאי", "חוות דעת רפואית", "תצהיר"],
    optionalDocs: ["עדויות חברים לשירות", "פרופיל רפואי"],
    tips: ["מומלץ מאוד עם ייצוג \u2014 ארגון נכי צה\"ל נותן חינם", "יש 45 יום לערער!"],
    buildTemplate: (f) => {
      if (f.requestType === "ערעור") {
        return `שלום, אני מבקש לערער על החלטת הוועדה הרפואית${f.committeeDate ? " מתאריך " + f.committeeDate : ""}. ${f.currentPercent ? "אחוזי הנכות שנקבעו: " + f.currentPercent + "." : ""} ${f.appealReason || ""} מצורפים מסמכים רפואיים עדכניים. ת.ז. ${f.caseNumber || "___"}. תודה.`;
      }
      if (f.requestType === "הוספת פגימה") {
        return `שלום, אני מבקש להוסיף פגימה חדשה. הפגימה: ${f.injuryDesc || "[תיאור]"}. מצורפים מסמכים רפואיים. ת.ז. ${f.caseNumber || "___"}. תודה.`;
      }
      return `שלום, אני מגיש תביעה להכרה כנכה צה"ל.${f.unit ? " שירתתי ב" + f.unit + "." : ""} ${f.injuryDesc ? "במהלך/עקב השירות נפגעתי: " + f.injuryDesc + "." : ""} מצורפים מסמכים רפואיים ותצהיר. ת.ז. ${f.caseNumber || "___"}. תודה.`;
    },
  },
  medical: {
    fields: [
      { name: "treatmentType", label: "סוג טיפול/בדיקה", type: "select", options: ["הפניה לטיפול/בדיקה", "טיפול פרא-רפואי", "חוות דעת רפואית"], required: true },
      { name: "specialty", label: "תחום", type: "select", options: ["אורתופדיה", "נוירולוגיה", "פסיכיאטריה", "פיזיותרפיה", "ריפוי בעיסוק", "קלינאית תקשורת", "אחר"], required: true },
      { name: "doctorName", label: "שם רופא/מכון", type: "text", placeholder: "ד\"ר ישראלי / מכון X" },
      { name: "diagnosis", label: "אבחנה", type: "text", placeholder: "תיאור קצר של האבחנה" },
      { name: "hasReferral", label: "יש הפניה מרופא?", type: "select", options: ["כן", "לא"], required: true },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 טיפול רפואי ובדיקות",
    requiredDocs: ["הפניה/מרשם מרופא"],
    optionalDocs: ["סיכום רפואי אחרון"],
    tips: ["לצרף את ההפניה של הרופא \u2014 בלי זה לא יאשרו"],
    buildTemplate: (f) =>
      `שלום, אני מבקש אישור ל${f.treatmentType || "טיפול"} בתחום ${f.specialty || "[תחום]"}.${f.doctorName ? " אצל " + f.doctorName + "." : ""}${f.diagnosis ? " האבחנה: " + f.diagnosis + "." : ""} ${f.hasReferral === "כן" ? "מצורפת הפניה רפואית." : "אין לי הפניה כרגע."} ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  mental: {
    fields: [
      { name: "therapyType", label: "סוג טיפול", type: "select", options: ["פסיכולוגי", "פסיכיאטרי", "CBT", "EMDR", "המשך/חידוש סל"], required: true },
      { name: "therapistName", label: "שם מטפל (אם יש)", type: "text", placeholder: "שם המטפל" },
      { name: "therapistPhone", label: "טלפון מטפל", type: "text", placeholder: "050-..." },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 טיפול נפשי",
    requiredDocs: [],
    optionalDocs: ["המלצה ממטפל קודם", "סיכום מהמטפל הנוכחי"],
    tips: ["סל בריאות הנפש: 6,000 \u20AA \u2014 בוחר מטפל פרטי", "אפשר לקבל טיפול גם לפני הכרה רשמית!"],
    buildTemplate: (f) =>
      `שלום, אני מבקש אישור לטיפול ${f.therapyType || "נפשי"}.${f.therapistName ? " אצל " + f.therapistName + (f.therapistPhone ? ", טלפון " + f.therapistPhone : "") + "." : ""} אשמח למצות את סל בריאות הנפש. ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  equipment: {
    fields: [
      { name: "equipmentType", label: "סוג ציוד", type: "text", placeholder: "כסא גלגלים, מכשיר שמיעה, מזרן...", required: true },
      { name: "newOrReplace", label: "חדש או החלפה?", type: "select", options: ["ציוד חדש", "החלפה/תיקון"], required: true },
      { name: "hasDocRecommendation", label: "יש המלצת רופא?", type: "select", options: ["כן", "לא"], required: true },
      { name: "equipmentCondition", label: "מצב הציוד הישן (אם החלפה)", type: "text", placeholder: "תיאור קצר", showIf: { field: "newOrReplace", value: "החלפה/תיקון" } },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 ציוד רפואי",
    requiredDocs: ["מרשם/המלצת רופא"],
    optionalDocs: ["הצעת מחיר מספק", "תמונה של הציוד הישן"],
    tips: ["לבדוק מול הספק אם הוא מוכר ע\"י אגף השיקום"],
    buildTemplate: (f) => {
      if (f.newOrReplace === "החלפה/תיקון") {
        return `שלום, אני זקוק להחלפת ${f.equipmentType || "[ציוד]"}.${f.equipmentCondition ? " מצב נוכחי: " + f.equipmentCondition + "." : ""} ${f.hasDocRecommendation === "כן" ? "מצורפת המלצת רופא." : ""} ת.ז. ${f.caseNumber || "___"}. תודה.`;
      }
      return `שלום, אני זקוק ל${f.equipmentType || "[ציוד]"}. ${f.hasDocRecommendation === "כן" ? "מצורפת המלצת רופא." : "אין לי המלצת רופא כרגע."} ת.ז. ${f.caseNumber || "___"}. תודה.`;
    },
  },
  expenses: {
    fields: [
      { name: "expenseType", label: "סוג הוצאה", type: "select", options: ["הוצאות רפואיות", "נסיעות", "אחר"], required: true },
      { name: "amount", label: "סכום (בש\"ח)", type: "text", placeholder: "למשל: 350", required: true },
      { name: "expenseDate", label: "תאריך ההוצאה", type: "text", placeholder: "DD/MM/YYYY" },
      { name: "expenseDesc", label: "תיאור ההוצאה", type: "text", placeholder: "עבור מה היתה ההוצאה" },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 החזר הוצאות",
    requiredDocs: ["קבלות/חשבוניות מקוריות"],
    optionalDocs: [],
    tips: ["לשמור כל קבלה \u2014 גם נסיעות!"],
    buildTemplate: (f) =>
      `שלום, אני מבקש החזר הוצאות ${f.expenseType || ""} בסך ${f.amount || "___"} ש"ח.${f.expenseDate ? " מצורפות קבלות מתאריך " + f.expenseDate + "." : ""} ${f.expenseDesc ? "ההוצאה היתה עבור " + f.expenseDesc + "." : ""} ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  vehicle: {
    fields: [
      { name: "vehicleRequestType", label: "סוג בקשה", type: "select", options: ["רכב רפואי", "אביזרי רכב", "אישור תיקון"], required: true },
      { name: "disabilityPercent", label: "אחוזי נכות", type: "text", placeholder: "למשל: 50%" },
      { name: "disabilityType", label: "סוג הנכות", type: "text", placeholder: "רגליים, גב..." },
      { name: "repairDesc", label: "תיאור התקלה", type: "text", placeholder: "מה צריך לתקן?", showIf: { field: "vehicleRequestType", value: "אישור תיקון" } },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 רכב",
    requiredDocs: ["אישור רפואי", "רישיון נהיגה"],
    optionalDocs: ["הצעת מחיר (לתיקון)"],
    tips: ["רכב רפואי \u2014 מ-50% נכות ומעלה בד\"כ"],
    buildTemplate: (f) =>
      `שלום, אני מבקש ${f.vehicleRequestType || "[בקשה]"}.${f.disabilityPercent ? " אחוזי נכות: " + f.disabilityPercent + "." : ""}${f.disabilityType ? " סוג הנכות: " + f.disabilityType + "." : ""}${f.repairDesc ? " תיאור התקלה: " + f.repairDesc + "." : ""} ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  benefits: {
    fields: [
      { name: "benefitType", label: "סוג בקשה", type: "select", options: ["העלאת דרגת תגמול", "הטבה חד-פעמית", "מענק שנתי", "מענק חימום"], required: true },
      { name: "disabilityPercent", label: "אחוזי נכות", type: "text", placeholder: "למשל: 30%" },
      { name: "benefitReason", label: "סיבת הבקשה", type: "textarea", placeholder: "פרט בקצרה" },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 תגמולים והטבות",
    requiredDocs: [],
    optionalDocs: ["מסמכים תומכים לפי סוג הבקשה"],
    tips: ["מענק חימום \u2014 להגיש לפני החורף"],
    buildTemplate: (f) =>
      `שלום, אני מבקש ${f.benefitType || "[בקשה]"}.${f.disabilityPercent ? " אחוזי נכות: " + f.disabilityPercent + "." : ""} ${f.benefitReason ? "סיבת הבקשה: " + f.benefitReason + "." : ""} ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  rehab: {
    fields: [
      { name: "rehabType", label: "סוג בקשה", type: "select", options: ["ליווי תעסוקתי", "הכשרה מקצועית", "סיוע בהשמה"], required: true },
      { name: "fieldOfInterest", label: "תחום עניין / ניסיון", type: "text", placeholder: "תחום שמעניין אותך" },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 שיקום ותעסוקה",
    requiredDocs: [],
    optionalDocs: ["קורות חיים"],
    tips: [],
    buildTemplate: (f) =>
      `שלום, אני מעוניין ב${f.rehabType || "[בקשה]"}.${f.fieldOfInterest ? " רקע: " + f.fieldOfInterest + "." : ""} אשמח לקבל פגישת ייעוץ. ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  prescriptions: {
    fields: [
      { name: "prescriptionType", label: "סוג בקשה", type: "select", options: ["חידוש מרשם", "תרופה חדשה"], required: true },
      { name: "drugName", label: "שם התרופה", type: "text", placeholder: "שם התרופה", required: true },
      { name: "dosage", label: "מינון", type: "text", placeholder: "למשל: 20mg" },
      { name: "prescribingDoc", label: "רופא ממליץ", type: "text", placeholder: "ד\"ר..." },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 מרשמים ותרופות",
    requiredDocs: ["מרשם מרופא"],
    optionalDocs: [],
    tips: [],
    buildTemplate: (f) =>
      `שלום, אני מבקש ${f.prescriptionType || "חידוש מרשם"} ל${f.drugName || "[תרופה]"}.${f.dosage ? " מינון: " + f.dosage + "." : ""}${f.prescribingDoc ? " הומלצה ע\"י " + f.prescribingDoc + "." : ""} ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  education: {
    fields: [
      { name: "institution", label: "שם המוסד", type: "text", placeholder: "אוניברסיטה / מכללה / קורס", required: true },
      { name: "programName", label: "שם התואר/קורס", type: "text", placeholder: "מדעי המחשב, חשבונאות...", required: true },
      { name: "startDate", label: "תחילת לימודים", type: "text", placeholder: "MM/YYYY" },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 לימודים",
    requiredDocs: ["אישור קבלה מהמוסד"],
    optionalDocs: ["תכנית לימודים", "גיליון ציונים"],
    tips: ["לשמור קבלות על ספרים \u2014 אפשר לקבל החזר"],
    buildTemplate: (f) =>
      `שלום, אני מבקש מימון לימודים ב${f.institution || "[מוסד]"} בתחום ${f.programName || "[תואר/קורס]"}.${f.startDate ? " תחילת לימודים: " + f.startDate + "." : ""} מצורף אישור קבלה. ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  housing: {
    fields: [
      { name: "housingType", label: "סוג בקשה", type: "select", options: ["סיוע בדיור", "שיפוץ והתאמת דירה", "סיוע במעבר"], required: true },
      { name: "disabilityPercent", label: "אחוזי נכות", type: "text", placeholder: "למשל: 40%" },
      { name: "disabilityType", label: "סוג הנכות", type: "text", placeholder: "תיאור קצר" },
      { name: "adaptations", label: "התאמות נדרשות", type: "text", placeholder: "מקלחת, רמפה, מעלון...", showIf: { field: "housingType", value: "שיפוץ והתאמת דירה" } },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 דיור ומגורים",
    requiredDocs: ["חוזה שכירות/בעלות"],
    optionalDocs: ["המלצה רפואית", "הצעת מחיר (לשיפוץ)"],
    tips: ["התאמות דירה \u2014 לא לבצע לפני אישור!"],
    buildTemplate: (f) =>
      `שלום, אני מבקש ${f.housingType || "[בקשה]"}.${f.disabilityPercent ? " אחוזי נכות: " + f.disabilityPercent + "." : ""}${f.disabilityType ? " סוג הנכות: " + f.disabilityType + "." : ""}${f.adaptations ? " נדרשת התאמה של: " + f.adaptations + "." : ""} ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  personal: {
    fields: [
      { name: "updateField", label: "מה לעדכן?", type: "select", options: ["כתובת", "מספר טלפון", "פרטי חשבון בנק", "מצב משפחתי"], required: true },
      { name: "newValue", label: "הפרט החדש", type: "text", placeholder: "הערך המעודכן", required: true },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 עדכון פרטים אישיים",
    requiredDocs: [],
    optionalDocs: ["אישור מתאים (חוזה שכירות/אישור בנק/תעודת נישואין)"],
    tips: ["אם הטלפון/מייל לא מעודכנים \u2014 קודם להתקשר ל-*6500"],
    buildTemplate: (f) =>
      `שלום, אני מבקש לעדכן את ${f.updateField ? "ה" + f.updateField : "[פרט]"} שלי. הפרט החדש: ${f.newValue || "[ערך]"}. ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
  certificates: {
    fields: [
      { name: "certType", label: "סוג אישור", type: "select", options: ["אישור נכה צה\"ל", "תעודת נכה חדשה", "אישור למס הכנסה", "אישור זכאויות"], required: true },
      { name: "certPurpose", label: "מטרת האישור", type: "text", placeholder: "להגשה ל... / למעסיק / לרשויות" },
    ],
    portalPath: "הגשת פנייה לאגף \u2192 אישורים ותעודות",
    requiredDocs: [],
    optionalDocs: [],
    tips: ["בד\"כ לא צריך לצרף מסמכים"],
    buildTemplate: (f) =>
      `שלום, אני מבקש ${f.certType || "[אישור]"}.${f.certPurpose ? " מטרת האישור: " + f.certPurpose + "." : ""} ת.ז. ${f.caseNumber || "___"}. תודה.`,
  },
};

// ─── Constants ───────────────────────────────────────────────
const MAX_CHARS = 500;
const PORTAL_URL = "https://shikum.mod.gov.il";

// ─── Helper: should a field be shown? ────────────────────────
function shouldShow(field, formData) {
  if (!field.showIf) return true;
  return formData[field.showIf.field] === field.showIf.value;
}

// ─── Helper: trim template to max chars ──────────────────────
function trimTemplate(text) {
  if (text.length <= MAX_CHARS) return text;
  // Trim the middle, keep greeting and closing
  const closing = " ת.ז." + text.split("ת.ז.").pop();
  const available = MAX_CHARS - closing.length - 4;
  return text.slice(0, available) + "..." + closing;
}

// ─── Main Component ─────────────────────────────────────────
export default function PortalAgent({ onClose, legalCase, onSaveReference }) {
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [formData, setFormData] = useState({});
  const [checkedDocs, setCheckedDocs] = useState({});
  const [copied, setCopied] = useState(false);
  const [refNumber, setRefNumber] = useState("");
  const [refSaved, setRefSaved] = useState(false);
  const [animating, setAnimating] = useState(false);
  const containerRef = useRef(null);

  // Pre-fill case number from legalCase
  useEffect(() => {
    if (legalCase?.caseNumber || legalCase?.idNumber) {
      setFormData((prev) => ({
        ...prev,
        caseNumber: legalCase.caseNumber || legalCase.idNumber || "",
      }));
    }
  }, [legalCase]);

  const categoryConfig = selectedCategory
    ? CATEGORY_FIELDS[selectedCategory]
    : null;

  const templateText = useMemo(() => {
    if (!categoryConfig) return "";
    const raw = categoryConfig.buildTemplate(formData);
    return trimTemplate(raw);
  }, [categoryConfig, formData]);

  const charCount = templateText.length;
  const charColor =
    charCount > 480
      ? "var(--status-urgent)"
      : charCount > 400
        ? "var(--status-warning)"
        : "var(--status-success)";

  // Step transition with animation
  const goToStep = useCallback((newStep) => {
    setAnimating(true);
    setTimeout(() => {
      setStep(newStep);
      setAnimating(false);
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 150);
  }, []);

  // Handle category select
  const handleCategorySelect = useCallback(
    (catId) => {
      setSelectedCategory(catId);
      goToStep(2);
    },
    [goToStep]
  );

  // Handle form field change
  const handleFieldChange = useCallback((fieldName, value) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  // Handle doc checkbox
  const toggleDoc = useCallback((doc) => {
    setCheckedDocs((prev) => ({ ...prev, [doc]: !prev[doc] }));
  }, []);

  // Copy template
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(templateText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = templateText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [templateText]);

  // Save reference number
  const handleSaveRef = useCallback(() => {
    if (!refNumber.trim()) return;
    const entry = {
      refNumber: refNumber.trim(),
      category: CATEGORIES.find((c) => c.id === selectedCategory)?.label,
      date: new Date().toISOString(),
      reminderDate: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
    };
    // Save to localStorage
    const existing = JSON.parse(
      localStorage.getItem("magen_portal_refs") || "[]"
    );
    existing.push(entry);
    localStorage.setItem("magen_portal_refs", JSON.stringify(existing));
    // Callback
    if (onSaveReference) onSaveReference(refNumber.trim());
    setRefSaved(true);
  }, [refNumber, selectedCategory, onSaveReference]);

  // Check if required fields are filled
  const canProceedToPreview = useMemo(() => {
    if (!categoryConfig) return false;
    if (!formData.caseNumber?.trim()) return false;
    return categoryConfig.fields
      .filter((f) => f.required && shouldShow(f, formData))
      .every((f) => formData[f.name]?.trim());
  }, [categoryConfig, formData]);

  const categoryLabel =
    CATEGORIES.find((c) => c.id === selectedCategory)?.label || "";

  return (
    <div className="portal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="portal-container" ref={containerRef}>
        {/* ─── Header ─── */}
        <header className="portal-header">
          <div className="portal-header-row">
            {step > 1 && (
              <button
                className="portal-back"
                onClick={() => goToStep(step - 1)}
                aria-label="חזרה"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <h2 className="portal-title">הגשת פנייה לפורטל</h2>
            <button
              className="portal-close"
              onClick={onClose}
              aria-label="סגור"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className="portal-steps">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`portal-step-dot ${s === step ? "active" : ""} ${s < step ? "done" : ""}`}
              />
            ))}
            <span className="portal-step-label">{step}/4</span>
          </div>
        </header>

        {/* ─── Content ─── */}
        <div className={`portal-content ${animating ? "fading" : ""}`}>
          {/* === STEP 1: Category Selection === */}
          {step === 1 && (
            <div className="step-content">
              <p className="step-subtitle">מה תרצה להגיש?</p>
              <div className="category-grid">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    className="category-card"
                    onClick={() => handleCategorySelect(cat.id)}
                  >
                    <span className="category-icon">{cat.icon}</span>
                    <span className="category-label">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* === STEP 2: Details Collection === */}
          {step === 2 && categoryConfig && (
            <div className="step-content">
              <p className="step-subtitle">{categoryLabel}</p>

              {/* Case number — always first */}
              <div className="field-group">
                <label className="field-label" htmlFor="caseNumber">
                  מספר תיק / ת.ז. <span className="field-required">*</span>
                </label>
                <input
                  id="caseNumber"
                  type="text"
                  className="field-input"
                  value={formData.caseNumber || ""}
                  onChange={(e) =>
                    handleFieldChange("caseNumber", e.target.value)
                  }
                  placeholder="למשל: 012345678"
                />
              </div>

              {/* Dynamic fields */}
              {categoryConfig.fields.map((field) => {
                if (!shouldShow(field, formData)) return null;
                return (
                  <div className="field-group" key={field.name}>
                    <label className="field-label" htmlFor={field.name}>
                      {field.label}
                      {field.required && (
                        <span className="field-required"> *</span>
                      )}
                    </label>
                    {field.type === "select" ? (
                      <select
                        id={field.name}
                        className="field-input field-select"
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          handleFieldChange(field.name, e.target.value)
                        }
                      >
                        <option value="">בחר...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        id={field.name}
                        className="field-input field-textarea"
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          handleFieldChange(field.name, e.target.value)
                        }
                        placeholder={field.placeholder || ""}
                        rows={3}
                      />
                    ) : (
                      <input
                        id={field.name}
                        type="text"
                        className="field-input"
                        value={formData[field.name] || ""}
                        onChange={(e) =>
                          handleFieldChange(field.name, e.target.value)
                        }
                        placeholder={field.placeholder || ""}
                      />
                    )}
                  </div>
                );
              })}

              <button
                className="portal-btn-primary"
                disabled={!canProceedToPreview}
                onClick={() => goToStep(3)}
              >
                צפייה בנוסח
              </button>
            </div>
          )}

          {/* === STEP 3: Template Preview === */}
          {step === 3 && categoryConfig && (
            <div className="step-content">
              <p className="step-subtitle">נוסח הפנייה</p>

              {/* Portal path */}
              <div className="portal-path">
                {categoryConfig.portalPath}
              </div>

              {/* Template text */}
              <div className="template-box">
                <p className="template-text">{templateText}</p>
                <div className="template-footer">
                  <span className="char-counter" style={{ color: charColor }}>
                    {charCount}/{MAX_CHARS}
                  </span>
                  <button className="copy-btn" onClick={handleCopy}>
                    {copied ? "הועתק!" : "העתק נוסח"}
                  </button>
                </div>
              </div>

              {/* Document checklist */}
              {(categoryConfig.requiredDocs.length > 0 ||
                categoryConfig.optionalDocs.length > 0) && (
                <div className="docs-section">
                  <p className="docs-title">מסמכים שצריך לצרף:</p>
                  {categoryConfig.requiredDocs.map((doc) => (
                    <label key={doc} className="doc-item doc-required">
                      <input
                        type="checkbox"
                        checked={!!checkedDocs[doc]}
                        onChange={() => toggleDoc(doc)}
                      />
                      <span>{doc}</span>
                      <span className="doc-badge">חובה</span>
                    </label>
                  ))}
                  {categoryConfig.optionalDocs.map((doc) => (
                    <label key={doc} className="doc-item">
                      <input
                        type="checkbox"
                        checked={!!checkedDocs[doc]}
                        onChange={() => toggleDoc(doc)}
                      />
                      <span>{doc}</span>
                      <span className="doc-badge doc-badge-optional">
                        רשות
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Tips */}
              {categoryConfig.tips.length > 0 && (
                <div className="tips-section">
                  {categoryConfig.tips.map((tip, i) => (
                    <p key={i} className="tip-item">
                      {tip}
                    </p>
                  ))}
                </div>
              )}

              {/* Portal link */}
              <a
                href={PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-btn-primary portal-link"
              >
                פתח את הפורטל
              </a>

              <button
                className="portal-btn-secondary"
                onClick={() => goToStep(4)}
              >
                הגשתי, המשך
              </button>
            </div>
          )}

          {/* === STEP 4: Post-submission === */}
          {step === 4 && (
            <div className="step-content">
              <div className="success-header">
                <h3 className="success-title">הגשת? מעולה!</h3>
                <p className="success-subtitle">
                  שמור את מספר הפנייה לצורך מעקב
                </p>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="refNumber">
                  מספר פנייה
                </label>
                <input
                  id="refNumber"
                  type="text"
                  className="field-input"
                  value={refNumber}
                  onChange={(e) => setRefNumber(e.target.value)}
                  placeholder="הכנס מספר פנייה מהפורטל"
                  disabled={refSaved}
                />
              </div>

              {!refSaved ? (
                <button
                  className="portal-btn-primary"
                  onClick={handleSaveRef}
                  disabled={!refNumber.trim()}
                >
                  שמור מספר פנייה
                </button>
              ) : (
                <div className="ref-saved-msg">
                  <p>נשמר. נזכיר לך בעוד 30 יום לבדוק סטטוס.</p>
                </div>
              )}

              <div className="post-tips">
                <p className="post-tip-title">טיפים למעקב:</p>
                <p className="post-tip-item">
                  אם לא עונים \u2014 תתקשר ל-*6500 עם מספר הפנייה
                </p>
                <p className="post-tip-item">
                  בדוק סטטוס בפורטל אחרי 14 ימי עסקים
                </p>
                <p className="post-tip-item">
                  שמור עותק מכל מסמך ששלחת
                </p>
              </div>

              <button className="portal-btn-secondary" onClick={onClose}>
                סיום
              </button>
            </div>
          )}
        </div>

        {/* ─── Styles ─── */}
        <style jsx>{`
          /* === Overlay === */
          .portal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(12, 10, 9, 0.8);
            z-index: 9000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
          }

          /* === Container === */
          .portal-container {
            background: var(--stone-900, #1c1917);
            border: 1px solid var(--stone-700, #44403c);
            border-radius: 8px;
            width: 100%;
            max-width: 640px;
            max-height: 90vh;
            overflow-y: auto;
            direction: rtl;
            font-family: 'Heebo', sans-serif;
            color: var(--stone-200, #e7e5e4);
          }

          /* === Header === */
          .portal-header {
            padding: 1.25rem 1.5rem 1rem;
            border-bottom: 1px solid var(--stone-700, #44403c);
            position: sticky;
            top: 0;
            background: var(--stone-900, #1c1917);
            z-index: 10;
          }
          .portal-header-row {
            display: flex;
            align-items: center;
            gap: 0.75rem;
          }
          .portal-title {
            font-weight: 700;
            font-size: 1.125rem;
            line-height: 1.2;
            letter-spacing: -0.02em;
            flex: 1;
            margin: 0;
          }
          .portal-back,
          .portal-close {
            background: none;
            border: none;
            color: var(--stone-400, #a8a29e);
            cursor: pointer;
            padding: 0.25rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: color 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }
          .portal-back:hover,
          .portal-close:hover {
            color: var(--stone-200, #e7e5e4);
          }
          .portal-back:focus-visible,
          .portal-close:focus-visible {
            outline: 2px solid var(--copper-500, #d97706);
            outline-offset: 2px;
          }

          /* === Step indicator === */
          .portal-steps {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 0.75rem;
          }
          .portal-step-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--stone-700, #44403c);
            transition: background 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }
          .portal-step-dot.active {
            background: var(--copper-500, #d97706);
            width: 10px;
            height: 10px;
          }
          .portal-step-dot.done {
            background: var(--olive-600, #5a6f4a);
          }
          .portal-step-label {
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--stone-400, #a8a29e);
            letter-spacing: 0.06em;
            margin-inline-start: auto;
          }

          /* === Content area === */
          .portal-content {
            padding: 1.5rem;
            animation: fadeSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .portal-content.fading {
            opacity: 0;
            transform: translateY(8px);
          }
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .portal-content {
              animation: none;
            }
          }

          .step-content {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .step-subtitle {
            font-weight: 600;
            font-size: 1rem;
            color: var(--stone-300, #d6d3d1);
            margin: 0 0 0.25rem;
          }

          /* === Step 1: Category Grid === */
          .category-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
          }
          @media (min-width: 540px) {
            .category-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
          .category-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
            background: var(--stone-800, #292524);
            border: 1px solid var(--stone-700, #44403c);
            border-radius: 8px;
            padding: 1.25rem 0.75rem;
            cursor: pointer;
            transition: transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                        border-color 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            font-family: inherit;
            color: inherit;
          }
          .category-card:hover {
            transform: translateY(-2px);
            border-color: var(--copper-500, #d97706);
          }
          .category-card:focus-visible {
            outline: 2px solid var(--copper-500, #d97706);
            outline-offset: 2px;
          }
          .category-icon {
            font-size: 1.5rem;
            line-height: 1;
          }
          .category-label {
            font-size: 0.8rem;
            font-weight: 600;
            text-align: center;
            line-height: 1.3;
            letter-spacing: -0.01em;
          }

          /* === Step 2: Form fields === */
          .field-group {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
          }
          .field-label {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--stone-300, #d6d3d1);
          }
          .field-required {
            color: var(--copper-500, #d97706);
          }
          .field-input {
            background: var(--stone-800, #292524);
            border: 1px solid var(--stone-700, #44403c);
            border-radius: 6px;
            padding: 0.7rem 0.85rem;
            color: var(--stone-200, #e7e5e4);
            font-family: 'Heebo', sans-serif;
            font-size: 0.9rem;
            line-height: 1.5;
            direction: rtl;
            transition: border-color 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }
          .field-input::placeholder {
            color: var(--stone-600, #57534e);
          }
          .field-input:focus {
            outline: none;
            border-color: var(--copper-500, #d97706);
          }
          .field-input:focus-visible {
            outline: 2px solid var(--copper-500, #d97706);
            outline-offset: 2px;
          }
          .field-select {
            appearance: none;
            cursor: pointer;
            background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='%23a8a29e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: left 0.85rem center;
            padding-inline-end: 0.85rem;
            padding-inline-start: 2.25rem;
          }
          .field-textarea {
            resize: vertical;
            min-height: 72px;
          }

          /* === Buttons === */
          .portal-btn-primary {
            background: var(--copper-500, #d97706);
            color: var(--stone-900, #1c1917);
            font-family: 'Heebo', sans-serif;
            font-weight: 700;
            font-size: 0.9rem;
            letter-spacing: 0.02em;
            padding: 0.85em 2em;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            text-align: center;
            display: block;
            width: 100%;
            text-decoration: none;
            margin-top: 0.5rem;
          }
          .portal-btn-primary:hover {
            background: var(--copper-600, #c2410c);
          }
          .portal-btn-primary:disabled {
            background: var(--stone-700, #44403c);
            color: var(--stone-600, #57534e);
            cursor: not-allowed;
          }
          .portal-btn-primary:focus-visible {
            outline: 2px solid var(--copper-500, #d97706);
            outline-offset: 2px;
          }
          .portal-btn-secondary {
            background: transparent;
            color: var(--stone-300, #d6d3d1);
            font-family: 'Heebo', sans-serif;
            font-weight: 600;
            font-size: 0.9rem;
            padding: 0.85em 2em;
            border: 1px solid var(--stone-700, #44403c);
            border-radius: 6px;
            cursor: pointer;
            transition: border-color 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            width: 100%;
          }
          .portal-btn-secondary:hover {
            border-color: var(--stone-400, #a8a29e);
          }
          .portal-btn-secondary:focus-visible {
            outline: 2px solid var(--copper-500, #d97706);
            outline-offset: 2px;
          }
          .portal-link {
            display: flex;
            align-items: center;
            justify-content: center;
          }

          /* === Step 3: Template Preview === */
          .portal-path {
            font-size: 0.75rem;
            font-weight: 500;
            letter-spacing: 0.04em;
            color: var(--copper-500, #d97706);
            background: rgba(217, 119, 6, 0.08);
            padding: 0.5rem 0.75rem;
            border-radius: 4px;
            border-inline-start: 3px solid var(--copper-500, #d97706);
          }
          .template-box {
            background: var(--stone-800, #292524);
            border: 1px solid var(--stone-700, #44403c);
            border-radius: 8px;
            padding: 1rem;
          }
          .template-text {
            font-size: 0.9rem;
            line-height: 1.7;
            color: var(--stone-200, #e7e5e4);
            margin: 0 0 0.75rem;
            white-space: pre-wrap;
            word-break: break-word;
          }
          .template-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid var(--stone-700, #44403c);
            padding-top: 0.6rem;
          }
          .char-counter {
            font-family: 'IBM Plex Mono', 'Courier New', monospace;
            font-size: 0.75rem;
            font-weight: 500;
            letter-spacing: -0.02em;
          }
          .copy-btn {
            background: transparent;
            border: 1px solid var(--copper-500, #d97706);
            color: var(--copper-500, #d97706);
            font-family: 'Heebo', sans-serif;
            font-weight: 600;
            font-size: 0.8rem;
            padding: 0.4em 1em;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }
          .copy-btn:hover {
            background: rgba(217, 119, 6, 0.12);
          }

          /* === Document Checklist === */
          .docs-section {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .docs-title {
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--stone-300, #d6d3d1);
            margin: 0;
          }
          .doc-item {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            font-size: 0.85rem;
            color: var(--stone-300, #d6d3d1);
            cursor: pointer;
            padding: 0.35rem 0;
          }
          .doc-item input[type="checkbox"] {
            accent-color: var(--copper-500, #d97706);
            width: 16px;
            height: 16px;
            flex-shrink: 0;
          }
          .doc-badge {
            font-size: 0.65rem;
            font-weight: 600;
            letter-spacing: 0.06em;
            padding: 0.15em 0.45em;
            border-radius: 3px;
            background: rgba(220, 38, 38, 0.15);
            color: var(--status-urgent, #dc2626);
            margin-inline-start: auto;
          }
          .doc-badge-optional {
            background: rgba(37, 99, 235, 0.12);
            color: var(--status-info, #2563eb);
          }

          /* === Tips === */
          .tips-section {
            background: rgba(90, 111, 74, 0.1);
            border: 1px solid rgba(90, 111, 74, 0.25);
            border-radius: 6px;
            padding: 0.75rem 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
          }
          .tip-item {
            font-size: 0.82rem;
            line-height: 1.5;
            color: var(--olive-400, #8fa677);
            margin: 0;
            padding-inline-start: 0.75rem;
            position: relative;
          }
          .tip-item::before {
            content: '';
            position: absolute;
            inset-inline-start: 0;
            top: 0.55em;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--olive-600, #5a6f4a);
          }

          /* === Step 4: Post-submission === */
          .success-header {
            text-align: center;
            padding: 1rem 0 0.5rem;
          }
          .success-title {
            font-weight: 900;
            font-size: clamp(1.5rem, 3vw, 2rem);
            line-height: 1.1;
            letter-spacing: -0.03em;
            color: var(--stone-50, #fafaf9);
            margin: 0 0 0.35rem;
          }
          .success-subtitle {
            font-size: 0.9rem;
            color: var(--stone-400, #a8a29e);
            margin: 0;
          }
          .ref-saved-msg {
            text-align: center;
            padding: 0.75rem;
            background: rgba(22, 163, 74, 0.1);
            border: 1px solid rgba(22, 163, 74, 0.25);
            border-radius: 6px;
          }
          .ref-saved-msg p {
            color: var(--status-success, #16a34a);
            font-size: 0.85rem;
            font-weight: 600;
            margin: 0;
          }
          .post-tips {
            background: var(--stone-800, #292524);
            border: 1px solid var(--stone-700, #44403c);
            border-radius: 8px;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .post-tip-title {
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--stone-300, #d6d3d1);
            margin: 0;
          }
          .post-tip-item {
            font-size: 0.82rem;
            line-height: 1.5;
            color: var(--stone-400, #a8a29e);
            margin: 0;
            padding-inline-start: 0.75rem;
            position: relative;
          }
          .post-tip-item::before {
            content: '';
            position: absolute;
            inset-inline-start: 0;
            top: 0.55em;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--stone-600, #57534e);
          }

          /* === Scrollbar === */
          .portal-container::-webkit-scrollbar {
            width: 6px;
          }
          .portal-container::-webkit-scrollbar-track {
            background: transparent;
          }
          .portal-container::-webkit-scrollbar-thumb {
            background: var(--stone-700, #44403c);
            border-radius: 3px;
          }
        `}</style>
      </div>
    </div>
  );
}

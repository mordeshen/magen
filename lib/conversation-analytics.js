import { getAdminSupabase } from "../pages/api/lib/supabase-admin";
import { MODEL_HAIKU } from "../pages/api/lib/models";

const TOPIC_CATEGORIES = [
  "זכויות_ותגמולים", "ועדות_רפואיות", "רכב_ותו_נכה",
  "תרופות_וטיפולים", "דיור", "תעסוקה", "נשק",
  "עורכי_דין", "בירוקרטיה", "רגשי", "אחר",
];

const COMMITTEE_KEYWORDS = /ועדה|ועדת|ועדות|רופא.*ועדה|ועדה.*רפואית|כושר.*עבודה|צרכים.*מיוחדים|וועדה/;

const ABUSE_KEYWORDS = [
  "השפיל", "זלזל", "פגע", "לא האמין", "לא האמינו",
  "צחק", "צחקו", "שאל שאלות לא מתאימות", "שאלות לא רלוונטיות",
  "בכיתי", "נשברתי", "התעלם", "התעלמו", "ביזה", "ביזו",
  "צעק", "צעקו", "איים", "איימו", "השתיק", "לא נתן לדבר",
  "לא הקשיב", "לא הקשיבו", "חקר אותי", "חקרו אותי",
  "התייחס בזלזול", "גרם לי להרגיש", "יחס משפיל",
];

const CRISIS_KEYWORDS = /התאבד|לגמור|לסיים|אין טעם|לא רוצה לחיות|מוות|למות/;

const TOPIC_RULES = [
  { pattern: /ועדה|ועדות|אחוזי.*נכות|אחוזים|דרגת.*נכות|ערעור|ערר/, topic: "ועדות_רפואיות" },
  { pattern: /זכויות|תגמולים|קצבה|קצבת|הטבה|הטבות|הכרה|תביעה/, topic: "זכויות_ותגמולים" },
  { pattern: /רכב|תו.*נכה|חניית.*נכים|רישיון|ביטוח.*רכב/, topic: "רכב_ותו_נכה" },
  { pattern: /תרופות|תרופה|טיפול|רופא|מרשם|החזר.*תרופות|בריאות/, topic: "תרופות_וטיפולים" },
  { pattern: /דירה|דיור|משכנתא|שכירות|סיוע.*דיור/, topic: "דיור" },
  { pattern: /עבודה|תעסוקה|משרה|שיקום.*תעסוקתי|לימודים|קורס/, topic: "תעסוקה" },
  { pattern: /נשק|רישיון.*נשק|אקדח|היתר.*נשק/, topic: "נשק" },
  { pattern: /עורך.*דין|ייצוג|שכר.*טרחה|עו"ד|תביעה.*משפטית/, topic: "עורכי_דין" },
  { pattern: /טופס|פורטל|אגף.*שיקום|בירוקרטיה|פנייה|מסמך/, topic: "בירוקרטיה" },
  { pattern: /מרגיש|פחד|חרדה|דיכאון|לא ישן|סיוט|בודד|עצוב|כועס/, topic: "רגשי" },
];

function classifyTopicFast(message) {
  const m = message || "";
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(m)) return rule.topic;
  }
  return "אחר";
}

const NEGATIVE_WORDS = [
  "נורא", "גרוע", "איום", "מתסכל", "עצוב", "כואב", "קשה",
  "מתעצבן", "כועס", "נואש", "מיואש", "מדוכא", "מפחד",
  "בודד", "חסר תקווה", "נשבר", "מותש", "שבור",
  "נפגע", "מושפל", "מבוזה", "לא מוערך",
];
const POSITIVE_WORDS = [
  "תודה", "מעולה", "עוזר", "אדיר", "מצוין", "טוב",
  "שמח", "מרוצה", "מודה", "נהדר", "יפה", "אהבתי",
  "עזרת", "הצלת", "הקלת", "מרגיע", "מעודד",
];

function scoreSentimentFast(message) {
  const m = message || "";
  let score = 0;
  let hits = 0;
  for (const w of NEGATIVE_WORDS) {
    if (m.includes(w)) { score -= 0.3; hits++; }
  }
  for (const w of POSITIVE_WORDS) {
    if (m.includes(w)) { score += 0.3; hits++; }
  }
  for (const kw of ABUSE_KEYWORDS) {
    if (m.includes(kw)) { score -= 0.4; hits++; }
  }
  if (CRISIS_KEYWORDS.test(m)) { score -= 0.5; hits++; }
  if (hits === 0) return 0;
  return Math.max(-1, Math.min(1, score));
}

function isCommitteeContext(message) {
  return COMMITTEE_KEYWORDS.test(message || "");
}

function detectAbuseKeywords(message) {
  const m = message || "";
  const found = [];
  for (const kw of ABUSE_KEYWORDS) {
    if (m.includes(kw)) found.push(kw);
  }
  return found;
}

function anonymizeText(text, maxLen = 200) {
  if (!text) return "";
  let t = text
    .replace(/\d{9}/g, "***")
    .replace(/\d{3}-?\d{7}/g, "***")
    .replace(/\d{2,3}-\d{7}/g, "***")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/(?:שמי|אני)\s+[֐-׿]+(?:\s+[֐-׿]+)?/g, "[שם]");
  if (t.length > maxLen) t = t.slice(0, maxLen) + "...";
  return t;
}

function detectCommitteeType(message) {
  const m = message || "";
  if (/ועדה.*רפואית|ועדת.*נכות/.test(m)) return "רפואית";
  if (/צרכים.*מיוחדים/.test(m)) return "צרכים מיוחדים";
  if (/כושר.*עבודה/.test(m)) return "כושר עבודה";
  if (/ערעור|ערר|עליון/.test(m)) return "ערעור";
  return null;
}

function scoreSeverity(sentiment, abuseCount, hasCrisis) {
  if (hasCrisis) return 5;
  if (sentiment <= -0.8 && abuseCount >= 2) return 4;
  if (sentiment <= -0.7 || abuseCount >= 2) return 3;
  if (abuseCount >= 1) return 2;
  return 1;
}

function detectResolution(aiResponse) {
  const r = aiResponse || "";
  const resolvedPatterns = /הנה.*המידע|אפשר.*לפנות|הזכות.*שלך|כדאי.*לבדוק|השלבים.*הם|צריך.*להגיש/;
  const escalationPatterns = /כדאי.*לפנות.*לגורם|מומלץ.*לדבר.*עם.*מקצועי|אני.*ממליץ.*להתקשר|ער\b.*חירום/;
  if (escalationPatterns.test(r)) return { resolved: false, escalation: "human_needed" };
  if (resolvedPatterns.test(r)) return { resolved: true, escalation: null };
  return { resolved: false, escalation: null };
}

async function classifyWithAI(userMessage, aiResponse) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `סווג את השיחה הבאה. החזר JSON בלבד.

הודעת משתמש: "${userMessage.slice(0, 500)}"
תגובת המערכת: "${aiResponse.slice(0, 300)}"

החזר:
{"topic":"אחד מ: ${TOPIC_CATEGORIES.join(", ")}","sub_topic":"תת-נושא קצר","sentiment":-1 עד 1,"resolved":true/false}`,
        }],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = data.content?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.error("[conv-analytics] AI classification failed:", e.message);
  }
  return null;
}

export async function classifyAndLogEvent(userMessage, aiResponse, context = {}) {
  try {
    const admin = getAdminSupabase();
    const now = new Date();
    const topicFast = classifyTopicFast(userMessage);
    const sentimentFast = scoreSentimentFast(userMessage);
    const resolution = detectResolution(aiResponse);

    let topic = topicFast;
    let subTopic = null;
    let sentiment = sentimentFast;
    let resolved = resolution.resolved;

    const aiResult = await classifyWithAI(userMessage, aiResponse);
    if (aiResult) {
      if (aiResult.topic && TOPIC_CATEGORIES.includes(aiResult.topic)) topic = aiResult.topic;
      if (aiResult.sub_topic) subTopic = aiResult.sub_topic;
      if (typeof aiResult.sentiment === "number") sentiment = (sentiment + aiResult.sentiment) / 2;
      if (typeof aiResult.resolved === "boolean") resolved = aiResult.resolved;
    }

    const event = {
      topic_category: topic,
      sub_topic: subTopic,
      sentiment_score: Math.round(sentiment * 100) / 100,
      resolved,
      escalation_type: resolution.escalation,
      channel: context.channel || "web",
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
      response_time_ms: context.responseTimeMs || null,
      disability_pct_range: context.disabilityRange || null,
    };

    await admin.from("analytics_conversation_events").insert(event);

    const isCommittee = isCommitteeContext(userMessage);
    const abuseFound = detectAbuseKeywords(userMessage);
    const hasCrisis = CRISIS_KEYWORDS.test(userMessage);

    if ((isCommittee && sentiment < -0.7) || abuseFound.length > 0 || hasCrisis) {
      const incidentType = hasCrisis ? "emotional_crisis"
        : abuseFound.length > 0 ? "committee_abuse"
        : "systemic_failure";

      const severity = scoreSeverity(sentiment, abuseFound.length, hasCrisis);

      const incident = {
        incident_type: incidentType,
        severity,
        committee_type: detectCommitteeType(userMessage),
        anonymized_summary: anonymizeText(userMessage, 300),
        anonymized_quote: abuseFound.length > 0
          ? anonymizeText(userMessage.slice(
              Math.max(0, userMessage.indexOf(abuseFound[0]) - 40),
              userMessage.indexOf(abuseFound[0]) + abuseFound[0].length + 60
            ))
          : null,
        status: "new",
      };

      await admin.from("analytics_critical_incidents").insert(incident);
      console.log(`[conv-analytics] Critical incident flagged: ${incidentType}, severity ${severity}`);
    }

    await trackRecurringQuestion(admin, userMessage, topic);
  } catch (err) {
    console.error("[conv-analytics] Event logging failed:", err.message);
  }
}

async function trackRecurringQuestion(admin, message, category) {
  const normalized = (message || "")
    .replace(/[?!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

  if (normalized.length < 10) return;

  const { data: existing } = await admin
    .from("analytics_recurring_questions")
    .select("id, occurrence_count, sample_questions")
    .ilike("question_pattern", `%${normalized.slice(0, 40)}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    const q = existing[0];
    const samples = q.sample_questions || [];
    if (samples.length < 5) samples.push(anonymizeText(message, 100));
    await admin
      .from("analytics_recurring_questions")
      .update({
        occurrence_count: q.occurrence_count + 1,
        last_seen: new Date().toISOString(),
        sample_questions: samples,
      })
      .eq("id", q.id);
  } else {
    await admin.from("analytics_recurring_questions").insert({
      question_pattern: normalized,
      category,
      occurrence_count: 1,
      sample_questions: [anonymizeText(message, 100)],
    });
  }
}

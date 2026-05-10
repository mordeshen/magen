// =============================================================
// Layer 5: Synthesis — Generate answer from retrieved chunks
// Sonnet 4.6 by default, Opus 4.7 for complex queries
// =============================================================

import { MODEL_SONNET, MODEL_OPUS } from "./models";

const SYNTHESIS_PROMPT = `אתה עוזר משפטי לזכויות נכי צה"ל. ענה לפי הקטעים שנשלפו מהוראות אגף שיקום נכים.

=== חוקים ===
1. ציין מספר הוראה בכל המלצה (למשל: "לפי הוראה 62.01")
2. אם יש הבחנות חשובות / אזהרות בקטעים — הצג אותן בפורמט "⚠️ ..."
3. אם יש must_pair_with להוראה הנשלפת — אזכר אותה
4. אם יש conflicts_with — הזהר במפורש
5. סכומים: תמיד "אינדיקטיבי, מתעדכן" + תאריך ההוראה
6. אם המשתמש לא נתן קונטקסט מלא — שאל שאלות סינון לפני המלצה
7. ענה ישר, בעברית טבעית, 3-6 שורות. לא מסביר מה אתה — פשוט עוזר.
8. אל תמציא מידע שאינו בקטעים. אם לא ברור — אמור מה לא ברור ומה הצעד הבא.

=== סגנון ===
- קצר, ממוקד, פרקטי
- אל תחזור על השאלה
- אל תפתח ב"שאלה טובה" או "בהחלט"
- הכל action-oriented: מה לעשות, לאן לפנות, מה להביא`;

export async function synthesize(question, chunks, understanding, userPersona, recentMessages) {
  const model = understanding.complexity === "complex" ? MODEL_OPUS : MODEL_SONNET;

  const systemParts = [SYNTHESIS_PROMPT];

  // Add directive-specific integration section from top chunk
  if (chunks[0]?.integration_section) {
    systemParts.push(`\n=== תבנית תשובה (מתוך ההוראה) ===\n${chunks[0].integration_section}`);
  }

  // User persona context
  if (userPersona && Object.values(userPersona).some(Boolean)) {
    systemParts.push(`\n=== קונטקסט המשתמש ===`);
    if (userPersona.disability_grade) systemParts.push(`דרגת נכות: ${userPersona.disability_grade}`);
    if (userPersona.injury_type) systemParts.push(`סוג פגיעה: ${userPersona.injury_type}`);
    if (userPersona.family_status) systemParts.push(`מצב משפחתי: ${userPersona.family_status}`);
    if (userPersona.age_bucket) systemParts.push(`גיל: ${userPersona.age_bucket}`);
  }

  // Retrieved chunks
  systemParts.push(`\n=== קטעים שנשלפו (השתמש בהם לתשובה מדויקת) ===`);
  for (const chunk of chunks) {
    let entry = `\n[הוראה ${chunk.directive_number} — ${chunk.section_title}]`;
    entry += `\n${chunk.content.slice(0, 2000)}`;
    if (chunk.must_pair_with?.length) {
      entry += `\n[יש לשלב עם: ${chunk.must_pair_with.join(", ")}]`;
    }
    if (chunk.conflicts_with?.length) {
      entry += `\n[⚠️ סותר: ${chunk.conflicts_with.join(", ")}]`;
    }
    systemParts.push(entry);
  }

  // Ambiguity guidance
  if (understanding.intent?.is_ambiguous && understanding.intent?.ambiguity_resolution_q) {
    systemParts.push(`\n=== שאלת הבהרה מומלצת ===`);
    systemParts.push(understanding.intent.ambiguity_resolution_q);
  }

  const messages = [];
  if (recentMessages?.length) {
    messages.push(...recentMessages.slice(-4).map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : "[מורכב]",
    })));
  }
  messages.push({ role: "user", content: question });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system: systemParts.join("\n"),
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[synthesis] API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    let text = data.content?.[0]?.text || "";

    // Truncation handling
    if (data.stop_reason === "max_tokens" && text.length > 0) {
      const lastPeriod = Math.max(text.lastIndexOf("."), text.lastIndexOf("?"), text.lastIndexOf("!"));
      if (lastPeriod > text.length * 0.3) {
        text = text.slice(0, lastPeriod + 1);
      }
      text += "\n\nרוצה שארחיב?";
    }

    return {
      text,
      model,
      tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      citations: extractCitations(text),
    };
  } catch (err) {
    clearTimeout(timeout);
    console.error("[synthesis] Error:", err.message);
    return null;
  }
}

function extractCitations(text) {
  const matches = text.matchAll(/הוראה\s+(\d+\.\d+)/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

// Streaming version — calls onChunk for each text delta
export async function synthesizeStream(question, chunks, understanding, userPersona, recentMessages, onChunk) {
  const model = understanding.complexity === "complex" ? MODEL_OPUS : MODEL_SONNET;

  const systemParts = [SYNTHESIS_PROMPT];

  if (chunks[0]?.integration_section) {
    systemParts.push(`\n=== תבנית תשובה (מתוך ההוראה) ===\n${chunks[0].integration_section}`);
  }

  if (userPersona && Object.values(userPersona).some(Boolean)) {
    systemParts.push(`\n=== קונטקסט המשתמש ===`);
    if (userPersona.disability_grade) systemParts.push(`דרגת נכות: ${userPersona.disability_grade}`);
    if (userPersona.injury_type) systemParts.push(`סוג פגיעה: ${userPersona.injury_type}`);
    if (userPersona.family_status) systemParts.push(`מצב משפחתי: ${userPersona.family_status}`);
    if (userPersona.age_bucket) systemParts.push(`גיל: ${userPersona.age_bucket}`);
  }

  systemParts.push(`\n=== קטעים שנשלפו (השתמש בהם לתשובה מדויקת) ===`);
  for (const chunk of chunks) {
    let entry = `\n[הוראה ${chunk.directive_number} — ${chunk.section_title}]`;
    entry += `\n${chunk.content.slice(0, 2000)}`;
    if (chunk.must_pair_with?.length) entry += `\n[יש לשלב עם: ${chunk.must_pair_with.join(", ")}]`;
    if (chunk.conflicts_with?.length) entry += `\n[⚠️ סותר: ${chunk.conflicts_with.join(", ")}]`;
    systemParts.push(entry);
  }

  if (understanding.intent?.is_ambiguous && understanding.intent?.ambiguity_resolution_q) {
    systemParts.push(`\n=== שאלת הבהרה מומלצת ===`);
    systemParts.push(understanding.intent.ambiguity_resolution_q);
  }

  const messages = [];
  if (recentMessages?.length) {
    messages.push(...recentMessages.slice(-4).map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : "[מורכב]",
    })));
  }
  messages.push({ role: "user", content: question });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        stream: true,
        system: systemParts.join("\n"),
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[synthesis-stream] API error: ${res.status}`);
      return null;
    }

    // Parse SSE stream from Anthropic
    let fullText = "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6);
        if (jsonStr === "[DONE]") continue;

        try {
          const event = JSON.parse(jsonStr);
          if (event.type === "content_block_delta" && event.delta?.text) {
            fullText += event.delta.text;
            onChunk(event.delta.text);
          }
        } catch {}
      }
    }

    return {
      text: fullText,
      model,
      citations: extractCitations(fullText),
    };
  } catch (err) {
    clearTimeout(timeout);
    console.error("[synthesis-stream] Error:", err.message);
    return null;
  }
}

const EN_TO_HE = {
  t: "א", c: "ב", d: "ג", s: "ד", v: "ה", u: "ו", z: "ז", j: "ח", y: "ט",
  h: "י", f: "כ", k: "ל", n: "מ", b: "נ", x: "ס", g: "ע", p: "פ", m: "צ",
  e: "ק", r: "ר", a: "ש", w: "ת",
  ",": "ת", ".": "ץ", ";": "ף", "'": ",", "/": ".", l: "ך", o: "ם", i: "ן",
  T: "א", C: "ב", D: "ג", S: "ד", V: "ה", U: "ו", Z: "ז", J: "ח", Y: "ט",
  H: "י", F: "כ", K: "ל", N: "מ", B: "נ", X: "ס", G: "ע", P: "פ", M: "צ",
  E: "ק", R: "ר", A: "ש", W: "ת",
};

const COMMON_EN_WORDS = new Set([
  "the", "is", "are", "was", "and", "or", "but", "not", "for", "with",
  "this", "that", "have", "has", "from", "can", "will", "you", "your",
  "what", "how", "where", "when", "who", "why", "hello", "hi", "yes", "no",
  "ok", "please", "thanks", "thank", "sorry", "help", "need", "want",
  "know", "think", "get", "got", "just", "like", "make", "good", "bad",
  "new", "old", "all", "one", "two", "about", "more", "very", "also",
  "http", "https", "www", "com", "pdf", "jpg", "png",
]);

function isLikelyEnglish(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const englishCount = words.filter(w => COMMON_EN_WORDS.has(w.replace(/[.,!?;:'"]/g, ""))).length;
  return englishCount / words.length > 0.3;
}

function hasHebrew(text) {
  return /[֐-׿]/.test(text);
}

function isLatinOnly(text) {
  return /^[a-zA-Z\s.,;:'"!?\-/0-9]+$/.test(text.trim());
}

function unswap(text) {
  return text.split("").map(ch => EN_TO_HE[ch] || ch).join("");
}

/**
 * If the message looks like Hebrew typed on an English keyboard,
 * convert it back to Hebrew. Returns the original text if it looks
 * like real English or already contains Hebrew.
 */
export function fixKeyboardLayout(text) {
  if (!text || text.length < 2) return text;
  if (hasHebrew(text)) return text;
  if (!isLatinOnly(text)) return text;
  if (isLikelyEnglish(text)) return text;

  const converted = unswap(text);
  if (!hasHebrew(converted)) return text;

  return converted;
}

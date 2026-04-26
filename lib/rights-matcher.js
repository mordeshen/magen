import eligibility from "../data/rights-eligibility.json";

const { rules, injuryTypeMapping } = eligibility;

function normalizeInjuryType(rawType) {
  if (!rawType) return null;
  const lower = rawType.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(injuryTypeMapping)) {
    if (aliases.some(a => lower.includes(a.toLowerCase()))) return canonical;
  }
  return null;
}

export function matchRights(rights, { injuries = [], disabilityPercent = 0, injuryTypes = [] } = {}) {
  const userTypes = new Set();

  for (const t of injuryTypes) {
    const norm = normalizeInjuryType(t);
    if (norm) userTypes.add(norm);
  }

  for (const inj of injuries) {
    const zone = inj.body_zone || inj.zone || "";
    const label = inj.hebrew_label || inj.hebrewLabel || inj.label || "";
    const combined = `${zone} ${label}`.toLowerCase();

    if (combined.match(/ptsd|פוסט|נפש|חרד/)) userTypes.add("ptsd");
    if (combined.match(/ראש|מוח|tbi|נוירו/)) userTypes.add("neurological");
    if (combined.match(/שמיע|טינט|אוזן|hearing/)) userTypes.add("hearing");
    if (combined.match(/רגל|גב|ברך|כתף|ירך|קרסול|עמוד|אורתו|ortho|knee|shoulder|ankle|back|arm|leg/)) userTypes.add("orthopedic");
    if (combined.match(/לב|ריא|כלי|מע|פנימ|internal/)) userTypes.add("internal");
  }

  const matched = [];
  const partial = [];

  for (const right of rights) {
    const rule = rules[right.id];
    if (!rule) {
      partial.push({ ...right, matchReason: "אין מידע זכאות", matchScore: 0 });
      continue;
    }

    if (rule.maxDisability != null && disabilityPercent > rule.maxDisability) continue;
    if (disabilityPercent < rule.minDisability) continue;

    const requiresSpecificType = rule.injuryTypes && rule.injuryTypes.length > 0;
    const typeMatch = !requiresSpecificType || rule.injuryTypes.some(t => userTypes.has(t));

    if (!typeMatch) continue;

    let score = 50;
    if (requiresSpecificType && typeMatch) score += 30;
    if (rule.minDisability > 0 && disabilityPercent >= rule.minDisability) score += 10;
    if (right.urgency === "high") score += 10;

    const reasons = [];
    if (rule.minDisability > 0) reasons.push(`${rule.minDisability}%+ נכות`);
    if (requiresSpecificType) reasons.push(rule.injuryTypes.map(t => injuryTypeMapping[t]?.[1] || t).join(" / "));
    if (rule.note) reasons.push(rule.note);

    matched.push({
      ...right,
      matchScore: score,
      matchReason: reasons.join(" • ") || "כל נכה מוכר",
      eligibilityNote: rule.note || null,
    });
  }

  matched.sort((a, b) => b.matchScore - a.matchScore);
  return { matched, total: rights.length, userTypes: [...userTypes] };
}

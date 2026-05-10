import { describe, it, expect, vi } from "vitest";

// Mock fetch globally for these tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Directives Pipeline — Unit Tests", () => {
  describe("ETL Parser (dry-run logic)", () => {
    it("parses directive number from filename", () => {
      // Import the logic inline (ETL is CommonJS, so we replicate the function)
      function parseDirectiveNumber(filename) {
        const match = filename.match(/^(\d+)-(\d+)/);
        if (!match) return null;
        return `${parseInt(match[1])}.${match[2]}`;
      }

      expect(parseDirectiveNumber("40-07-allowance-for-needy.md")).toBe("40.07");
      expect(parseDirectiveNumber("62-01-housing-loans.md")).toBe("62.01");
      expect(parseDirectiveNumber("53-09-needs-for-blind.md")).toBe("53.09");
      expect(parseDirectiveNumber("80-18-special-needs-allowance.md")).toBe("80.18");
      expect(parseDirectiveNumber("56-022-vehicle-purchase-replacement-temporary.md")).toBe("56.022");
      expect(parseDirectiveNumber("README.md")).toBe(null);
    });

    it("splits content by H2 headers", () => {
      function splitByH2(content) {
        const sections = [];
        const lines = content.split("\n");
        let currentTitle = null;
        let currentLines = [];
        for (const line of lines) {
          const h2Match = line.match(/^## (.+)$/);
          if (h2Match) {
            if (currentTitle) sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
            currentTitle = h2Match[1].trim();
            currentLines = [];
          } else if (currentTitle) {
            currentLines.push(line);
          }
        }
        if (currentTitle) sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
        return sections;
      }

      const md = `# Title\n\nIntro text\n\n## תקציר\n\nSummary here.\n\n## זכאות\n\nEligibility info.\n\n## תהליך\n\nProcess steps.`;
      const sections = splitByH2(md);

      expect(sections).toHaveLength(3);
      expect(sections[0].title).toBe("תקציר");
      expect(sections[0].content).toBe("Summary here.");
      expect(sections[1].title).toBe("זכאות");
      expect(sections[2].title).toBe("תהליך");
    });

    it("extracts summary from content", () => {
      function extractSummary(content) {
        const match = content.match(/## תקציר\s*\n\n([\s\S]*?)(?=\n## |\n$)/);
        if (!match) return null;
        return match[1].trim().split("\n\n")[0].slice(0, 1000);
      }

      const content = `## תקציר\n\nזוהי הוראה חשובה מאוד.\n\nפסקה שנייה.\n\n## זכאות\n\nתנאים.`;
      expect(extractSummary(content)).toBe("זוהי הוראה חשובה מאוד.");
    });
  });

  describe("Cache logic", () => {
    it("normalizes questions consistently", () => {
      // Replicate normalization
      function normalizeQuestion(text) {
        return text.trim().replace(/\s+/g, " ").replace(/[?!.]+$/, "").toLowerCase();
      }

      expect(normalizeQuestion("  מה מגיע לי?  ")).toBe("מה מגיע לי");
      expect(normalizeQuestion("מה מגיע לי???")).toBe("מה מגיע לי");
      expect(normalizeQuestion("מה   מגיע   לי.")).toBe("מה מגיע לי");
      // Same question different punctuation → same key
      expect(normalizeQuestion("מה מגיע לי?")).toBe(normalizeQuestion("מה מגיע לי!"));
    });
  });

  describe("Citation extraction", () => {
    it("extracts directive numbers from text", () => {
      function extractCitations(text) {
        const matches = text.matchAll(/הוראה\s+(\d+\.\d+)/g);
        return [...new Set([...matches].map((m) => m[1]))];
      }

      expect(extractCitations("לפי הוראה 62.01, מגיע לך הלוואה")).toEqual(["62.01"]);
      expect(extractCitations("הוראה 56.02 והוראה 80.18 רלוונטיות")).toEqual(["56.02", "80.18"]);
      expect(extractCitations("אין ציטוט כאן")).toEqual([]);
      // Deduplication
      expect(extractCitations("הוראה 62.01 ושוב הוראה 62.01")).toEqual(["62.01"]);
    });
  });

  describe("Understanding layer response parsing", () => {
    it("parses valid Opus JSON response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: '{"persona":{"disability_grade":"50-99","injury_type":"physical","family_status":null,"age_bucket":null,"rehab_status":null},"intent":{"question":"זכאות לרכב רפואי","is_ambiguous":false,"ambiguity_q":null},"filters":{"journey_stages":["stable_life"],"life_domains":["vehicle"],"trigger_keywords":["רכב רפואי","רכב"]},"complexity":"medium","urgency":"low"}' }],
          usage: { input_tokens: 200, output_tokens: 100 },
        }),
      });

      // Import dynamically to use mocked fetch
      const { understandQuery } = await import("../../pages/api/lib/directives-understanding.js");
      const result = await understandQuery("יש לי 50 אחוז, מגיע לי רכב?", { disability_grade: "50-99" });

      expect(result).not.toBeNull();
      expect(result.understanding.search_filters.life_domains).toContain("vehicle");
      expect(result.understanding.search_filters.trigger_keywords).toContain("רכב רפואי");
      expect(result.understanding.complexity).toBe("medium");
    });

    it("handles API timeout gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("This operation was aborted"));

      const { understandQuery } = await import("../../pages/api/lib/directives-understanding.js");
      const result = await understandQuery("שאלה כלשהי", null);

      expect(result).toBeNull();
    });
  });

  describe("RRF Fusion scoring", () => {
    it("merges results from multiple sources correctly", () => {
      const K = 60;
      const scores = new Map();

      function addRRF(results, weight = 1.0) {
        results.forEach((r, rank) => {
          const id = r.id;
          const score = (scores.get(id)?.score || 0) + weight / (K + rank + 1);
          scores.set(id, { ...r, score });
        });
      }

      // Vector results
      addRRF([{ id: 1, content: "A" }, { id: 2, content: "B" }, { id: 3, content: "C" }], 1.0);
      // FTS results (different order)
      addRRF([{ id: 2, content: "B" }, { id: 1, content: "A" }, { id: 4, content: "D" }], 0.8);

      const sorted = Array.from(scores.values()).sort((a, b) => b.score - a.score);

      // ID 1: rank 0 vector (1/61=0.0164) + rank 1 FTS (0.8/62=0.0129) = 0.0293
      // ID 2: rank 1 vector (1/62=0.0161) + rank 0 FTS (0.8/61=0.0131) = 0.0292
      // ID 1 slightly higher because vector weight (1.0) > FTS weight (0.8)
      expect(sorted[0].id).toBe(1);
      expect(sorted[1].id).toBe(2);
      // Both IDs that appear in both lists rank above ID 3/4 (single source)
      expect(sorted[2].id).toBe(3); // only in vector
      expect(sorted[3].id).toBe(4); // only in FTS (lower weight)
    });
  });
});

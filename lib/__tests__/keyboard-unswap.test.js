import { describe, it, expect } from "vitest";
import { fixKeyboardLayout } from "../keyboard-unswap.js";

describe("fixKeyboardLayout", () => {
  it("converts Hebrew typed on English keyboard", () => {
    expect(fixKeyboardLayout("tbh huac gfahu gk vnjac")).toBe("אני יושב עכשיו על המחשב");
  });

  it("converts short Hebrew greeting", () => {
    // הי = v→ה h→י, שלום = a→ש k→ל u→ו o→ם
    expect(fixKeyboardLayout("vh akuo")).toBe("הי שלום");
  });

  it("leaves real English untouched", () => {
    expect(fixKeyboardLayout("Hello world")).toBe("Hello world");
    expect(fixKeyboardLayout("I need help with this")).toBe("I need help with this");
  });

  it("leaves Hebrew untouched", () => {
    expect(fixKeyboardLayout("מה שלומך")).toBe("מה שלומך");
  });

  it("leaves numbers untouched", () => {
    expect(fixKeyboardLayout("12345")).toBe("12345");
  });

  it("handles empty/short input", () => {
    expect(fixKeyboardLayout("")).toBe("");
    expect(fixKeyboardLayout("a")).toBe("a");
  });

  it("converts 'nv ndhg kh' (מה מגיע לי)", () => {
    expect(fixKeyboardLayout("nv ndhg kh")).toBe("מה מגיע לי");
  });

  it("converts 'tbh rumv ksgw' (אני רוצה לדעת)", () => {
    // אני = t→א b→נ h→י, רוצה = r→ר u→ו m→צ v→ה, לדעת = k→ל s→ד g→ע w→ת
    expect(fixKeyboardLayout("tbh rumv ksgw")).toBe("אני רוצה לדעת");
  });

  it("leaves URLs untouched", () => {
    expect(fixKeyboardLayout("https www com")).toBe("https www com");
  });

  it("handles mixed numbers and swapped text", () => {
    expect(fixKeyboardLayout("40 tjuz")).toBe("40 אחוז");
  });
});

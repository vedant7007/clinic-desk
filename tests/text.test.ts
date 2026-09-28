import { describe, expect, it } from "vitest";
import { displayText, isToday, problemFromComplaint, suggestProblem } from "@/lib/text";

describe("problemFromComplaint", () => {
  it.each([
    ["Dry cough again, now more than 3 months. Keeps him up at night.", "dry cough, more than 3 months"],
    ["Burning while passing urine for 2 days, going frequently. Says it feels like last time.", "burning while passing urine for 2 days"],
    ["Knee pain worse after the rains. A neighbour told her to take ibuprofen.", "knee pain worse after the rains"],
    ["UTI symptoms again", "UTI symptoms"],
    ["", ""],
  ])("%j -> %j", (complaint, expected) => expect(problemFromComplaint(complaint)).toBe(expected));
});

describe("suggestProblem", () => {
  it("prefers the brief's label and keeps acronyms", () => {
    expect(suggestProblem("Persistent dry cough on lisinopril.", "x")).toBe("persistent dry cough on lisinopril");
    expect(suggestProblem("ACE inhibitor cough", "x")).toBe("ACE inhibitor cough");
  });

  it("falls back to the complaint when the label is missing or rambling", () => {
    expect(suggestProblem("", "Dry cough again, now more than 3 months.")).toBe("dry cough, more than 3 months");
    expect(suggestProblem("a ".repeat(20), "Tiredness for 2 months.")).toBe("tiredness for 2 months");
  });
});

describe("displayText", () => {
  it("drops Hindsight's structured suffix", () => {
    expect(displayText("Ravi has a dry cough. | When: 2026-06-17 | Involving: Ravi")).toBe("Ravi has a dry cough.");
    expect(displayText("Plain fact")).toBe("Plain fact");
  });
});

describe("isToday", () => {
  const now = new Date(2026, 8, 28, 15, 0);
  it("compares calendar days", () => {
    expect(isToday(new Date(2026, 8, 28, 1, 0).toISOString(), now)).toBe(true);
    expect(isToday(new Date(2026, 8, 27, 23, 0).toISOString(), now)).toBe(false);
    expect(isToday(null, now)).toBe(false);
    expect(isToday("not a date", now)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/data/patients";
import { ageBand, anonymise } from "@/lib/memory";

const ravi = { id: "P001", name: "Ravi Kumar Reddy" };
const lakshmi = { id: "P006", name: "Lakshmi Iyer" };
const arjun = { id: "P005", name: "Arjun Mehta" };

describe("anonymise", () => {
  it.each([
    ["Ravi Kumar Reddy's cough resolved.", "the patient's cough resolved."],
    ["RAVI KUMAR REDDY improved", "the patient improved"],
    ["ravi kumar reddy improved", "the patient improved"],
    ["Mr. Reddy felt better", "the patient felt better"],
    ["mr reddy felt better", "the patient felt better"],
    ["R. K. Reddy improved", "the patient improved"],
    ["R K Reddy improved", "the patient improved"],
    ["Ravi K. Reddy improved", "the patient improved"],
    ["Kumar started a new regime", "the patient started a new regime"],
    ["Patient P001 follow-up", "the patient follow-up"],
  ])("removes %j", (input, expected) => {
    expect(anonymise(input, ravi)).toBe(expected);
  });

  it("handles Indian honorifics", () => {
    expect(anonymise("Smt. Lakshmi Iyer, knee better. Smt Iyer happy.", lakshmi)).toBe("the patient, knee better. the patient happy.");
    expect(anonymise("Shri Arjun Mehta is back at work", arjun)).toBe("the patient is back at work");
    expect(anonymise("Kumari lakshmi called", lakshmi)).toBe("the patient called");
  });

  it("strips phone numbers", () => {
    const out = anonymise("Call Ravi on 98480 12345 or +91-9848012345", ravi);
    expect(out).toBe("Call the patient on [number removed] or [number removed]");
  });

  it("does not swallow ordinary words that look like initials", () => {
    expect(anonymise("Arjun a lot better", arjun)).toBe("the patient a lot better");
    expect(anonymise("Ravishankar is a different person", ravi)).toBe("Ravishankar is a different person");
  });

  it("leaves other people, such as the doctor, alone", () => {
    expect(anonymise("Dr. Rao reviewed L. Iyer", lakshmi)).toBe("Dr. Rao reviewed the patient");
  });

  it("never leaves any part of any synthetic patient's name", () => {
    for (const p of PATIENTS) {
      const variants = [p.name, p.name.toUpperCase(), p.name.toLowerCase(), `Mr. ${p.name}`, `Smt. ${p.name}`, `${p.name}'s`];
      for (const v of variants) {
        const out = anonymise(`Case: ${v} improved on treatment. ${p.id}.`, p);
        for (const part of p.name.split(" ").filter((w) => w.length > 1)) {
          expect(out.toLowerCase()).not.toMatch(new RegExp(`\\b${part.toLowerCase()}\\b`));
        }
        expect(out).not.toContain(p.id);
      }
    }
  });
});

describe("ageBand", () => {
  it.each([
    [0, "0s"],
    [9, "0s"],
    [29, "20s"],
    [30, "30s"],
    [58, "50s"],
    [71, "70s"],
    [100, "100s"],
  ])("%i is %s", (age, band) => expect(ageBand(age)).toBe(band));
});

describe("anonymise keeps clinical numbers", () => {
  it("does not treat dates or readings as phone numbers", () => {
    const text = "Seen 2026-09-28, BP 138/88, HbA1c 8.2, INR 2.6, eGFR 78";
    expect(anonymise(text, ravi)).toBe(text);
  });
});

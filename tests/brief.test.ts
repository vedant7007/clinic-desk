import { describe, expect, it } from "vitest";
import { NOW_REF, groundBrief } from "@/lib/brief";
import type { Brief } from "@/lib/types";

const recalled = ["P1", "P2", "P3", "C1", "C2"].map((ref) => ({ ref }));

const brief = (over: Partial<Brief>): Brief => ({
  headline: "h",
  problem: "",
  flags: [],
  history: "",
  whatWorked: [],
  askThePatient: [],
  considerations: [],
  ...over,
});

describe("groundBrief", () => {
  it("drops refs that were never recalled and keeps real ones", () => {
    const out = groundBrief(
      brief({ flags: [{ severity: "critical", title: "Allergy", detail: "d", refs: ["P1", "P9", "C7", "X"] }] }),
      recalled
    );
    expect(out.flags[0].refs).toEqual(["P1"]);
  });

  it("normalises case and whitespace and removes duplicates", () => {
    const out = groundBrief(brief({ flags: [{ severity: "warning", title: "t", detail: "d", refs: [" p2", "P2", "c1 "] }] }), recalled);
    expect(out.flags[0].refs).toEqual(["P2", "C1"]);
  });

  it("drops critical and warning flags left with no valid citation", () => {
    const out = groundBrief(
      brief({
        flags: [
          { severity: "critical", title: "Invented allergy", detail: "d", refs: ["P42"] },
          { severity: "warning", title: "Uncited", detail: "d", refs: [] },
          { severity: "info", title: "Context", detail: "d", refs: [] },
        ],
      }),
      recalled
    );
    expect(out.flags.map((f) => f.title)).toEqual(["Context"]);
  });

  it("accepts NOW as a citation of today's complaint", () => {
    const out = groundBrief(brief({ flags: [{ severity: "critical", title: "Red flag", detail: "d", refs: [NOW_REF, "P77"] }] }), []);
    expect(out.flags).toHaveLength(1);
    expect(out.flags[0].refs).toEqual([NOW_REF]);
  });

  it("keeps a 'what worked' finding only when it cites clinic memory", () => {
    const out = groundBrief(
      brief({
        whatWorked: [
          { finding: "ARB switch", refs: ["C1", "C2"] },
          { finding: "patient-only", refs: ["P1"] },
          { finding: "made up", refs: ["C9"] },
        ],
      }),
      recalled
    );
    expect(out.whatWorked).toEqual([{ finding: "ARB switch", refs: ["C1", "C2"] }]);
  });

  it("with no memories, nothing from memory can be cited", () => {
    const out = groundBrief(
      brief({
        flags: [{ severity: "critical", title: "Penicillin allergy", detail: "d", refs: ["P1"] }],
        whatWorked: [{ finding: "x", refs: ["C1"] }],
      }),
      []
    );
    expect(out.flags).toEqual([]);
    expect(out.whatWorked).toEqual([]);
  });
});

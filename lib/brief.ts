import { z } from "zod";
import { PRIMARY_MODEL, completeJson } from "./llm";
import { recallClinic, recallPatient } from "./memory";
import type { Brief, BriefResult, MemoryItem, Patient } from "./types";

const BriefSchema = z.object({
  headline: z.string().trim().min(1),
  problem: z.string().default(""),
  flags: z
    .array(
      z.object({
        severity: z.enum(["critical", "warning", "info"]).catch("info"),
        title: z.string(),
        detail: z.string(),
        refs: z.array(z.string()).default([]),
      })
    )
    .default([]),
  history: z.string().default(""),
  whatWorked: z.array(z.object({ finding: z.string(), refs: z.array(z.string()).default([]) })).default([]),
  askThePatient: z.array(z.string()).default([]),
  considerations: z.array(z.string()).default([]),
});

const SYSTEM = `You are Clinic Desk, a pre-consultation assistant for a family doctor in India.
You prepare a short brief the doctor reads in 20 seconds before the patient walks in.
You support the doctor's judgement. You never give a final diagnosis and never state drug doses.

Rules:
- Use ONLY the memories provided and today's complaint. Never invent history, dates, drugs, allergies or case counts.
- Every flag and every "whatWorked" finding must cite the refs it came from (e.g. ["P2","C4"]). Cite "NOW" for a fact taken from today's complaint.
- A flag you cannot cite is not written.
- CRITICAL flags: allergy or drug-reaction conflicts with what is being asked for or likely to be prescribed, dangerous interactions, red-flag symptoms.
- WARNING flags: a treatment that already failed, a medicine started before the complaint began that is a known cause of it (compare the dates), repeat visits for the same problem, missed follow-ups.
- INFO flags: useful context (chronic conditions, preferences).
- "whatWorked" is ONLY from clinic memories (C refs): say how many similar cases and what happened.
- If PATIENT MEMORY is (none), this is a first visit: say so, write no flag about the patient's past history, allergies or medicines, and keep guidance generic and cautious.
- Keep every string short and concrete. No filler. No drug doses. No final diagnosis.

Return JSON exactly in this shape:
{"headline": string (one line, max 20 words),
 "problem": string (3 to 8 word clinical problem label for today's visit, e.g. "persistent dry cough on lisinopril"; descriptive, not a diagnosis),
 "flags": [{"severity":"critical"|"warning"|"info","title":string,"detail":string,"refs":[string]}],
 "history": string (2-3 sentences, dated timeline),
 "whatWorked": [{"finding":string,"refs":[string]}],
 "askThePatient": [string] (2-4 questions),
 "considerations": [string] (2-4 points for the doctor to consider)}`;

function formatMemories(items: MemoryItem[]): string {
  if (items.length === 0) return "(none)";
  return items
    .map((m) => `[${m.ref}]${m.date ? ` (${m.date.slice(0, 10)})` : ""} ${m.text}`)
    .join("\n");
}

function patientLine(p: Patient) {
  return `${p.name}, ${p.age}${p.sex}`;
}

async function draftBrief(
  patient: Patient,
  complaint: string,
  patientMem: MemoryItem[],
  clinicMem: MemoryItem[]
): Promise<{ brief: Brief; model: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const user = `Today is ${today}.
Patient: ${patientLine(patient)}
Today's complaint (from reception): "${complaint}"

PATIENT MEMORY (this patient's own chart):
${formatMemories(patientMem)}

CLINIC MEMORY (anonymised outcomes from similar cases in this practice):
${formatMemories(clinicMem)}

Write the brief.`;
  const { data, model } = await completeJson(SYSTEM, user, BriefSchema);
  return { model, brief: groundBrief(data, [...patientMem, ...clinicMem]) };
}

/** Ref for a fact stated in today's complaint rather than recalled from memory. */
export const NOW_REF = "NOW";

/**
 * Keep the brief honest:
 *  - drop any citation that is not in the recalled set (the model made it up)
 *  - drop critical/warning flags left with no citation, since nothing supports them
 *  - drop "what worked" findings that do not cite clinic memory
 */
export function groundBrief(brief: Brief, memories: Pick<MemoryItem, "ref">[]): Brief {
  const known = new Set([NOW_REF, ...memories.map((m) => m.ref)]);
  const clean = (refs: string[]) => Array.from(new Set(refs.map((r) => r.trim().toUpperCase()))).filter((r) => known.has(r));
  return {
    ...brief,
    flags: brief.flags
      .map((f) => ({ ...f, refs: clean(f.refs) }))
      .filter((f) => f.severity === "info" || f.refs.length > 0),
    whatWorked: brief.whatWorked
      .map((w) => ({ ...w, refs: clean(w.refs) }))
      .filter((w) => w.refs.some((r) => r.startsWith("C"))),
  };
}

/**
 * The agent loop for one consultation:
 *   1. recall this patient's chart (scoped by tag)
 *   2. recall the clinic's anonymised outcomes for similar cases
 *   3. reason over BOTH plus today's complaint
 * Optionally runs the same prompt with no memory at all, for the side-by-side comparison.
 */
export async function buildBrief(patient: Patient, complaint: string, compare: boolean): Promise<BriefResult> {
  const t0 = Date.now();
  const [p, c] = await Promise.all([recallPatient(patient, complaint), recallClinic(complaint)]);
  const patientMem: MemoryItem[] = p.map((m, i) => ({ ...m, ref: `P${i + 1}` }));
  const clinicMem: MemoryItem[] = c.map((m, i) => ({ ...m, ref: `C${i + 1}` }));
  const recallMs = Date.now() - t0;

  const t1 = Date.now();
  const [withMem, withoutMem] = await Promise.all([
    draftBrief(patient, complaint, patientMem, clinicMem),
    compare ? draftBrief(patient, complaint, [], []) : Promise.resolve(null),
  ]);
  const llmMs = Date.now() - t1;

  return {
    withMemory: withMem.brief,
    withoutMemory: withoutMem?.brief ?? null,
    memories: [...patientMem, ...clinicMem],
    timings: { recallMs, llmMs },
    model: withMem.model,
    fallbackUsed: withMem.model !== PRIMARY_MODEL(),
  };
}

/**
 * End-to-end smoke test against your real Hindsight + Groq accounts.
 *   npm run check            (uses Ravi, the ACE-inhibitor cough case)
 *   npm run check -- P004    (any patient id)
 *
 * Fails (exit 1) when:
 *  - a recalled patient memory is not tagged to this patient, or mentions another patient by name
 *  - the brief misses a seeded safety fact (see EXPECT)
 *  - a new patient's brief invents history
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PATIENTS, getPatient } from "../data/patients";
import { PATIENT_HISTORY } from "../data/seed-memories";
import { buildBrief } from "../lib/brief";
import { patientTag } from "../lib/memory";
import type { Brief, Patient } from "../lib/types";

/** Ground truth from data/seed-memories.ts: each pattern must appear in a critical or warning flag. */
const EXPECT: Record<string, { label: string; pattern: RegExp }[]> = {
  P001: [
    { label: "penicillin allergy", pattern: /penicillin|amoxicillin/i },
    { label: "cough after lisinopril", pattern: /lisinopril|ACE/i },
    { label: "azithromycin failed", pattern: /azithromycin|antibiotic/i },
  ],
  P004: [
    { label: "sulfa allergy", pattern: /sulf|co-trimoxazole/i },
    { label: "ciprofloxacin resistance", pattern: /ciprofloxacin/i },
  ],
  P006: [
    { label: "warfarin", pattern: /warfarin|anticoagul/i },
    { label: "ibuprofen bleeding history", pattern: /ibuprofen|NSAID/i },
  ],
};

/** Name parts of every other patient, matched as whole words. */
function otherNames(patient: Patient): RegExp[] {
  const own = new Set(patient.name.toLowerCase().split(/\s+/));
  return PATIENTS.filter((p) => p.id !== patient.id)
    .flatMap((p) => p.name.split(/\s+/))
    .filter((part) => part.length > 2 && !own.has(part.toLowerCase()))
    .map((part) => new RegExp(`\\b${part}\\b`, "i"));
}

const flagText = (b: Brief) =>
  b.flags.filter((f) => f.severity !== "info").map((f) => `${f.title} ${f.detail}`).join("\n");

async function main() {
  const id = process.argv[2] ?? "P001";
  const patient = getPatient(id);
  if (!patient) throw new Error(`Unknown patient id ${id}`);
  const failures: string[] = [];

  console.log(`Patient: ${patient.name}\nComplaint: ${patient.todayComplaint}\n`);
  const r = await buildBrief(patient, patient.todayComplaint, true);
  const mine = r.memories.filter((m) => m.source === "patient");
  const clinic = r.memories.filter((m) => m.source === "clinic");

  console.log(`Recalled ${mine.length} patient memories and ${clinic.length} clinic memories in ${r.timings.recallMs} ms`);
  for (const m of r.memories) console.log(`  [${m.ref}] ${m.date?.slice(0, 10) ?? "          "} ${m.text.slice(0, 110)}`);

  // a) isolation
  const names = otherNames(patient);
  for (const m of mine) {
    if (!m.tags.includes(patientTag(patient.id))) failures.push(`${m.ref} is not tagged ${patientTag(patient.id)}`);
    const other = m.tags.find((t) => t.startsWith("patient:") && t !== patientTag(patient.id));
    if (other) failures.push(`${m.ref} carries another patient's tag ${other}`);
    const leak = names.find((re) => re.test(m.text));
    if (leak) failures.push(`${m.ref} mentions another patient (${leak.source}): ${m.text.slice(0, 80)}`);
  }

  console.log(`\n=== WITHOUT MEMORY ===\n${r.withoutMemory?.headline}`);
  r.withoutMemory?.considerations.forEach((c) => console.log(`  - ${c}`));

  console.log(`\n=== WITH MEMORY (${r.model}, recall ${r.timings.recallMs} ms, reasoning ${r.timings.llmMs} ms) ===\n${r.withMemory.headline}`);
  r.withMemory.flags.forEach((f) => console.log(`  [${f.severity.toUpperCase()}] ${f.title}: ${f.detail} ${f.refs.join(",")}`));
  r.withMemory.whatWorked.forEach((w) => console.log(`  worked: ${w.finding} ${w.refs.join(",")}`));
  console.log(`  history: ${r.withMemory.history}`);

  // c) ground truth
  const flags = flagText(r.withMemory);
  for (const e of EXPECT[patient.id] ?? []) {
    if (!e.pattern.test(flags)) failures.push(`brief is missing the "${e.label}" flag`);
  }
  if (mine.length === 0) {
    const inventedRefs = r.withMemory.flags.some((f) => f.refs.some((ref) => ref.startsWith("P")));
    if (inventedRefs) failures.push("new patient brief cites patient memory that does not exist");
    if (r.withMemory.flags.some((f) => f.severity === "critical" && !f.refs.includes("NOW"))) {
      failures.push("new patient brief raised a critical flag with no basis in today's complaint");
    }
    if (/allerg|previous(ly)? (prescribed|treated)|history of/i.test(flags)) {
      failures.push("new patient brief invents history");
    }
  }
  if ((PATIENT_HISTORY[patient.id] ?? []).length > 0 && mine.length === 0) {
    failures.push("no patient memories recalled. Did `npm run seed` finish?");
  }

  if (failures.length) {
    console.error(`\nFAIL (${failures.length})`);
    failures.forEach((f) => console.error(`  x ${f}`));
    process.exit(1);
  }
  console.log(`\nPASS: isolation ok, ${EXPECT[patient.id]?.length ?? 0} ground-truth flags found`);
}

main().catch((err) => {
  console.error("Check failed:", err?.message ?? err);
  process.exit(1);
});

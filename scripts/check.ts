/**
 * End-to-end smoke test against your real Hindsight + Groq accounts.
 *   npm run check            (uses Ravi, the ACE-inhibitor cough case)
 *   npm run check -- P004    (any patient id)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { getPatient } from "../data/patients";
import { buildBrief } from "../lib/brief";

async function main() {
  const id = process.argv[2] ?? "P001";
  const patient = getPatient(id);
  if (!patient) throw new Error(`Unknown patient id ${id}`);

  console.log(`Patient: ${patient.name}\nComplaint: ${patient.todayComplaint}\n`);
  const r = await buildBrief(patient, patient.todayComplaint, true);

  console.log(`Recalled ${r.memories.filter((m) => m.source === "patient").length} patient memories and ${r.memories.filter((m) => m.source === "clinic").length} clinic memories in ${r.timings.recallMs} ms`);
  for (const m of r.memories) console.log(`  [${m.ref}] ${m.text.slice(0, 110)}`);

  console.log(`\n=== WITHOUT MEMORY ===\n${r.withoutMemory?.headline}`);
  r.withoutMemory?.considerations.forEach((c) => console.log(`  - ${c}`));

  console.log(`\n=== WITH MEMORY (${r.model}, ${r.timings.llmMs} ms) ===\n${r.withMemory.headline}`);
  r.withMemory.flags.forEach((f) => console.log(`  [${f.severity.toUpperCase()}] ${f.title}: ${f.detail} ${f.refs.join(",")}`));
  r.withMemory.whatWorked.forEach((w) => console.log(`  worked: ${w.finding} ${w.refs.join(",")}`));

  if (r.memories.length === 0) {
    console.warn("\n⚠ No memories recalled. Did `npm run seed` finish? With --async, wait a minute and retry.");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Check failed:", err?.message ?? err);
  process.exit(1);
});

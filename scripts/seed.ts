/**
 * Loads the demo practice into Hindsight.
 *   npm run seed            (waits for extraction to finish, recommended)
 *   npm run seed -- --async (queues work and returns immediately)
 *
 * Safe to re-run: every batch uses a stable document id, so re-seeding
 * replaces the same documents instead of duplicating memories.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { CLINIC_BANK, PATIENT_BANK, ensureBanks, getHindsight } from "../lib/hindsight";
import { patientTag } from "../lib/memory";
import { PATIENTS } from "../data/patients";
import { CLINIC_CASES, PATIENT_HISTORY } from "../data/seed-memories";

const runAsync = process.argv.includes("--async");

async function main() {
  const hs = getHindsight();
  console.log(`Hindsight: ${process.env.HINDSIGHT_BASE_URL}`);
  console.log(`Banks: ${PATIENT_BANK} (patients), ${CLINIC_BANK} (clinic)\n`);

  await ensureBanks();
  console.log("✓ banks ready (missions set)");

  for (const p of PATIENTS) {
    const history = PATIENT_HISTORY[p.id] ?? [];
    if (history.length === 0) {
      console.log(`- ${p.id} ${p.name}: no history (new patient)`);
      continue;
    }
    const t = Date.now();
    await hs.retainBatch(
      PATIENT_BANK,
      history.map((h) => ({
        content: h.text,
        timestamp: `${h.date}T10:00:00Z`,
        context: h.context,
        tags: [patientTag(p.id), "seed"],
        metadata: { patient_id: p.id, kind: "history" },
      })),
      { documentId: `seed-${p.id}`, documentTags: [patientTag(p.id)], async: runAsync }
    );
    console.log(`✓ ${p.id} ${p.name}: ${history.length} memories (${Date.now() - t} ms)`);
  }

  const t = Date.now();
  await hs.retainBatch(
    CLINIC_BANK,
    CLINIC_CASES.map((c) => ({
      content: c.text,
      timestamp: `${c.date}T10:00:00Z`,
      context: c.context,
      tags: ["outcome", "seed"],
      metadata: { kind: "case_outcome" },
    })),
    { documentId: "seed-clinic-cases", async: runAsync }
  );
  console.log(`✓ clinic: ${CLINIC_CASES.length} anonymised case outcomes (${Date.now() - t} ms)`);

  console.log(
    runAsync
      ? "\nQueued. Give Hindsight a minute to extract facts and build observations, then run `npm run check`."
      : "\nDone. Run `npm run check` to verify recall, then `npm run dev`."
  );
}

main().catch((err) => {
  console.error("\nSeed failed:", err?.message ?? err);
  if (err?.details) console.error(err.details);
  process.exit(1);
});

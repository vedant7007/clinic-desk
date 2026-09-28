/**
 * Loads the demo practice into Hindsight.
 *   npm run seed            (retains synchronously, then waits for consolidation)
 *   npm run seed -- --async (queues extraction on the server, then waits for it)
 *
 * Either way the script only exits once both banks report no pending work, so
 * `npm run check` never runs against half-built memory.
 *
 * Safe to re-run: every batch uses a stable document id, so re-seeding
 * replaces the same documents instead of duplicating memories.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { CLINIC_BANK, PATIENT_BANK, bankStats, ensureBanks, getHindsight } from "../lib/hindsight";
import { patientTag } from "../lib/memory";
import { PATIENTS } from "../data/patients";
import { CLINIC_CASES, PATIENT_HISTORY } from "../data/seed-memories";

const runAsync = process.argv.includes("--async");
const WAIT_TIMEOUT_MS = 5 * 60_000;
const POLL_MS = 3_000;

/** Poll bank stats until extraction and observation consolidation are done. */
async function waitUntilIdle(bankIds: string[]) {
  const started = Date.now();
  for (;;) {
    const stats = await Promise.all(bankIds.map((id) => bankStats(id)));
    const pending = stats.map((s) => s.pending_operations + (s.pending_consolidation ?? 0));
    const failed = stats.reduce((n, s) => n + s.failed_operations, 0);
    const line = stats.map((s, i) => `${s.bank_id}: ${s.total_nodes} memories, ${pending[i]} pending`).join(" | ");
    if (pending.every((n) => n === 0)) {
      console.log(`✓ memory ready  ${line}${failed ? `  (${failed} failed operations, see the Hindsight UI)` : ""}`);
      return;
    }
    if (Date.now() - started > WAIT_TIMEOUT_MS) {
      console.warn(`! still processing after ${WAIT_TIMEOUT_MS / 60_000} min: ${line}. Run \`npm run check\` a little later.`);
      return;
    }
    console.log(`… ${line}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

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

  console.log("\nWaiting for Hindsight to finish extracting facts and consolidating observations...");
  await waitUntilIdle([PATIENT_BANK, CLINIC_BANK]);
  console.log("\nDone. Run `npm run check` to verify recall, then `npm run dev`.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err?.message ?? err);
  if (err?.details) console.error(err.details);
  process.exit(1);
});

/**
 * Data consistency audit of the synthetic practice, against live Hindsight.
 *   npm run audit
 *
 * Checks the invariants the UI depends on, and fails (exit 1) on any violation:
 *  - every count the UI shows can be derived from one source of truth
 *  - occurred_start <= mentioned_at (a fact cannot happen after it was learned)
 *  - no date is in the future
 *  - every patient-bank memory carries exactly one patient tag and no other patient's name
 *  - every clinic-bank memory is anonymised and carries a valid outcome category
 *  - the seed dataset itself is internally consistent (dates, ages, duplicates)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { CLINIC_BANK, PATIENT_BANK, type MemoryUnit, bankStats, listBankMemories } from "../lib/hindsight";
import { OUTCOME_VALUES, clinicCases, outcomeOf } from "../lib/analytics";
import { PATIENTS, getPatient } from "../data/patients";
import { CLINIC_CASES, PATIENT_HISTORY } from "../data/seed-memories";
import type { Outcome } from "../lib/types";

const problems: string[] = [];
const fail = (s: string) => problems.push(s);
const say = (s: string) => console.log(s);

const LIST_LIMIT = 1000;
const today = new Date().toISOString().slice(0, 10);

const dateOf = (m: MemoryUnit) => m.occurred_start ?? null;
const learnedOf = (m: MemoryUnit) => m.mentioned_at ?? null;
const isFact = (m: MemoryUnit) => m.fact_type !== "observation" && Boolean(m.text);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

async function main() {
  say(`Auditing ${process.env.HINDSIGHT_BASE_URL}\n`);

  // ---------------------------------------------------------------- inventory
  const [pStats, cStats] = await Promise.all([bankStats(PATIENT_BANK), bankStats(CLINIC_BANK)]);
  const [pAll, cAll] = await Promise.all([
    listBankMemories(PATIENT_BANK, { limit: LIST_LIMIT }),
    listBankMemories(CLINIC_BANK, { limit: LIST_LIMIT }),
  ]);
  const pFacts = pAll.items.filter(isFact);
  const cFacts = cAll.items.filter(isFact);
  const pObs = pAll.items.length - pFacts.length;
  const cObs = cAll.items.length - cFacts.length;

  say("== INVENTORY ==");
  say(`patient bank : ${pStats.total_nodes} nodes = ${pFacts.length} facts + ${pObs} observations (listed ${pAll.items.length}/${pAll.total})`);
  say(`clinic  bank : ${cStats.total_nodes} nodes = ${cFacts.length} facts + ${cObs} observations (listed ${cAll.items.length}/${cAll.total})`);
  say(`seed source  : ${Object.values(PATIENT_HISTORY).flat().length} patient entries, ${CLINIC_CASES.length} clinic cases`);
  if (pAll.items.length < pAll.total) fail(`patient listing truncated: got ${pAll.items.length} of ${pAll.total}`);
  if (cAll.items.length < cAll.total) fail(`clinic listing truncated: got ${cAll.items.length} of ${cAll.total}`);
  if (pStats.total_nodes !== pAll.items.length) fail(`patient stats say ${pStats.total_nodes} nodes but listing returned ${pAll.items.length}`);
  if (cStats.total_nodes !== cAll.items.length) fail(`clinic stats say ${cStats.total_nodes} nodes but listing returned ${cAll.items.length}`);

  // ------------------------------------------------------------------- dates
  say("\n== DATES ==");
  let backwards = 0;
  let future = 0;
  for (const [bank, items] of [["patient", pAll.items], ["clinic", cAll.items]] as [string, MemoryUnit[]][]) {
    for (const m of items) {
      const occurred = day(dateOf(m));
      const learned = day(learnedOf(m));
      if (occurred && learned && occurred > learned) {
        backwards++;
        fail(`${bank}/${m.id}: occurred ${occurred} is after learned ${learned} — "${(m.text ?? "").slice(0, 70)}"`);
      }
      for (const [label, d] of [["occurred", occurred], ["learned", learned]] as [string, string | null][]) {
        if (d && d > today) {
          future++;
          fail(`${bank}/${m.id}: ${label} date ${d} is in the future — "${(m.text ?? "").slice(0, 70)}"`);
        }
      }
    }
  }
  say(`occurred > learned : ${backwards}`);
  say(`dates after ${today} : ${future}`);

  // ------------------------------------------------------- patient isolation
  say("\n== PATIENT ISOLATION ==");
  const nameParts = new Map<string, string[]>();
  for (const p of PATIENTS) nameParts.set(p.id, p.name.split(/\s+/).filter((w) => w.length > 2));
  let untagged = 0;
  let multiTagged = 0;
  let leaks = 0;
  for (const m of pFacts) {
    const tags = m.tags ?? [];
    const own = tags.filter((t) => t.startsWith("patient:"));
    if (own.length === 0) {
      untagged++;
      fail(`patient/${m.id}: no patient tag — "${(m.text ?? "").slice(0, 70)}"`);
      continue;
    }
    if (own.length > 1) {
      multiTagged++;
      fail(`patient/${m.id}: carries ${own.length} patient tags (${own.join(", ")})`);
    }
    const id = own[0].slice("patient:".length);
    if (!getPatient(id)) fail(`patient/${m.id}: tag references unknown patient ${id}`);
    for (const other of PATIENTS) {
      if (other.id === id) continue;
      const mine = new Set((nameParts.get(id) ?? []).map((w) => w.toLowerCase()));
      for (const part of nameParts.get(other.id) ?? []) {
        if (mine.has(part.toLowerCase())) continue;
        if (new RegExp(`\\b${part}\\b`, "i").test(m.text ?? "")) {
          leaks++;
          fail(`patient/${m.id} (tagged ${id}) mentions ${other.id}'s name "${part}"`);
        }
      }
    }
  }
  say(`facts without a patient tag : ${untagged}`);
  say(`facts with several tags     : ${multiTagged}`);
  say(`cross-patient name leaks    : ${leaks}`);

  // ------------------------------------------------- clinic bank: outcomes
  say("\n== CLINIC OUTCOMES ==");
  const byOutcome: Record<string, number> = { resolved: 0, improved: 0, no_change: 0, worse: 0, untagged: 0 };
  for (const m of cFacts) {
    const o = outcomeOf(m.tags ?? []);
    byOutcome[o ?? "untagged"]++;
  }
  say(`clinic facts       : ${cFacts.length}`);
  for (const o of OUTCOME_VALUES) say(`  ${o.padEnd(10)}: ${byOutcome[o]}`);
  say(`  ${"untagged".padEnd(10)}: ${byOutcome.untagged}`);
  const categorised = OUTCOME_VALUES.reduce((n, o) => n + byOutcome[o], 0);
  if (categorised !== cFacts.length) {
    fail(`${byOutcome.untagged} of ${cFacts.length} clinic facts carry no outcome:<value> tag, so the distribution cannot sum to the total`);
  }

  // The UI counts cases (documents), not facts. Rebuild them exactly as the app does
  // and check they match the seed source one-for-one, category by category.
  const cases = clinicCases(cFacts.map((m) => ({
    id: m.id,
    documentId: m.document_id ?? null,
    source: "clinic" as const,
    text: m.text ?? "",
    type: m.fact_type ?? "world",
    date: m.occurred_start ?? null,
    learnedAt: m.mentioned_at ?? null,
    tags: m.tags ?? [],
    kind: "case" as const,
    patientId: null,
    outcome: outcomeOf(m.tags ?? []),
  })));
  const caseTally: Record<string, number> = { resolved: 0, improved: 0, no_change: 0, worse: 0, untagged: 0 };
  for (const c of cases) caseTally[c.outcome ?? "untagged"]++;
  const seedTally: Record<string, number> = { resolved: 0, improved: 0, no_change: 0, worse: 0, untagged: 0 };
  for (const c of CLINIC_CASES) seedTally[c.outcome]++;
  say(`clinic cases       : ${cases.length} (seed source has ${CLINIC_CASES.length}; live outcomes recorded in Consult add to this)`);
  for (const o of [...OUTCOME_VALUES, "untagged"]) say(`  ${o.padEnd(10)}: ${caseTally[o]} (seed ${seedTally[o]})`);
  if (caseTally.untagged > 0) fail(`${caseTally.untagged} clinic cases carry no outcome category`);
  for (const o of OUTCOME_VALUES) {
    if (caseTally[o] < seedTally[o]) fail(`only ${caseTally[o]} ${o} cases in Hindsight but the seed source has ${seedTally[o]}`);
  }
  if (cases.length < CLINIC_CASES.length) fail(`only ${cases.length} clinic cases in Hindsight but the seed source has ${CLINIC_CASES.length}`);

  // ------------------------------------------- clinic bank: anonymisation
  say("\n== CLINIC ANONYMISATION ==");
  let identified = 0;
  for (const m of cFacts) {
    const text = m.text ?? "";
    for (const p of PATIENTS) {
      for (const part of p.name.split(/\s+/).filter((w) => w.length > 2)) {
        if (new RegExp(`\\b${part}\\b`, "i").test(text)) {
          identified++;
          fail(`clinic/${m.id} names a patient ("${part}") — "${text.slice(0, 70)}"`);
        }
      }
      if (new RegExp(`\\b${p.id}\\b`).test(text)) {
        identified++;
        fail(`clinic/${m.id} contains patient id ${p.id}`);
      }
    }
    if ((m.tags ?? []).some((t) => t.startsWith("patient:"))) {
      identified++;
      fail(`clinic/${m.id} carries a patient tag`);
    }
  }
  say(`identifying clinic memories : ${identified}`);

  // ------------------------------------------------------ seed source data
  say("\n== SEED DATASET ==");
  let seedIssues = 0;
  const seen = new Map<string, string>();
  for (const [id, entries] of Object.entries(PATIENT_HISTORY)) {
    const patient = getPatient(id);
    if (!patient) {
      fail(`seed: PATIENT_HISTORY has entries for unknown patient ${id}`);
      seedIssues++;
      continue;
    }
    for (const e of entries) {
      if (e.date > today) {
        fail(`seed ${id}: entry dated ${e.date} is in the future`);
        seedIssues++;
      }
      // A record cannot predate the patient's birth: age is as of today.
      const bornAfter = new Date().getFullYear() - patient.age;
      if (Number(e.date.slice(0, 4)) < bornAfter) {
        fail(`seed ${id}: entry dated ${e.date} predates a ${patient.age}-year-old's birth (~${bornAfter})`);
        seedIssues++;
      }
      const key = `${id}|${e.text.trim().toLowerCase()}`;
      if (seen.has(key)) {
        fail(`seed ${id}: duplicate entry "${e.text.slice(0, 60)}"`);
        seedIssues++;
      }
      seen.set(key, id);
      // The patient the entry is filed under must be the one it names.
      for (const other of PATIENTS) {
        if (other.id === id) continue;
        const mine = new Set(patient.name.split(/\s+/).map((w) => w.toLowerCase()));
        for (const part of other.name.split(/\s+/).filter((w) => w.length > 2)) {
          if (mine.has(part.toLowerCase())) continue;
          if (new RegExp(`\\b${part}\\b`, "i").test(e.text)) {
            fail(`seed ${id}: entry names ${other.id} ("${part}")`);
            seedIssues++;
          }
        }
      }
      // A note that states its own visit date must agree with the entry date.
      const stated = e.text.match(/(?:Visit|Follow-up|Lab result|Urine culture)[^.]*?(\d{4}-\d{2}-\d{2})/);
      if (stated && stated[1] !== e.date) {
        fail(`seed ${id}: entry dated ${e.date} but its text says ${stated[1]}`);
        seedIssues++;
      }
    }
  }
  const clinicSeen = new Set<string>();
  for (const c of CLINIC_CASES) {
    if (c.date > today) {
      fail(`seed clinic: case dated ${c.date} is in the future`);
      seedIssues++;
    }
    const key = c.text.trim().toLowerCase();
    if (clinicSeen.has(key)) {
      fail(`seed clinic: duplicate case "${c.text.slice(0, 60)}"`);
      seedIssues++;
    }
    clinicSeen.add(key);
    for (const p of PATIENTS) {
      for (const part of p.name.split(/\s+/).filter((w) => w.length > 2)) {
        if (new RegExp(`\\b${part}\\b`, "i").test(c.text)) {
          fail(`seed clinic: case names ${p.id} ("${part}")`);
          seedIssues++;
        }
      }
    }
    const outcome = (c as { outcome?: Outcome }).outcome;
    if (!outcome || !OUTCOME_VALUES.includes(outcome)) {
      fail(`seed clinic: case dated ${c.date} has no valid outcome category`);
      seedIssues++;
    }
  }
  say(`seed entries checked : ${Object.values(PATIENT_HISTORY).flat().length + CLINIC_CASES.length}`);
  say(`seed issues          : ${seedIssues}`);

  // ------------------------------------------------------------------ verdict
  if (problems.length) {
    console.log(`\nFAIL — ${problems.length} problem(s):`);
    problems.forEach((p) => console.log(`  x ${p}`));
    process.exit(1);
  }
  console.log("\nPASS — no data inconsistencies found.");
}

main().catch((err) => {
  console.error("Audit failed:", err?.message ?? err);
  process.exit(1);
});

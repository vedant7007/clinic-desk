import type { RecallResult } from "@vectorize-io/hindsight-client";
import { CLINIC_BANK, PATIENT_BANK, getHindsight } from "./hindsight";
import type { MemoryItem, MemorySource, Outcome, Patient } from "./types";

export const patientTag = (id: string) => `patient:${id}`;

const OUTCOME_LABEL: Record<Outcome, string> = {
  resolved: "fully resolved",
  improved: "partly improved",
  no_change: "no change",
  worse: "got worse",
};

function toItems(results: RecallResult[], source: MemorySource): Omit<MemoryItem, "ref">[] {
  return results.map((r) => ({
    id: r.id,
    source,
    text: r.text,
    type: r.type ?? "world",
    date: r.occurred_start ?? r.mentioned_at ?? null,
    tags: r.tags ?? [],
  }));
}

function dedupe<T extends { id: string; text: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((m) => {
    const key = m.id || m.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const byDate = (a: { date: string | null }, b: { date: string | null }) =>
  (a.date ?? "").localeCompare(b.date ?? "");

/** Tag scope for one patient. `any_strict` also excludes untagged memories. */
export const patientScope = (id: string) => ({ tags: [patientTag(id)], tagsMatch: "any_strict" as const });

const SAFETY_LIMIT = 10;
const COMPLAINT_LIMIT = 14;

/**
 * Recall everything relevant about ONE patient.
 * Two queries run in parallel: one shaped by today's complaint, one that always
 * pulls safety-critical context (allergies, medicines started or stopped, chronic
 * conditions), because those must surface even when they look unrelated to the
 * complaint. A drug started weeks ago is exactly what a complaint-only query ranks last.
 * Safety results are merged first so they survive the cap, then the chart is sorted by date.
 */
export async function recallPatient(patient: Patient, complaint: string) {
  const hs = getHindsight();
  const scope = patientScope(patient.id);
  const [byComplaint, safety] = await Promise.all([
    hs.recall(PATIENT_BANK, `${patient.name}: ${complaint.trim().replace(/[.\s]+$/, "")}. Previous visits, treatments tried, and results.`, {
      ...scope,
      budget: "mid",
      maxTokens: 2500,
    }),
    hs.recall(
      PATIENT_BANK,
      `${patient.name}: allergies and drug reactions, every medicine started or stopped and when, long-term conditions, bad reactions to past treatment`,
      { ...scope, budget: "mid", maxTokens: 1500 }
    ),
  ]);
  return dedupe([
    ...toItems(safety.results.slice(0, SAFETY_LIMIT), "patient"),
    ...toItems(byComplaint.results.slice(0, COMPLAINT_LIMIT), "patient"),
  ]).sort(byDate);
}

// ponytail: fixed relative cut-off; tune if clinic memory grows to thousands of cases.
const CLINIC_RELATIVE = 0.1;
const CLINIC_LIMIT = 8;

/**
 * Keep results scoring within a fraction of the best one. Reranker scores are not
 * calibrated across queries, so the cut-off is relative, never absolute.
 * Results without scores are kept.
 */
export function relevant<T extends { scores?: { final: number } | null }>(results: T[]): T[] {
  const top = Math.max(0, ...results.map((r) => r.scores?.final ?? 0));
  return results.filter((r) => r.scores == null || r.scores.final >= top * CLINIC_RELATIVE);
}

/**
 * Recall anonymised outcomes from similar cases across the clinic.
 * The query is the complaint alone: adding age and sex made the reranker favour
 * unrelated cases of the same age band. Each case carries its own age band, so the
 * brief still weighs how similar the patients are. No patient identifier leaves the chart.
 */
export async function recallClinic(complaint: string) {
  const hs = getHindsight();
  const res = await hs.recall(
    CLINIC_BANK,
    `${complaint.trim()} What was tried for similar cases and what worked?`,
    { budget: "mid", maxTokens: 2000, types: ["observation", "world"], preferObservations: true }
  );
  return dedupe(toItems(relevant(res.results).slice(0, CLINIC_LIMIT), "clinic"));
}

/** Store today's consultation in the patient's chart. */
export async function retainVisit(patient: Patient, input: { complaint: string; notes: string; plan: string }) {
  const hs = getHindsight();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const content =
    `Visit on ${day}. ${patient.name} (${patient.age}${patient.sex}) presented with: ${input.complaint}. ` +
    (input.notes ? `Doctor's findings: ${input.notes}. ` : "") +
    (input.plan ? `Plan: ${input.plan}.` : "");
  return hs.retain(PATIENT_BANK, content, {
    timestamp: now,
    context: "clinic consultation note",
    documentId: `${patient.id}-visit-${now.getTime()}`,
    tags: [patientTag(patient.id), "visit"],
    metadata: { patient_id: patient.id, kind: "visit" },
  });
}

/** Remove the patient's name from free text before it reaches the shared clinic bank. */
export function anonymise(text: string, patient: Patient): string {
  let out = text;
  for (const part of patient.name.split(/\s+/).filter((p) => p.length > 1)) {
    out = out.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "the patient");
  }
  return out.replace(/\bthe patient the patient\b/gi, "the patient");
}

/**
 * Close the loop: record whether the treatment worked.
 * This is written twice: into the patient's own chart, and (anonymised) into the
 * clinic bank so the NEXT similar patient benefits. This write is what makes the
 * agent measurably better over time.
 */
export async function retainOutcome(
  patient: Patient,
  input: { problem: string; treatment: string; outcome: Outcome; detail: string }
) {
  const hs = getHindsight();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const label = OUTCOME_LABEL[input.outcome];

  const personal =
    `Follow-up on ${day}: ${patient.name}'s ${input.problem} after ${input.treatment}: ${label}. ` +
    (input.detail ? input.detail : "");

  const profile = `${ageBand(patient.age)} ${patient.sex === "M" ? "male" : "female"}`;
  const shared = anonymise(
    `Case outcome (${day}): ${profile} with ${input.problem}. Treatment: ${input.treatment}. Result: ${label}. ` +
      (input.detail ? input.detail : ""),
    patient
  );

  const [p, c] = await Promise.all([
    hs.retain(PATIENT_BANK, personal, {
      timestamp: now,
      context: "treatment outcome follow-up",
      documentId: `${patient.id}-outcome-${now.getTime()}`,
      tags: [patientTag(patient.id), "outcome"],
      metadata: { patient_id: patient.id, kind: "outcome", outcome: input.outcome },
    }),
    hs.retain(CLINIC_BANK, shared, {
      timestamp: now,
      context: "anonymised case outcome",
      documentId: `case-${now.getTime()}`,
      tags: ["outcome", `outcome:${input.outcome}`],
      metadata: { kind: "case_outcome", outcome: input.outcome },
    }),
  ]);
  return { patient: p, clinic: c, sharedText: shared };
}

/** Free-form question over one patient's chart, answered by Hindsight reflect. */
export async function askChart(patient: Patient, question: string) {
  const hs = getHindsight();
  const res = await hs.reflect(PATIENT_BANK, `About ${patient.name}: ${question}`, {
    ...patientScope(patient.id),
    budget: "mid",
    includeFacts: true,
    context: "A doctor is asking about their patient's history before or during a consultation.",
  });
  return { text: res.text, basedOn: summariseBasedOn(res.based_on) };
}

/** Free-form question over the clinic's collective experience. */
export async function askClinic(question: string) {
  const hs = getHindsight();
  const res = await hs.reflect(CLINIC_BANK, question, {
    budget: "mid",
    includeFacts: true,
    context: "A doctor wants to know what has worked across the practice for similar cases.",
  });
  return { text: res.text, basedOn: summariseBasedOn(res.based_on) };
}

function summariseBasedOn(basedOn: unknown): string[] {
  // based_on groups memories by kind; flatten whatever text we can find, defensively.
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (!v || out.length >= 12) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.text === "string") out.push(o.text);
      else Object.values(o).forEach(walk);
    }
  };
  walk(basedOn);
  return Array.from(new Set(out));
}

export function ageBand(age: number): string {
  const lo = Math.floor(age / 10) * 10;
  return `${lo}s`;
}

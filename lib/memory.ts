import { createHash } from "node:crypto";
import type { RecallResult } from "@vectorize-io/hindsight-client";
import { CLINIC_BANK, PATIENT_BANK, bankStats, getHindsight, listMemoriesByTags } from "./hindsight";
import type { ChartResult, MemoryItem, MemorySource, MemoryStats, Outcome, Patient } from "./types";

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
    learnedAt: r.mentioned_at ?? null,
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

const CHART_LIMIT = 500;

/**
 * Every fact in one patient's chart, oldest first. Listed with the same strict tag
 * scope as recall, and filtered again here so a server-side change can never
 * surface another patient's memory.
 */
export async function listChart(patient: Patient): Promise<ChartResult> {
  const tag = patientTag(patient.id);
  const { items } = await listMemoriesByTags(PATIENT_BANK, [tag], "any_strict", CHART_LIMIT);
  const mine = items.filter((m) => m.tags?.includes(tag) && m.text);
  const entries = mine
    .filter((m) => m.fact_type !== "observation")
    .map((m) => ({
      id: m.id,
      text: m.text ?? "",
      type: m.fact_type ?? "world",
      date: m.occurred_start ?? m.mentioned_at ?? m.date ?? null,
      learnedAt: m.mentioned_at ?? null,
      tags: m.tags ?? [],
    }))
    .sort(byDate);
  return { entries, observations: mine.length - entries.length };
}

/** Memory count per bank, straight from Hindsight's bank stats. */
export async function memoryStats(): Promise<MemoryStats> {
  const [patient, clinic] = await Promise.all([bankStats(PATIENT_BANK), bankStats(CLINIC_BANK)]);
  return { patient: patient.total_nodes, clinic: clinic.total_nodes };
}

/**
 * Stable id for a write: the same content on the same day always maps to the same
 * Hindsight document, so a double click or a retried request replaces the memory
 * instead of storing it twice.
 */
export function contentId(...parts: string[]): string {
  const normalised = parts.map((p) => p.trim().toLowerCase().replace(/\s+/g, " ")).join("|");
  return createHash("sha256").update(normalised).digest("hex").slice(0, 16);
}

const today = (now: Date) => now.toISOString().slice(0, 10);

/** Store today's consultation in the patient's chart. */
export async function retainVisit(patient: Patient, input: { complaint: string; notes: string; plan: string }) {
  const hs = getHindsight();
  const now = new Date();
  const day = today(now);
  const content =
    `Visit on ${day}. ${patient.name} (${patient.age}${patient.sex}) presented with: ${input.complaint}. ` +
    (input.notes ? `Doctor's findings: ${input.notes}. ` : "") +
    (input.plan ? `Plan: ${input.plan}.` : "");
  return hs.retain(PATIENT_BANK, content, {
    timestamp: now,
    context: "clinic consultation note",
    documentId: `${patient.id}-visit-${day}-${contentId(input.complaint, input.notes, input.plan)}`,
    tags: [patientTag(patient.id), "visit"],
    metadata: { patient_id: patient.id, kind: "visit" },
  });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive pattern for one word without a global i flag: "Ravi" becomes "[Rr][Aa][Vv][Ii]". */
const anyCase = (word: string) =>
  Array.from(word)
    .map((c) => (c.toLowerCase() !== c.toUpperCase() ? `[${c.toUpperCase()}${c.toLowerCase()}]` : escapeRe(c)))
    .join("");

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Mx", "Dr", "Prof", "Smt", "Shrimati", "Shri", "Sri", "Kumari", "Km", "Master"];

/**
 * Remove everything that identifies the patient from free text before it reaches the
 * shared clinic bank: the name in any casing, with or without a title (Mr., Smt., Dr.),
 * written with initials ("R. K. Reddy", "Ravi K Reddy"), the patient id, and phone numbers.
 * Initials only count as capitals, so ordinary words such as "a" are never swallowed.
 */
export function anonymise(text: string, patient: Pick<Patient, "id" | "name">): string {
  const words = patient.name.split(/\s+/).filter(Boolean);
  const parts = words.filter((w) => w.length > 1).map(anyCase);
  let out = text;
  if (parts.length) {
    const full = `(?:${parts.join("|")})`;
    const initial = `[${Array.from(new Set(words.map((w) => w[0].toUpperCase()))).join("")}]\\.?`;
    const title = `(?:${TITLES.map(anyCase).join("|")})\\.?`;
    // optional title, any initials, then one or more full name parts
    const span = new RegExp(`\\b(?:${title}\\s*)?(?:${initial}\\s*)*${full}\\b(?:\\s+${full}\\b)*`, "g");
    out = out.replace(span, "the patient");
  }
  return out
    .replace(new RegExp(`\\b(?:patient\\s+)?${escapeRe(patient.id)}\\b`, "gi"), "the patient")
    // phone-like runs need 10+ digits, so dates (2026-09-28) and readings (138/88) survive
    .replace(/\+?\d[\d\s-]{8,}\d/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[number removed]" : m))
    .replace(/\bthe patient(?:\s+the patient)+\b/gi, "the patient");
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
  const day = today(now);
  const label = OUTCOME_LABEL[input.outcome];

  const personal =
    `Follow-up on ${day}: ${patient.name}'s ${input.problem} after ${input.treatment}: ${label}. ` +
    (input.detail ? input.detail : "");

  const profile = `${ageBand(patient.age)} ${patient.sex === "M" ? "male" : "female"}`;
  // Only the doctor's free text can carry identifiers; the template around it is ours.
  const [problem, treatment, detail] = [input.problem, input.treatment, input.detail].map((t) => anonymise(t, patient));
  const shared =
    `Case outcome (${day}): ${profile} with ${problem}. Treatment: ${treatment}. Result: ${label}. ` + (detail ? detail : "");

  const [p, c] = await Promise.all([
    hs.retain(PATIENT_BANK, personal, {
      timestamp: now,
      context: "treatment outcome follow-up",
      documentId: `${patient.id}-outcome-${day}-${contentId(personal)}`,
      tags: [patientTag(patient.id), "outcome"],
      metadata: { patient_id: patient.id, kind: "outcome", outcome: input.outcome },
    }),
    hs.retain(CLINIC_BANK, shared, {
      timestamp: now,
      context: "anonymised case outcome",
      // derived from the anonymised text only, so the id carries nothing identifying
      documentId: `case-${day}-${contentId(shared)}`,
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

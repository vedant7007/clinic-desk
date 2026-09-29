import { PATIENTS, getPatient } from "@/data/patients";
import { CLINIC_BANK, PATIENT_BANK, type MemoryUnit, listBankMemories } from "./hindsight";
import type {
  ActivityItem,
  ClinicCaseSummary,
  InsightsData,
  MemoryKind,
  MemoryRecord,
  MemoryStats,
  OverviewData,
  Outcome,
} from "./types";

export const OUTCOME_VALUES: Outcome[] = ["resolved", "improved", "no_change", "worse"];
const zeroOutcomes = (): Record<Outcome, number> => ({ resolved: 0, improved: 0, no_change: 0, worse: 0 });

const PATIENT_LIST_LIMIT = 800;
const CLINIC_LIST_LIMIT = 400;

const tagValue = (tags: string[], prefix: string): string | null => {
  const hit = tags.find((t) => t.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

/**
 * The one place an outcome category is read off a memory. Everything that counts
 * outcomes — the dashboards, the audit — goes through this, so a total can never
 * disagree with its own breakdown. An untagged memory is null, never a guess.
 */
export function outcomeOf(tags: string[]): Outcome | null {
  const value = tagValue(tags, "outcome:") as Outcome | null;
  return value && OUTCOME_VALUES.includes(value) ? value : null;
}

/** Classify a memory from its tags and text — a display label, never invented fact. */
function kindOf(tags: string[], source: "patient" | "clinic", text: string): MemoryKind {
  if (source === "clinic") return "case";
  if (tags.includes("visit")) return "visit";
  if (tags.includes("outcome")) return "outcome";
  if (/\ballerg|drug reaction|reacted to\b/i.test(text)) return "allergy";
  return "note";
}

function toRecord(m: MemoryUnit, source: "patient" | "clinic"): MemoryRecord {
  const tags = m.tags ?? [];
  const text = m.text ?? "";
  return {
    id: m.id,
    documentId: m.document_id ?? null,
    source,
    text,
    type: m.fact_type ?? "world",
    date: m.occurred_start ?? m.mentioned_at ?? m.date ?? null,
    learnedAt: m.mentioned_at ?? null,
    tags,
    kind: kindOf(tags, source, text),
    patientId: tagValue(tags, "patient:"),
    outcome: outcomeOf(tags),
  };
}

/** Consolidated observations are summaries of other memories; the browsers list facts. */
const isFact = (m: MemoryUnit) => m.fact_type !== "observation" && Boolean(m.text);

const byLearnedDesc = (a: MemoryRecord, b: MemoryRecord) => (b.learnedAt ?? "").localeCompare(a.learnedAt ?? "");

function isToday(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

function toActivity(r: MemoryRecord): ActivityItem {
  const patient = r.patientId ? getPatient(r.patientId) : undefined;
  return {
    id: r.id,
    kind: r.kind,
    source: r.source,
    text: r.text,
    patientId: r.patientId,
    patientName: patient?.name ?? null,
    at: r.learnedAt,
    outcome: r.outcome,
  };
}

/**
 * Load both banks once and split each into facts and observations, so every total the
 * UI shows comes from this one read with one definition. `counts` is what the stat
 * cards display; `patient`/`clinic` are the facts the browsers list.
 */
async function loadAll(): Promise<{
  patient: MemoryRecord[];
  clinic: MemoryRecord[];
  counts: MemoryStats;
}> {
  const [p, c] = await Promise.all([
    listBankMemories(PATIENT_BANK, { limit: PATIENT_LIST_LIMIT }),
    listBankMemories(CLINIC_BANK, { limit: CLINIC_LIST_LIMIT }),
  ]);
  const pFacts = p.items.filter(isFact);
  const cFacts = c.items.filter(isFact);
  return {
    patient: pFacts.map((m) => toRecord(m, "patient")),
    clinic: cFacts.map((m) => toRecord(m, "clinic")),
    counts: {
      patient: { facts: pFacts.length, observations: p.items.length - pFacts.length, nodes: p.items.length },
      clinic: { facts: cFacts.length, observations: c.items.length - cFacts.length, nodes: c.items.length },
    },
  };
}

/**
 * Group clinic facts back into the cases they were extracted from. Hindsight turns one
 * recorded outcome into several memories, so the document is the unit of a case: this
 * is what makes "26 case outcomes" mean 26 outcomes and not 69 extracted sentences.
 * A case with no `outcome:<value>` tag keeps a null category — never a guessed one.
 */
export function clinicCases(clinic: MemoryRecord[]): ClinicCaseSummary[] {
  const groups = new Map<string, MemoryRecord[]>();
  for (const r of clinic) {
    if (r.kind !== "case") continue;
    // A memory with no document id is its own case rather than being merged with others.
    const key = r.documentId ?? `unit:${r.id}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return Array.from(groups.entries()).map(([documentId, members]) => {
    const dates = members.map((m) => m.date).filter((d): d is string => Boolean(d)).sort();
    const learned = members.map((m) => m.learnedAt).filter((d): d is string => Boolean(d)).sort();
    return {
      documentId,
      outcome: members.find((m) => m.outcome)?.outcome ?? null,
      date: dates[0] ?? null,
      learnedAt: learned[0] ?? null,
      memories: members.length,
      text: members.reduce((longest, m) => (m.text.length > longest.length ? m.text : longest), ""),
    };
  });
}

/**
 * Browse memory for the Memory page. Scope selects a bank (or both); an optional
 * query does a plain case-insensitive substring match over the visible text.
 */
export async function browseMemories(opts: {
  scope: "patient" | "clinic" | "all";
  patientId?: string;
  query?: string;
  limit?: number;
}): Promise<{ records: MemoryRecord[]; learnedToday: number; total: number; counts: MemoryStats }> {
  const { patient, clinic, counts } = await loadAll();
  let records = opts.scope === "patient" ? patient : opts.scope === "clinic" ? clinic : [...patient, ...clinic];
  if (opts.patientId) records = records.filter((r) => r.patientId === opts.patientId);
  const q = opts.query?.trim().toLowerCase();
  if (q) records = records.filter((r) => r.text.toLowerCase().includes(q));
  records.sort(byLearnedDesc);
  const now = new Date();
  const learnedToday = records.filter((r) => isToday(r.learnedAt, now)).length;
  const total = records.length;
  return { records: opts.limit ? records.slice(0, opts.limit) : records, learnedToday, total, counts };
}

export async function overviewData(): Promise<OverviewData> {
  const now = new Date();
  const { patient, clinic, counts } = await loadAll();
  const all = [...patient, ...clinic];
  const learnedToday = all.filter((r) => isToday(r.learnedAt, now)).length;

  const completedPatientIds = Array.from(
    new Set(patient.filter((r) => r.kind === "visit" && isToday(r.learnedAt, now)).map((r) => r.patientId).filter((id): id is string => Boolean(id)))
  );

  // Counted as cases (documents), the same unit Insights breaks down.
  const cases = clinicCases(clinic);
  const outcomesToday = zeroOutcomes();
  for (const c of cases) if (c.outcome && isToday(c.learnedAt, now)) outcomesToday[c.outcome]++;

  const recent = all
    .slice()
    .sort(byLearnedDesc)
    .slice(0, 12)
    .map(toActivity);

  return {
    banks: counts,
    patientsToday: PATIENTS.length,
    completedToday: completedPatientIds.length,
    learnedToday,
    outcomesRecorded: cases.filter((c) => c.outcome).length,
    outcomesToday,
    completedPatientIds,
    recent,
  };
}

export async function insightsData(): Promise<InsightsData> {
  const now = new Date();
  const { patient, clinic, counts } = await loadAll();

  const cases = clinicCases(clinic);
  const byOutcome = zeroOutcomes();
  let uncategorisedCases = 0;
  for (const c of cases) {
    if (c.outcome) byOutcome[c.outcome]++;
    else uncategorisedCases++;
  }
  // totalCases is the sum of the breakdown by construction, so the two can never disagree.
  const totalCases = cases.length - uncategorisedCases;

  const learnedToday = [...patient, ...clinic].filter((r) => isToday(r.learnedAt, now)).length;
  const recentCases = cases
    .slice()
    .sort((a, b) => (b.learnedAt ?? "").localeCompare(a.learnedAt ?? ""))
    .slice(0, 10);
  const recentActivity = [...patient, ...clinic].slice().sort(byLearnedDesc).slice(0, 10).map(toActivity);

  return {
    banks: counts,
    totalCases,
    byOutcome,
    uncategorisedCases,
    learnedToday,
    recentCases,
    recentActivity,
  };
}

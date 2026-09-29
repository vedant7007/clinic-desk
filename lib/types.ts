export type Sex = "M" | "F";

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  /** Shown in the roster only. The clinical detail lives in Hindsight memory. */
  tagline: string;
  /** Today's waiting-room complaint, pre-filled for the demo queue. */
  todayComplaint: string;
  /** Appointment slot for the queue view. */
  slot: string;
}

export type MemorySource = "patient" | "clinic";

export interface MemoryItem {
  /** Short citation id shown in the UI, e.g. P3 or C2 */
  ref: string;
  id: string;
  source: MemorySource;
  text: string;
  type: string;
  date: string | null;
  /** When the memory was written (the retain timestamp). Used to mark what was learned today. */
  learnedAt: string | null;
  tags: string[];
}

/** One entry in a patient's full chart timeline. */
export type ChartEntry = Omit<MemoryItem, "ref" | "source">;

export interface ChartResult {
  entries: ChartEntry[];
  /** Consolidated observations are summaries of the entries above, so they are counted, not listed. */
  observations: number;
}

/**
 * One counting definition, used everywhere a memory total is shown.
 *
 *  facts        — memory units Hindsight extracted from what was written. These are
 *                 what recall returns, what citations point at, and what the Memory
 *                 browser lists. This is the headline number in the UI.
 *  observations — consolidated summaries Hindsight derives FROM those facts. Real
 *                 memories, but derived, so counting them alongside facts would count
 *                 the same knowledge twice. Always reported separately.
 *  nodes        — facts + observations, i.e. Hindsight's own `total_nodes`.
 */
export interface BankCount {
  facts: number;
  observations: number;
  nodes: number;
}

export interface MemoryStats {
  patient: BankCount;
  clinic: BankCount;
}

export type FlagSeverity = "critical" | "warning" | "info";

export interface BriefFlag {
  severity: FlagSeverity;
  title: string;
  detail: string;
  refs: string[];
}

export interface BriefInsight {
  finding: string;
  refs: string[];
}

export interface Brief {
  headline: string;
  /** Short clinical problem label, used to pre-fill the outcome form. */
  problem: string;
  flags: BriefFlag[];
  history: string;
  whatWorked: BriefInsight[];
  askThePatient: string[];
  considerations: string[];
}

export interface BriefResult {
  withMemory: Brief;
  withoutMemory: Brief | null;
  /** The comparison was requested but could not be produced. */
  compareFailed: boolean;
  memories: MemoryItem[];
  timings: { recallMs: number; llmMs: number };
  /** Groq model that wrote the memory brief. */
  model: string;
  /** True when the primary model failed and the fallback wrote the brief. */
  fallbackUsed: boolean;
}

export type Outcome = "resolved" | "improved" | "no_change" | "worse";

/** What kind of event a memory represents, derived from its tags. */
export type MemoryKind = "visit" | "outcome" | "case" | "allergy" | "note";

/**
 * A memory as shown in the Memory and Insights browsers — a chart/clinic entry
 * enriched with the scope it belongs to and any structured facts parsed from its tags.
 */
export interface MemoryRecord {
  id: string;
  /** The source document this fact was extracted from. One clinic case = one document. */
  documentId: string | null;
  source: MemorySource;
  text: string;
  type: string;
  date: string | null;
  learnedAt: string | null;
  tags: string[];
  kind: MemoryKind;
  /** Parsed from a `patient:<id>` tag; null for clinic memories. */
  patientId: string | null;
  /** Parsed from an `outcome:<value>` tag when present. */
  outcome: Outcome | null;
}

/** One item in the Overview / Insights activity feed. */
export interface ActivityItem {
  id: string;
  kind: MemoryKind;
  source: MemorySource;
  text: string;
  patientId: string | null;
  patientName: string | null;
  at: string | null;
  outcome: Outcome | null;
}

/** Command-centre snapshot for the Overview page. Every figure is counted from memory, never invented. */
export interface OverviewData {
  banks: MemoryStats;
  /** Patients on today's roster. */
  patientsToday: number;
  /** Patients whose visit was written to memory today. */
  completedToday: number;
  /** Distinct memories (both banks) whose retain timestamp is today. */
  learnedToday: number;
  /**
   * Anonymised case outcomes recorded across the clinic's history, counted as
   * documents and carrying a valid category — the same number Insights breaks down.
   */
  outcomesRecorded: number;
  /** Outcomes recorded today, by category. */
  outcomesToday: Record<Outcome, number>;
  /** Patient ids with a visit recorded today. */
  completedPatientIds: string[];
  recent: ActivityItem[];
}

/**
 * What one retain call actually did, straight from Hindsight's response.
 * `ok: false` means the write failed — the UI says so rather than claiming learning.
 */
export interface RetainReceipt {
  bank: "patient" | "clinic";
  ok: boolean;
  /** Facts Hindsight accepted, from its `items_count`. Null when the write failed. */
  items: number | null;
  /** The exact text sent to the bank, so the UI can show what was learned. */
  text: string;
  /** Why it failed, when it did. */
  error: string | null;
}

/** Live state of one dependency. Never inferred from a key being present alone. */
export type ServiceState = "ok" | "missing" | "unreachable" | "rejected" | "unseeded";

export interface BankHealth {
  id: string;
  state: ServiceState;
  /** Node count from Hindsight's bank stats. Null when the bank could not be read. */
  memories: number | null;
  error: string | null;
}

/**
 * The result of actually talking to Hindsight, not of reading env vars.
 * Drives the setup state so it names the real problem.
 */
export interface HealthReport {
  hindsight: {
    baseUrlSet: boolean;
    apiKeySet: boolean;
    /** Host only — the key itself is never sent to the client. */
    host: string | null;
    state: ServiceState;
    error: string | null;
    banks: { patient: BankHealth; clinic: BankHealth };
  };
  groq: { apiKeySet: boolean; model: string; fallbackModel: string };
  checkedAt: string;
}

/**
 * One recorded case outcome: a single document in the clinic bank, together with the
 * facts Hindsight extracted from it. The document is the unit of "a case" — extraction
 * fans one case out into several memories, so counting memories would overstate it.
 */
export interface ClinicCaseSummary {
  documentId: string;
  outcome: Outcome | null;
  date: string | null;
  learnedAt: string | null;
  /** Facts extracted from this one case. */
  memories: number;
  /** The fullest extracted fact, shown as the case's representative line. */
  text: string;
}

/** Aggregated, honest clinic-level intelligence for the Insights page. */
export interface InsightsData {
  banks: MemoryStats;
  /** Cases carrying a valid outcome category. `byOutcome` always sums to exactly this. */
  totalCases: number;
  byOutcome: Record<Outcome, number>;
  /** Cases with no outcome category recorded. Never forced into a category. */
  uncategorisedCases: number;
  learnedToday: number;
  recentCases: ClinicCaseSummary[];
  recentActivity: ActivityItem[];
}

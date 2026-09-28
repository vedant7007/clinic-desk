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

export interface MemoryStats {
  patient: number;
  clinic: number;
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

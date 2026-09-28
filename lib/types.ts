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
  flags: BriefFlag[];
  history: string;
  whatWorked: BriefInsight[];
  askThePatient: string[];
  considerations: string[];
}

export interface BriefResult {
  withMemory: Brief;
  withoutMemory: Brief | null;
  memories: MemoryItem[];
  timings: { recallMs: number; llmMs: number };
  model: string;
}

export type Outcome = "resolved" | "improved" | "no_change" | "worse";

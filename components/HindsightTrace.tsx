"use client";

import type { RetainReceipt } from "@/lib/types";

export type TracePhase = "idle" | "recalling" | "reasoning" | "ready";

export interface TraceState {
  phase: TracePhase;
  patientCount: number;
  clinicCount: number;
  citationCount: number;
  model?: string;
  llmMs?: number;
  recallMs?: number;
  fallbackUsed?: boolean;
  /** Receipts from the real retain calls. Undefined until that write has been made. */
  visitReceipt?: RetainReceipt | null;
  outcomePatientReceipt?: RetainReceipt | null;
  outcomeClinicReceipt?: RetainReceipt | null;
  /**
   * Recalled memories in the CURRENT brief that Hindsight retained today. Greater than
   * zero only after a re-run actually pulled today's writes back out of memory — the
   * one fact that proves the loop closed through Hindsight and not through app state.
   */
  recalledLearnedToday: number;
}

type Status = "done" | "active" | "pending" | "failed";
type Op = "RECALL" | "REASON" | "EVIDENCE" | "OUTCOME" | "RETAIN" | "LEARNED";
interface Step {
  op: Op;
  title: string;
  detail: string;
  status: Status;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Every step is derived from real workflow state: recall result counts and timing, the
 * model that actually reasoned, the number of citations that survived grounding, the
 * retain receipts Hindsight returned, and whether a later recall returned today's
 * writes. Nothing is simulated, and a failed write shows as failed, never as learned.
 */
function buildSteps(s: TraceState): Step[] {
  const recalled = s.phase === "ready";
  const recalling = s.phase === "recalling";
  const reasoning = s.phase === "reasoning";

  const recallStatus: Status = recalling ? "active" : reasoning || recalled ? "done" : "pending";
  const reasonStatus: Status = reasoning ? "active" : recalled ? "done" : "pending";
  const timing = s.recallMs !== undefined ? ` · ${s.recallMs} ms` : "";

  /** A retain step reflects its receipt: pending before the write, then ok or failed. */
  const retainStep = (title: string, receipt: RetainReceipt | null | undefined, waitingFor: string): Step => {
    if (!receipt) return { op: "RETAIN", title, detail: waitingFor, status: "pending" };
    if (!receipt.ok) return { op: "RETAIN", title, detail: receipt.error ?? "write failed", status: "failed" };
    return {
      op: "RETAIN",
      title,
      detail: receipt.items !== null ? `${plural(receipt.items, "fact")} accepted` : "written",
      status: "done",
    };
  };

  const patientWrite = s.outcomePatientReceipt ?? s.visitReceipt ?? null;
  const outcomeRecorded = Boolean(s.outcomePatientReceipt || s.outcomeClinicReceipt);

  return [
    {
      op: "RECALL",
      title: "Patient memory",
      detail: recallStatus === "done" ? `${plural(s.patientCount, "result")}${timing}` : recalling ? "recalling…" : "patient bank",
      status: recallStatus,
    },
    {
      op: "RECALL",
      title: "Clinic memory",
      detail: recallStatus === "done" ? plural(s.clinicCount, "result") : recalling ? "recalling…" : "clinic bank",
      status: recallStatus,
    },
    {
      op: "REASON",
      title: "Brief generated",
      detail:
        reasonStatus === "done"
          ? `${s.model ?? "model"}${s.fallbackUsed ? " (fallback)" : ""} · ${((s.llmMs ?? 0) / 1000).toFixed(1)}s`
          : reasoning
            ? "reasoning over recalled context…"
            : "Groq / LLM",
      status: reasonStatus,
    },
    {
      op: "EVIDENCE",
      title: "Grounded citations",
      detail: recalled ? `${plural(s.citationCount, "claim")} traced to memory` : "traceable to memory",
      status: recalled ? "done" : "pending",
    },
    {
      op: "OUTCOME",
      title: "Visit outcome",
      detail: outcomeRecorded ? "recorded by the clinician" : "awaiting the clinician",
      status: outcomeRecorded ? "done" : "pending",
    },
    retainStep("Patient memory updated", patientWrite, "on visit close"),
    retainStep("Clinic memory updated", s.outcomeClinicReceipt, "on outcome record"),
    {
      op: "LEARNED",
      title: "Recalled again",
      detail:
        s.recalledLearnedToday > 0
          ? `${plural(s.recalledLearnedToday, "memory", "memories")} learned today came back from recall`
          : patientWrite?.ok
            ? "re-run the brief to recall it"
            : "after retain",
      // Only the re-recall itself proves persistence, so nothing else marks this done.
      status: s.recalledLearnedToday > 0 ? "done" : "pending",
    },
  ];
}

export function HindsightTrace({ state }: { state: TraceState }) {
  const steps = buildSteps(state);
  return (
    <ol className="htrace">
      {steps.map((step, i) => (
        <li key={i} className={`htrace-step is-${step.status} op-${step.op.toLowerCase()}`}>
          <span className="htrace-rail" aria-hidden>
            <span className="htrace-node">{step.status === "done" ? "✓" : step.status === "failed" ? "!" : String(i + 1).padStart(2, "0")}</span>
          </span>
          <span className="htrace-body">
            <span className="htrace-op">{step.op}</span>
            <span className="htrace-title">{step.title}</span>
            <span className="htrace-detail">{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

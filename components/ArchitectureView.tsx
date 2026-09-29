"use client";

import { ConsultIcon, MemoryIcon, OutcomeIcon, SearchIcon, SparkIcon } from "./icons";

/**
 * Clinic Desk's real loop, one stage per step the code actually performs: recall from
 * both Hindsight banks (lib/memory.ts), reason over what was recalled (lib/brief.ts),
 * ground every claim in a citation, let the clinician act, then retain the outcome back
 * into both banks. Nothing here is decorative or invented.
 */
const STAGES = [
  { op: "Recall", Icon: SearchIcon, title: "Remember the patient", body: "Hindsight recalls this patient's chart and anonymised outcomes from similar cases." },
  { op: "Reason", Icon: SparkIcon, title: "Write the brief", body: "The model reasons over recalled memory only — it never invents history." },
  { op: "Evidence", Icon: MemoryIcon, title: "Cite every claim", body: "Each flag points at the memory behind it: P· for the chart, C· for the clinic." },
  { op: "Act", Icon: ConsultIcon, title: "The doctor decides", body: "The clinician closes the visit and records whether the treatment worked." },
  { op: "Retain", Icon: OutcomeIcon, title: "Learn from it", body: "The outcome is written to the chart and, anonymised, to clinic memory." },
] as const;

export function ArchitectureView() {
  return (
    <div className="loop">
      <ol className="loop-flow">
        {STAGES.map(({ op, Icon, title, body }, i) => (
          <li key={op} className={`loop-stage stage-${op.toLowerCase()}`}>
            <span className="loop-stage-head">
              <span className="loop-stage-icon" aria-hidden>
                <Icon size={16} />
              </span>
              <span className="loop-stage-op">
                <span className="mono">0{i + 1}</span> {op}
              </span>
            </span>
            <strong>{title}</strong>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      <div className="loop-banks">
        <span className="loop-bank src-patient">
          <i aria-hidden /> Patient memory <small>tag-scoped chart</small>
        </span>
        <span className="loop-return" aria-hidden>
          ↺ the next recall starts from what was retained
        </span>
        <span className="loop-bank src-clinic">
          <i aria-hidden /> Clinic memory <small>anonymised cases</small>
        </span>
      </div>
    </div>
  );
}

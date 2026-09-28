"use client";

import type { Brief } from "@/lib/types";

interface Props {
  brief: Brief;
  variant: "memory" | "generic";
  onRefHover?: (ref: string | null) => void;
}

const SEVERITY_LABEL = { critical: "Critical", warning: "Warning", info: "Note" } as const;

/** Citation chips. P and C refs point at a recalled memory; NOW means today's complaint. */
export function RefChips({ refs, onRefHover }: { refs: string[]; onRefHover?: (r: string | null) => void }) {
  if (!refs.length) return null;
  return (
    <span className="refs">
      {refs.map((r) => {
        if (r === "NOW") {
          return (
            <span key={r} className="ref ref-now" title="From today's complaint">
              today
            </span>
          );
        }
        const source = r[0] === "C" ? "clinic memory" : "this patient's memory";
        return (
          <button
            key={r}
            type="button"
            className={`ref ref-${r[0] === "C" ? "clinic" : "patient"}`}
            onMouseEnter={() => onRefHover?.(r)}
            onMouseLeave={() => onRefHover?.(null)}
            onFocus={() => onRefHover?.(r)}
            onBlur={() => onRefHover?.(null)}
            title={`From ${source}`}
            aria-label={`Citation ${r}, from ${source}`}
          >
            {r}
          </button>
        );
      })}
    </span>
  );
}

export function BriefCard({ brief, variant, onRefHover }: Props) {
  const generic = variant === "generic";
  return (
    <article className={`brief ${generic ? "brief-generic" : "brief-memory"}`}>
      <header className="brief-head">
        <span className="brief-kicker">{generic ? "Without memory" : "With Hindsight memory"}</span>
        <h3>{brief.headline}</h3>
      </header>

      {brief.flags.length > 0 && (
        <ul className="flags">
          {brief.flags.map((f, i) => (
            <li key={i} className={`flag flag-${f.severity}`}>
              <span className="flag-sev">{SEVERITY_LABEL[f.severity]}</span>
              <div>
                <strong>{f.title}</strong>
                <p>
                  {f.detail} <RefChips refs={f.refs} onRefHover={onRefHover} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {brief.history && (
        <section>
          <h4>History</h4>
          <p>{brief.history}</p>
        </section>
      )}

      {brief.whatWorked.length > 0 && (
        <section>
          <h4>What worked in this clinic</h4>
          <ul className="plain">
            {brief.whatWorked.map((w, i) => (
              <li key={i}>
                {w.finding} <RefChips refs={w.refs} onRefHover={onRefHover} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.askThePatient.length > 0 && (
        <section>
          <h4>Ask the patient</h4>
          <ul className="plain">
            {brief.askThePatient.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.considerations.length > 0 && (
        <section>
          <h4>For your consideration</h4>
          <ul className="plain">
            {brief.considerations.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

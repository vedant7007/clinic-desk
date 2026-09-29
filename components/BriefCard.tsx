"use client";

import { useState } from "react";
import { displayText } from "@/lib/text";
import type { Brief, FlagSeverity, MemoryItem } from "@/lib/types";

interface Props {
  brief: Brief;
  variant: "memory" | "generic";
  onRefHover?: (ref: string | null) => void;
  /** When set, citation chips become clickable and open the evidence explorer. */
  onRefClick?: (ref: string, claim: string) => void;
  /** The recalled memories, so a citation can preview what it points at. */
  memories?: MemoryItem[];
}

const SEVERITY_LABEL = { critical: "Critical", warning: "Warning", info: "Note" } as const;

/** A small glyph per severity, so a flag reads at a glance before the words. */
function SevIcon({ severity }: { severity: FlagSeverity }) {
  const common = { viewBox: "0 0 24 24", width: 11, height: 11, fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (severity === "critical")
    return (
      <svg {...common} aria-hidden>
        <path d="M12 4l9 16H3z" />
        <path d="M12 10v4M12 17.5v.01" />
      </svg>
    );
  if (severity === "warning")
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 15.5v.01" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </svg>
  );
}

/** Citation chips. P and C refs point at a recalled memory; NOW means today's complaint. */
export function RefChips({
  refs,
  claim,
  onRefHover,
  onRefClick,
  memories,
}: {
  refs: string[];
  claim?: string;
  onRefHover?: (r: string | null) => void;
  onRefClick?: (ref: string, claim: string) => void;
  memories?: MemoryItem[];
}) {
  // The preview shows the real recalled memory behind a citation — nothing else.
  const [tip, setTip] = useState<{ ref: string; alignRight: boolean } | null>(null);
  if (!refs.length) return null;
  const show = (r: string, el: HTMLElement) => {
    onRefHover?.(r);
    if (!memories?.some((m) => m.ref === r)) return;
    const box = el.getBoundingClientRect();
    setTip({ ref: r, alignRight: box.left > window.innerWidth / 2 });
  };
  const hide = () => {
    onRefHover?.(null);
    setTip(null);
  };
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
        const clickable = Boolean(onRefClick);
        const preview = tip?.ref === r ? memories?.find((m) => m.ref === r) : undefined;
        return (
          <span key={r} className="ref-wrap">
            <button
              type="button"
              className={`ref ref-${r[0] === "C" ? "clinic" : "patient"} ${clickable ? "ref-clickable" : ""}`}
              onMouseEnter={(e) => show(r, e.currentTarget)}
              onMouseLeave={hide}
              onFocus={(e) => show(r, e.currentTarget)}
              onBlur={hide}
              onClick={
                clickable
                  ? () => {
                      setTip(null);
                      onRefClick?.(r, claim ?? "");
                    }
                  : undefined
              }
              title={clickable || preview ? undefined : `From ${source}`}
              aria-label={clickable ? `Show evidence for citation ${r}, from ${source}` : `Citation ${r}, from ${source}`}
            >
              {r}
            </button>
            {preview && (
              <span className={`ref-tip ref-tip-${r[0] === "C" ? "clinic" : "patient"} ${tip?.alignRight ? "align-right" : ""}`} aria-hidden>
                <span className="ref-tip-head">
                  {r} · {r[0] === "C" ? "Clinic memory" : "Patient memory"}
                </span>
                <span className="ref-tip-text">{displayText(preview.text)}</span>
                {clickable && <span className="ref-tip-hint">Click to open the evidence</span>}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export function BriefCard({ brief, variant, onRefHover, onRefClick, memories }: Props) {
  const generic = variant === "generic";
  return (
    <article className={`brief ${generic ? "brief-generic" : "brief-memory"}`}>
      <header className="brief-head">
        <span className="brief-kicker">
          <span className="k-dot" aria-hidden />
          <span>{generic ? "Without memory" : "With Hindsight memory"}</span>
        </span>
        <h3>{brief.headline}</h3>
      </header>

      {brief.flags.length > 0 && (
        <ul className="flags">
          {brief.flags.map((f, i) => (
            <li key={i} className={`flag flag-${f.severity}`}>
              <span className="flag-badge">
                <span className="fb-ico">
                  <SevIcon severity={f.severity} />
                </span>
                {SEVERITY_LABEL[f.severity]}
              </span>
              <div>
                <strong>{f.title}</strong>
                <p>
                  {f.detail} <RefChips refs={f.refs} claim={`${f.title} — ${f.detail}`} onRefHover={onRefHover} onRefClick={onRefClick} memories={memories} />
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
                {w.finding} <RefChips refs={w.refs} claim={w.finding} onRefHover={onRefHover} onRefClick={onRefClick} memories={memories} />
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

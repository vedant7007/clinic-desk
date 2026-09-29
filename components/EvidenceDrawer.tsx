"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useDialogFocus, usePresence } from "./motion";
import { ArrowIcon, CloseIcon } from "./icons";
import { displayText, fmtDate, isToday } from "@/lib/text";
import type { MemorySource } from "@/lib/types";

/** The minimum a memory needs to be traced. `ref` is present only for brief citations. */
export interface EvidenceMemory {
  source: MemorySource;
  text: string;
  date: string | null;
  learnedAt: string | null;
  type: string;
  ref?: string;
}

export interface Evidence {
  memory: EvidenceMemory;
  /** The AI claim that cited this memory, if opened from a brief. */
  claim?: string;
  /** Patient the memory belongs to, for the "view in chart" link. */
  patientId?: string;
  patientName?: string;
}

/**
 * A right-side drawer that answers "why did the AI say this?" for one citation:
 * the claim, the memory bank it came from, the reference id, and the underlying
 * memory verbatim — with a jump back to the chart it lives in.
 */
export function EvidenceDrawer({ evidence, onClose }: { evidence: Evidence | null; onClose: () => void }) {
  // Stays mounted for its exit, so closing slides out instead of vanishing.
  const { item } = usePresence(evidence, 200);
  // Shown the moment it opens; the presence copy only keeps it for the exit.
  const current = evidence ?? item;
  const closing = !evidence && Boolean(item);
  const panel = useRef<HTMLElement>(null);
  useDialogFocus(Boolean(evidence), panel);

  useEffect(() => {
    if (!evidence) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [evidence, onClose]);

  if (!current) return null;
  const { memory, claim, patientId, patientName } = current;
  const clinic = memory.source === "clinic";
  const sourceLabel = clinic ? "Clinic memory" : `Patient memory${patientName ? ` · ${patientName}` : ""}`;
  const sourceHint = clinic
    ? "Anonymised outcomes from similar cases across the practice."
    : "This patient's own chart, scoped so no other patient's record is visible.";

  return (
    <div className={`evi-overlay ${closing ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Evidence" onMouseDown={onClose}>
      <aside ref={panel} className={`evi-drawer src-${memory.source}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="evi-head">
          <span className="eyebrow">Evidence explorer</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close evidence">
            <CloseIcon size={16} />
          </button>
        </div>

        {claim && (
          <div className="evi-block">
            <span className="evi-label">Why this appeared</span>
            <p className="evi-claim">“{claim}”</p>
          </div>
        )}

        <div className="evi-block evi-source">
          <div>
            <span className="evi-label">Source</span>
            <p className={`evi-source-name ${clinic ? "is-clinic" : "is-patient"}`}>
              {memory.ref && <span className={`ref ref-${memory.source}`}>{memory.ref}</span>}
              {sourceLabel}
            </p>
            <p className="evi-hint">{sourceHint}</p>
          </div>
        </div>

        <div className="evi-block">
          <span className="evi-label">Supporting memory</span>
          <blockquote className="evi-quote">
            {displayText(memory.text)}
            {isToday(memory.learnedAt) && <span className="new-badge">New</span>}
          </blockquote>
          <div className="evi-meta">
            {memory.date && <span>Occurred {fmtDate(memory.date)}</span>}
            {memory.learnedAt && <span>Learned {fmtDate(memory.learnedAt)}</span>}
            {memory.type === "observation" && <span>Consolidated observation</span>}
          </div>
        </div>

        {!clinic && patientId && (
          <Link className="evi-jump" href={`/patients/${patientId}?tab=timeline`} onClick={onClose}>
            View in {patientName ? patientName.split(" ")[0] : "the patient"}’s timeline
            <ArrowIcon size={15} />
          </Link>
        )}
      </aside>
    </div>
  );
}

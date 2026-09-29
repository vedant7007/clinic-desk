"use client";

import { KindGlyph, OUTCOME_LABEL } from "./ui";
import { getPatient } from "@/data/patients";
import { displayText, fmtDate, isToday } from "@/lib/text";
import type { MemoryRecord } from "@/lib/types";

/** A single memory as a clickable card that opens the evidence drawer. */
export function MemoryCard({ record, onOpen }: { record: MemoryRecord; onOpen: (r: MemoryRecord) => void }) {
  const patient = record.patientId ? getPatient(record.patientId) : undefined;
  const who = record.source === "clinic" ? "Clinic memory" : patient?.name ?? "Patient memory";
  return (
    <button type="button" className={`memcard src-${record.source}`} onClick={() => onOpen(record)}>
      <span className={`memcard-glyph src-${record.source}`} aria-hidden>
        <KindGlyph kind={record.kind} />
      </span>
      <span className="memcard-body">
        <span className="memcard-top">
          <span className="who">{who}</span>
          <span className={`kind-badge src-${record.source}`}>{record.kind === "case" ? "Clinic case" : record.kind[0].toUpperCase() + record.kind.slice(1)}</span>
          {record.outcome && <span className={`outcome-badge o-${record.outcome}`}>{OUTCOME_LABEL[record.outcome]}</span>}
          {isToday(record.learnedAt) && <span className="new-badge">New</span>}
        </span>
        <span className="memcard-text">{displayText(record.text)}</span>
        <span className="memcard-meta">
          {record.date && <span>Occurred {fmtDate(record.date)}</span>}
          {record.learnedAt && <span>Learned {fmtDate(record.learnedAt)}</span>}
        </span>
      </span>
    </button>
  );
}

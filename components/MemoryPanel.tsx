"use client";

import type { MemoryItem } from "@/lib/types";

interface Props {
  memories: MemoryItem[] | null;
  highlight: string | null;
  loading: boolean;
  patientName: string;
}

function fmtDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Group({ title, hint, items, highlight }: { title: string; hint: string; items: MemoryItem[]; highlight: string | null }) {
  return (
    <div className="mem-group">
      <div className="mem-group-head">
        <h4>{title}</h4>
        <span className="count">{items.length}</span>
      </div>
      <p className="hint">{hint}</p>
      {items.length === 0 ? (
        <p className="empty">Nothing recalled.</p>
      ) : (
        <ol className="mem-list">
          {items.map((m) => (
            <li key={m.ref} className={`mem mem-${m.source} ${highlight === m.ref ? "mem-hl" : ""}`} id={`mem-${m.ref}`}>
              <span className={`ref ref-${m.source}`}>{m.ref}</span>
              <div>
                <p>{m.text}</p>
                <span className="mem-meta">
                  {fmtDate(m.date)}
                  {m.type === "observation" ? " · consolidated observation" : ""}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function MemoryPanel({ memories, highlight, loading, patientName }: Props) {
  if (loading) {
    return (
      <div className="mem-loading">
        <div className="pulse" />
        <p>Recalling from both memory banks…</p>
      </div>
    );
  }
  if (!memories) {
    return (
      <div className="mem-intro">
        <p>
          When you prepare a brief, the memories Hindsight recalled appear here. Hover a citation like{" "}
          <span className="ref ref-patient">P2</span> or <span className="ref ref-clinic">C1</span> in the brief to see
          exactly where a claim came from.
        </p>
      </div>
    );
  }
  return (
    <>
      <Group
        title={`${patientName.split(" ")[0]}'s chart`}
        hint="Patient bank · scoped to this patient only"
        items={memories.filter((m) => m.source === "patient")}
        highlight={highlight}
      />
      <Group
        title="Clinic experience"
        hint="Clinic bank · anonymised outcomes from similar cases"
        items={memories.filter((m) => m.source === "clinic")}
        highlight={highlight}
      />
    </>
  );
}

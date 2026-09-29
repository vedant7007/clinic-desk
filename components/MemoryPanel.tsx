"use client";

import { useEffect, useState } from "react";
import { displayText, fmtDate, isToday } from "@/lib/text";
import { useSlidingIndicator } from "./motion";
import type { ChartResult, MemoryItem, Patient } from "@/lib/types";

interface Props {
  memories: MemoryItem[] | null;
  highlight: string | null;
  loading: boolean;
  patient: Patient;
  /** Bumped after every write to memory so the chart reloads. */
  chartVersion: number;
}

type View = "brief" | "chart";

function NewBadge({ learnedAt }: { learnedAt: string | null }) {
  if (!isToday(learnedAt)) return null;
  return (
    <span className="new-badge" title="Learned today">
      New
    </span>
  );
}

function Group({
  title,
  hint,
  items,
  highlight,
  source,
}: {
  title: string;
  hint: string;
  items: MemoryItem[];
  highlight: string | null;
  source: "patient" | "clinic";
}) {
  return (
    <div className={`mem-group g-${source}`}>
      <div className="mem-group-head">
        <span className="gh-dot" aria-hidden />
        <h3>{title}</h3>
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
                <p>
                  {displayText(m.text)} <NewBadge learnedAt={m.learnedAt} />
                </p>
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

function RecalledView({ memories, highlight, loading, patient }: Omit<Props, "chartVersion">) {
  if (loading) {
    return (
      <div className="mem-loading" role="status">
        <div className="pulse" aria-hidden />
        <p>Recalling from both memory banks…</p>
      </div>
    );
  }
  if (!memories) {
    return (
      <div className="mem-intro">
        <p>
          When you prepare a brief, the memories Hindsight recalled appear here. Hover or focus a citation like{" "}
          <span className="ref ref-patient">P2</span> or <span className="ref ref-clinic">C1</span> in the brief to see exactly
          where a claim came from.
        </p>
      </div>
    );
  }
  return (
    <>
      <Group
        source="patient"
        title={`${patient.name.split(" ")[0]}'s chart`}
        hint="Patient bank · scoped to this patient only"
        items={memories.filter((m) => m.source === "patient")}
        highlight={highlight}
      />
      <Group
        source="clinic"
        title="Clinic experience"
        hint="Clinic bank · anonymised outcomes from similar cases"
        items={memories.filter((m) => m.source === "clinic")}
        highlight={highlight}
      />
    </>
  );
}

function ChartView({ patient, chartVersion }: { patient: Patient; chartVersion: number }) {
  const [chart, setChart] = useState<ChartResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setChart(null);
    setError(null);
    fetch(`/api/chart?patientId=${encodeURIComponent(patient.id)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Could not load the chart (${r.status})`);
        setChart(data as ChartResult);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, [patient.id, chartVersion]);

  if (error) return <div className="error" role="alert">{error}</div>;
  if (!chart) {
    return (
      <div className="mem-loading" role="status">
        <div className="pulse" aria-hidden />
        <p>Loading {patient.name.split(" ")[0]}&apos;s full chart…</p>
      </div>
    );
  }
  const learnedToday = chart.entries.filter((e) => isToday(e.learnedAt)).length;
  return (
    <div className="mem-group g-patient">
      <div className="mem-group-head">
        <span className="gh-dot" aria-hidden />
        <h3>Full chart</h3>
        <span className="count">{chart.entries.length}</span>
      </div>
      <p className="hint">
        Every fact in the patient bank tagged to {patient.name.split(" ")[0]}, oldest first
        {chart.observations > 0 ? ` · plus ${chart.observations} consolidated observations` : ""}
        {learnedToday > 0 ? ` · ${learnedToday} learned today` : ""}
      </p>
      {chart.entries.length === 0 ? (
        <p className="empty">No memories yet. This is a new patient: close the visit to start the chart.</p>
      ) : (
        <ol className="timeline">
          {chart.entries.map((e) => (
            <li key={e.id} className={isToday(e.learnedAt) ? "tl-new" : ""}>
              <time dateTime={e.date ?? undefined}>{fmtDate(e.date) || "undated"}</time>
              <p>
                {displayText(e.text)} <NewBadge learnedAt={e.learnedAt} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function MemoryPanel({ memories, highlight, loading, patient, chartVersion }: Props) {
  const [view, setView] = useState<View>("brief");
  const tabsRef = useSlidingIndicator<HTMLDivElement>(view);
  const tabs: [View, string][] = [
    ["brief", "Recalled for this brief"],
    ["chart", "Full chart"],
  ];

  return (
    <>
      <div className="tabs mem-tabs" role="tablist" aria-label="Memory view" ref={tabsRef}>
        {tabs.map(([v, label], i) => (
          <button
            key={v}
            id={`memtab-${v}`}
            role="tab"
            type="button"
            aria-selected={view === v}
            aria-controls={`mempanel-${v}`}
            tabIndex={view === v ? 0 : -1}
            className={view === v ? "on" : ""}
            onClick={() => setView(v)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length][0];
              setView(next);
              document.getElementById(`memtab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div id={`mempanel-${view}`} role="tabpanel" aria-labelledby={`memtab-${view}`} className="mem-panel">
        {view === "brief" ? (
          <RecalledView memories={memories} highlight={highlight} loading={loading} patient={patient} />
        ) : (
          <ChartView patient={patient} chartVersion={chartVersion} />
        )}
      </div>
    </>
  );
}

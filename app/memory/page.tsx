"use client";

import { useEffect, useMemo, useState } from "react";
import { ArchitectureView } from "@/components/ArchitectureView";
import { EvidenceDrawer, type Evidence } from "@/components/EvidenceDrawer";
import { MemoryCard } from "@/components/MemoryCard";
import { SetupState } from "@/components/SetupState";
import { MemoryIcon, SearchIcon } from "@/components/icons";
import { EmptyState, Loading, PageHeader } from "@/components/ui";
import { ApiError, getJson } from "@/lib/client";
import { CountUp, useSlidingIndicator } from "@/components/motion";
import { isToday } from "@/lib/text";
import type { MemoryRecord, MemoryStats } from "@/lib/types";

type Scope = "all" | "patient" | "clinic";
const SCOPES: [Scope, string][] = [
  ["all", "All memory"],
  ["patient", "Patient"],
  ["clinic", "Clinic"],
];

export default function MemoryPage() {
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [data, setData] = useState<{ records: MemoryRecord[]; learnedToday: number; total: number; counts: MemoryStats } | null>(null);
  const [error, setError] = useState<{ message: string; isConfig: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const scopeRef = useSlidingIndicator<HTMLDivElement>(scope);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("scope");
    if (s === "patient" || s === "clinic" || s === "all") setScope(s);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ scope });
    if (debounced) qs.set("q", debounced);
    getJson<{ records: MemoryRecord[]; learnedToday: number; total: number; counts: MemoryStats }>(`/api/memory?${qs}`, ctrl.signal)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError({ message: e.message, isConfig: e instanceof ApiError && e.isConfig });
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [scope, debounced]);

  const openEvidence = (r: MemoryRecord) =>
    setEvidence({ memory: { source: r.source, text: r.text, date: r.date, learnedAt: r.learnedAt, type: r.type }, patientId: r.patientId ?? undefined });

  const learnedToday = data?.learnedToday ?? 0;
  /** The actual memories Hindsight retained today, straight from their retain timestamps. */
  const recentlyLearned = useMemo(() => (data?.records ?? []).filter((r) => isToday(r.learnedAt)), [data]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Clinic memory · Hindsight"
        title="Memory"
        lede="Everything Clinic Desk has learned — this patient's chart facts and the anonymised outcomes shared across the practice. Click any memory to trace where it came from."
      />

      <div className="mem-explainer">
        <div className="mem-explainer-card src-patient">
          <span className="mec-top">
            <span className="kind-badge src-patient">Patient memory</span>
            <span className="mec-count">
              {data ? <CountUp value={data.counts.patient.facts} /> : "—"}
              <small>facts</small>
            </span>
          </span>
          <strong className="mec-title">Personal history</strong>
          <p>Each patient&apos;s own chart — visits, allergies, medicines, treatments tried and whether they worked. Every memory is tag-scoped so one patient&apos;s recall never returns another&apos;s.</p>
        </div>
        <div className="mem-explainer-card src-clinic">
          <span className="mec-top">
            <span className="kind-badge src-clinic">Clinic memory</span>
            <span className="mec-count">
              {data ? <CountUp value={data.counts.clinic.facts} /> : "—"}
              <small>facts</small>
            </span>
          </span>
          <strong className="mec-title">Collective experience</strong>
          <p>The practice&apos;s anonymised experience — age band, problem, treatment and result, with no names or identifiers. It lets the next similar patient benefit from the last.</p>
        </div>
      </div>

      {error?.isConfig ? (
        <SetupState what="memory" message={error.message} />
      ) : (
        <>
      {recentlyLearned.length > 0 && (
        <div className="section-block" style={{ marginTop: 0 }}>
          <div className="learned-band">
            <span className="lb-num">{learnedToday}</span>
            <span className="lb-text">
              <strong>Recently learned</strong>
              <p>
                Written to Hindsight today by a closed visit or a recorded outcome. These are already available to recall, which is what makes the next brief better than
                the last.
              </p>
            </span>
          </div>
          <div className="memcard-list">
            {recentlyLearned.map((r) => (
              <MemoryCard key={`new-${r.source}-${r.id}`} record={r} onOpen={openEvidence} />
            ))}
          </div>
        </div>
      )}

      <div className="section-title section-title-lg">
        <div>
          <span className="eyebrow">Browse</span>
          <h2>Every memory</h2>
        </div>
        <span className="section-hint">Select any memory to trace where it came from</span>
      </div>

      <div className="mem-controls">
        <div className="seg small" role="group" aria-label="Memory scope" style={{ margin: 0 }} ref={scopeRef}>
          {SCOPES.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={scope === v} className={scope === v ? "on" : ""} onClick={() => setScope(v)}>
              {label}
            </button>
          ))}
        </div>
        <div className="search-field" style={{ flex: 1, minWidth: 200 }}>
          <SearchIcon size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memory…" aria-label="Search memory" />
        </div>
        {data && (
          <span
            className="result-count"
            title={`Facts only. Hindsight also holds ${
              scope === "patient" ? data.counts.patient.observations : scope === "clinic" ? data.counts.clinic.observations : data.counts.patient.observations + data.counts.clinic.observations
            } observations derived from these facts, which are not listed so nothing is counted twice.`}
          >
            {data.records.length === data.total ? `${data.total} facts` : `${data.records.length} of ${data.total} facts`}
          </span>
        )}
      </div>

      {error ? (
        <EmptyState title="Memory is unavailable" hint={error.message} icon={<MemoryIcon size={20} />} />
      ) : loading && !data ? (
        <Loading label="Recalling from both memory banks…" rows={5} />
      ) : !data || data.records.length === 0 ? (
        <EmptyState
          title={debounced ? "No matching memories" : "No memories yet"}
          hint={debounced ? `Nothing matches “${debounced}”.` : "Record a visit and outcome in Consult to start building memory."}
          icon={<MemoryIcon size={20} />}
        />
      ) : (
        <div className="memcard-list memcard-grid">
          {data.records.map((r) => (
            <MemoryCard key={`${r.source}-${r.id}`} record={r} onOpen={openEvidence} />
          ))}
        </div>
      )}
        </>
      )}

      <section className="section-block loop-section" aria-labelledby="loop-title">
        <div className="section-title section-title-lg">
          <div>
            <span className="eyebrow">How it learns</span>
            <h2 id="loop-title">The Hindsight loop</h2>
          </div>
          <span className="section-hint">Every consultation runs this loop once</span>
        </div>
        <ArchitectureView />
      </section>

      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
    </div>
  );
}

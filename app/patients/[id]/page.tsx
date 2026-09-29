"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EvidenceDrawer, type Evidence } from "@/components/EvidenceDrawer";
import { MemoryCard } from "@/components/MemoryCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { BackIcon, ConsultIcon, MemoryIcon } from "@/components/icons";
import { Avatar, EmptyState, Loading } from "@/components/ui";
import { getJson } from "@/lib/client";
import { useSlidingIndicator } from "@/components/motion";
import { displayText, fmtDate, isToday } from "@/lib/text";
import type { ActivityItem, MemoryRecord, Patient } from "@/lib/types";

type Tab = "overview" | "timeline" | "memory" | "visits";
const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["timeline", "Timeline"],
  ["memory", "Memory"],
  ["visits", "Visits"],
];

export default function PatientProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [records, setRecords] = useState<MemoryRecord[] | null>(null);
  const [memError, setMemError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const subnavRef = useSlidingIndicator<HTMLDivElement>(`${tab}:${Boolean(patient)}`);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some(([v]) => v === t)) setTab(t as Tab);
  }, []);

  useEffect(() => {
    getJson<{ patients: Patient[] }>("/api/patients")
      .then((d) => {
        const p = d.patients.find((x) => x.id === id);
        if (p) setPatient(p);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
    getJson<{ records: MemoryRecord[] }>(`/api/memory?scope=patient&patientId=${encodeURIComponent(id)}`)
      .then((d) => setRecords(d.records))
      .catch((e: Error) => setMemError(e.message));
  }, [id]);

  const byDateAsc = useMemo(() => (records ? [...records].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")) : []), [records]);
  const visits = useMemo(() => (records ?? []).filter((r) => r.kind === "visit" || r.kind === "outcome"), [records]);
  const lastVisit = useMemo(() => visits.filter((r) => r.kind === "visit").sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0] ?? null, [visits]);
  const outcomes = useMemo(() => (records ?? []).filter((r) => r.kind === "outcome"), [records]);

  const openEvidence = (r: MemoryRecord) =>
    setEvidence({ memory: { source: r.source, text: r.text, date: r.date, learnedAt: r.learnedAt, type: r.type }, patientId: patient?.id, patientName: patient?.name });

  if (notFound) {
    return (
      <div className="page">
        <Link href="/patients" className="back-link">
          <BackIcon size={15} /> All patients
        </Link>
        <EmptyState title="Patient not found" hint="This patient is not on the roster." icon={<MemoryIcon size={20} />} />
      </div>
    );
  }
  if (!patient) {
    return (
      <div className="page">
        <Loading label="Loading patient…" />
      </div>
    );
  }

  const recentActivity: ActivityItem[] = (records ?? []).slice(0, 6).map((r) => ({
    id: r.id,
    kind: r.kind,
    source: r.source,
    text: r.text,
    patientId: r.patientId,
    patientName: patient.name,
    at: r.learnedAt,
    outcome: r.outcome,
  }));

  return (
    <div className="page">
      <Link href="/patients" className="back-link">
        <BackIcon size={15} /> All patients
      </Link>

      <header className="profile-hero">
        <Avatar patient={patient} size={64} />
        <div className="profile-id">
          <span className="eyebrow">Patient · {patient.id}</span>
          <h1>{patient.name}</h1>
          <div className="profile-meta">
            <span className="meta-chip">
              {patient.age} · {patient.sex === "M" ? "Male" : "Female"}
            </span>
            <span className="meta-dot" aria-hidden />
            <span className="meta-reason">{patient.tagline}</span>
            <span className="meta-dot" aria-hidden />
            <span className="meta-time">Today · {patient.slot}</span>
          </div>
        </div>
        <Link href={`/consult?patient=${patient.id}`} className="cta profile-cta">
          <ConsultIcon size={16} /> Start consult
        </Link>
      </header>

      <div className="subnav" role="tablist" aria-label="Patient views" ref={subnavRef}>
        {TABS.map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} className={tab === v ? "on" : ""} onClick={() => setTab(v)}>
            {label}
          </button>
        ))}
      </div>

      <div className="profile-layout">
        <div>
          {tab === "overview" && (
            <div className="card card-pad">
              <div className="section-title">
                <div>
                  <span className="eyebrow">From reception</span>
                  <h2>Reason for today&apos;s visit</h2>
                </div>
              </div>
              <blockquote className="complaint-quote">{patient.todayComplaint}</blockquote>
              <div className="section-block">
                <div className="section-title">
                  <span className="eyebrow">Recent activity</span>
                </div>
                {memError ? (
                  <EmptyState title="Memory unavailable" hint={memError} icon={<MemoryIcon size={20} />} />
                ) : !records ? (
                  <Loading label="Recalling chart…" rows={4} />
                ) : recentActivity.length === 0 ? (
                  <EmptyState title="No memories yet" hint="Close a visit in Consult to start this patient's chart." icon={<MemoryIcon size={20} />} />
                ) : (
                  <ActivityFeed items={recentActivity} />
                )}
              </div>
            </div>
          )}

          {tab === "timeline" && (
            <div className="card card-pad">
              <div className="section-title">
                <h2>Timeline</h2>
                <span className="result-count">{byDateAsc.length} entries</span>
              </div>
              {memError ? (
                <EmptyState title="Memory unavailable" hint={memError} icon={<MemoryIcon size={20} />} />
              ) : !records ? (
                <Loading label="Recalling chart…" rows={4} />
              ) : byDateAsc.length === 0 ? (
                <EmptyState title="No timeline yet" hint="This patient has no recorded history." icon={<MemoryIcon size={20} />} />
              ) : (
                <ol className="timeline">
                  {byDateAsc.map((e) => (
                    <li key={e.id} className={isToday(e.learnedAt) ? "tl-new" : ""}>
                      <time dateTime={e.date ?? undefined}>{fmtDate(e.date) || "undated"}</time>
                      <p>
                        {displayText(e.text)}
                        {isToday(e.learnedAt) && <span className="new-badge" style={{ marginLeft: 6 }}>New</span>}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {tab === "memory" && (
            <MemoryList records={records} error={memError} onOpen={openEvidence} emptyHint="This patient has no memories yet." />
          )}

          {tab === "visits" && (
            <MemoryList records={visits} error={memError} loading={!records} onOpen={openEvidence} emptyHint="No visits or outcomes recorded yet." />
          )}
        </div>

        <div className="profile-side">
          <div className="quiet-surface">
            <div className="section-title">
              <span className="eyebrow">Chart summary</span>
            </div>
            <dl className="detail-list">
              <div className="detail-row">
                <dt>Memories</dt>
                <dd>{records ? records.length : "—"}</dd>
              </div>
              <div className="detail-row">
                <dt>Visits recorded</dt>
                <dd>{records ? visits.filter((v) => v.kind === "visit").length : "—"}</dd>
              </div>
              <div className="detail-row">
                <dt>Outcomes recorded</dt>
                <dd>{records ? outcomes.length : "—"}</dd>
              </div>
              <div className="detail-row">
                <dt>Last visit</dt>
                <dd>{lastVisit ? fmtDate(lastVisit.date) : records ? "Not recorded" : "—"}</dd>
              </div>
              <div className="detail-row">
                <dt>Next appointment</dt>
                <dd>Today · {patient.slot}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
    </div>
  );
}

function MemoryList({
  records,
  error,
  loading,
  onOpen,
  emptyHint,
}: {
  records: MemoryRecord[] | null;
  error?: string | null;
  loading?: boolean;
  onOpen: (r: MemoryRecord) => void;
  emptyHint: string;
}) {
  return (
    <div className="card card-pad">
      <div className="section-title">
        <h2>Memory</h2>
        {records && <span className="result-count">{records.length} items</span>}
      </div>
      {error ? (
        <EmptyState title="Memory unavailable" hint={error} icon={<MemoryIcon size={20} />} />
      ) : loading || !records ? (
        <Loading label="Recalling memory…" />
      ) : records.length === 0 ? (
        <EmptyState title="Nothing here yet" hint={emptyHint} icon={<MemoryIcon size={20} />} />
      ) : (
        <div className="memcard-list">
          {records.map((r) => (
            <MemoryCard key={r.id} record={r} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

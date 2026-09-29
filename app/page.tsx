"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SetupState } from "@/components/SetupState";
import { ConsultIcon, MemoryIcon, OutcomeIcon, PatientsIcon, SparkIcon } from "@/components/icons";
import { Avatar, EmptyState, Loading, PageHeader, StatCard } from "@/components/ui";
import { ApiError, getJson } from "@/lib/client";
import type { OverviewData, Patient } from "@/lib/types";

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function OverviewPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [data, setData] = useState<OverviewData | null>(null);
  const [dataError, setDataError] = useState<{ message: string; isConfig: boolean } | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    getJson<{ patients: Patient[] }>("/api/patients")
      .then((d) => setPatients(d.patients))
      .catch(() => {});
    getJson<OverviewData>("/api/overview")
      .then(setData)
      .catch((e: Error) => setDataError({ message: e.message, isConfig: e instanceof ApiError && e.isConfig }));
  }, []);

  const completed = new Set(data?.completedPatientIds ?? []);
  const dateLabel = now?.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) ?? "";
  const pending = data ? data.patientsToday - data.completedToday : null;

  return (
    <div className="page">
      <PageHeader
        eyebrow={now ? greeting(now) : "Welcome"}
        title="Sunrise Family Clinic"
        lede={dateLabel ? `${dateLabel} · here is what is happening in the clinic today.` : "Here is what is happening in the clinic today."}
        actions={
          <Link href="/consult" className="cta">
            <ConsultIcon size={16} /> Start consulting
          </Link>
        }
      />

      <div className="stat-grid stat-grid-lead">
        <StatCard
          featured
          tone="accent"
          icon={<PatientsIcon size={17} />}
          label="Patients today"
          value={data?.patientsToday ?? (patients.length || "—")}
          meter={data ? { value: data.completedToday, max: data.patientsToday, label: `${data.completedToday} of ${data.patientsToday} visits completed` } : undefined}
          sub={data ? `${data.completedToday} seen · ${pending} in queue` : "on today's roster"}
        />
        <StatCard tone="neutral" icon={<ConsultIcon size={17} />} label="Pending visits" value={pending ?? "—"} sub={data ? `${data.completedToday} completed` : "awaiting Hindsight"} />
        <StatCard tone="violet" icon={<MemoryIcon size={17} />} label="Learned today" value={data?.learnedToday ?? "—"} sub="new memories, both banks" />
        <StatCard tone="accent" icon={<OutcomeIcon size={17} />} label="Outcomes recorded" value={data?.outcomesRecorded ?? "—"} sub="anonymised clinic cases" />
      </div>

      <div className="overview-cols">
        <section className="card flow-card" aria-labelledby="flow-title">
          <div className="section-title">
            <div>
              <span className="eyebrow">Today</span>
              <h2 id="flow-title">Clinic flow</h2>
            </div>
            <Link href="/consult">Open consult <span className="arrow" aria-hidden>→</span></Link>
          </div>
          {patients.length === 0 ? (
            <Loading label="Loading today's queue…" rows={5} />
          ) : (
            <ol className="flow-list">
              {patients.map((p) => {
                const done = completed.has(p.id);
                return (
                  <li key={p.id}>
                    <Link href={`/consult?patient=${p.id}`} className={`flow-item ${done ? "is-done" : ""}`}>
                      <span className="flow-time">{p.slot}</span>
                      <span className="flow-node" aria-hidden />
                      <Avatar patient={p} size={34} />
                      <span className="flow-body">
                        <span className="flow-name">
                          {p.name} <span className="rail-demo">{p.age}{p.sex}</span>
                        </span>
                        <span className="flow-reason">{p.tagline}</span>
                      </span>
                      <span className={`flow-state ${done ? "completed" : "upcoming"}`}>{done ? "Completed" : "In queue"}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="quiet-surface" aria-labelledby="intel-title">
          <div className="section-title">
            <div>
              <span className="eyebrow eyebrow-spark">
                <SparkIcon size={12} /> Hindsight
              </span>
              <h2 id="intel-title">Clinic intelligence</h2>
            </div>
            <Link href="/memory">Open memory <span className="arrow" aria-hidden>→</span></Link>
          </div>
          {dataError?.isConfig ? (
            <SetupState what="clinic intelligence" message={dataError.message} />
          ) : dataError ? (
            <EmptyState title="Memory is unavailable" hint={dataError.message} icon={<MemoryIcon size={20} />} />
          ) : !data ? (
            <Loading label="Recalling recent clinic activity…" rows={4} />
          ) : data.recent.length === 0 ? (
            <EmptyState title="Nothing learned yet" hint="Close a visit and record an outcome in Consult — it will appear here." icon={<SparkIcon size={20} />} />
          ) : (
            <>
              {data.learnedToday > 0 && (
                <p className="learned-inline">
                  <span className="new-badge">New</span> Clinic Desk learned {data.learnedToday} new {data.learnedToday === 1 ? "memory" : "memories"} today.
                </p>
              )}
              <ActivityFeed items={data.recent} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

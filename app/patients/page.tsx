"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PatientsIcon, SearchIcon } from "@/components/icons";
import { Avatar, EmptyState, Loading, PageHeader } from "@/components/ui";
import { getJson } from "@/lib/client";
import type { Patient } from "@/lib/types";

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getJson<{ patients: Patient[] }>("/api/patients")
      .then((d) => setPatients(d.patients))
      .catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!patients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => `${p.name} ${p.tagline} ${p.todayComplaint}`.toLowerCase().includes(q));
  }, [patients, query]);

  return (
    <div className="page">
      <PageHeader eyebrow="Patient intelligence" title="Patients" lede="Everyone on today's roster. Open a patient to see their chart, timeline and what Clinic Desk has learned about them." />

      <div className="patient-toolbar">
        <div className="search-field">
          <SearchIcon size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, condition or complaint…" aria-label="Search patients" />
        </div>
        {patients && (
          <span className="result-count">
            {filtered.length} of {patients.length}
          </span>
        )}
      </div>

      {error ? (
        <EmptyState title="Could not load patients" hint={error} icon={<PatientsIcon size={20} />} />
      ) : !patients ? (
        <Loading label="Loading the roster…" rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching patients" hint={`Nothing matches “${query}”.`} icon={<SearchIcon size={20} />} />
      ) : (
        <div className="patient-grid">
          {filtered.map((p) => (
            <Link key={p.id} href={`/patients/${p.id}`} className="patient-card">
              <span className="patient-card-top">
                <Avatar patient={p} size={42} />
                <span className="patient-card-slot">
                  <span className="eyebrow">Today</span>
                  <span className="mono">{p.slot}</span>
                </span>
              </span>
              <span className="patient-card-head">
                <strong>{p.name}</strong>
                <span className="patient-card-demo">
                  {p.age} · {p.sex === "M" ? "Male" : "Female"}
                </span>
              </span>
              <span className="patient-card-tag">{p.tagline}</span>
              <span className="patient-card-complaint">{p.todayComplaint}</span>
              <span className="patient-card-foot">
                <span>Open chart</span>
                <span aria-hidden>→</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

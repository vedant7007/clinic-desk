"use client";

import { useEffect, useState } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { EvidenceDrawer, type Evidence } from "@/components/EvidenceDrawer";
import { MemoryCard } from "@/components/MemoryCard";
import { SetupState } from "@/components/SetupState";
import { CaseIcon, InsightsIcon, MemoryIcon, OutcomeIcon } from "@/components/icons";
import { EmptyState, Loading, OUTCOME_LABEL, PageHeader, StatCard } from "@/components/ui";
import { ApiError, getJson } from "@/lib/client";
import { CountUp } from "@/components/motion";
import type { ClinicCaseSummary, InsightsData, MemoryRecord, Outcome } from "@/lib/types";

const ORDER: Outcome[] = ["resolved", "improved", "no_change", "worse"];

/** Show a recorded case with the same card as a memory: its fullest fact stands for the case. */
const caseRecord = (c: ClinicCaseSummary): MemoryRecord => ({
  id: c.documentId,
  documentId: c.documentId,
  source: "clinic",
  text: c.text,
  type: "world",
  date: c.date,
  learnedAt: c.learnedAt,
  tags: [],
  kind: "case",
  patientId: null,
  outcome: c.outcome,
});

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<{ message: string; isConfig: boolean } | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  useEffect(() => {
    getJson<InsightsData>("/api/insights")
      .then(setData)
      .catch((e: Error) => setError({ message: e.message, isConfig: e instanceof ApiError && e.isConfig }));
  }, []);

  const openEvidence = (r: MemoryRecord) => setEvidence({ memory: { source: r.source, text: r.text, date: r.date, learnedAt: r.learnedAt, type: r.type } });

  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="Clinic intelligence" title="Insights" lede="What Clinic Desk is learning from the clinic's accumulated experience." />
        {error.isConfig ? <SetupState what="insights" message={error.message} /> : <EmptyState title="Insights are unavailable" hint={error.message} icon={<InsightsIcon size={20} />} />}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <PageHeader eyebrow="Clinic intelligence" title="Insights" lede="What Clinic Desk is learning from the clinic's accumulated experience." />
        <Loading label="Aggregating clinic experience…" rows={4} />
      </div>
    );
  }

  const total = data.totalCases;
  const smallSample = total < 12;

  return (
    <div className="page">
      <PageHeader eyebrow="Clinic intelligence" title="Insights" lede="What Clinic Desk is learning from the clinic's accumulated experience — aggregated from real recorded outcomes only." />

      <div className="stat-grid stat-grid-lead">
        <StatCard featured tone="violet" icon={<CaseIcon size={17} />} label="Case outcomes recorded" value={total} sub={`${data.byOutcome.resolved + data.byOutcome.improved} resolved or improved · anonymised`} />
        <StatCard tone="accent" icon={<OutcomeIcon size={17} />} label="Learned today" value={data.learnedToday} sub="new memories, both banks" />
        <StatCard
          tone="accent"
          icon={<MemoryIcon size={17} />}
          label="Patient memory facts"
          value={data.banks.patient.facts}
          sub={`+ ${data.banks.patient.observations} derived observations`}
        />
        <StatCard
          tone="violet"
          icon={<MemoryIcon size={17} />}
          label="Clinic memory facts"
          value={data.banks.clinic.facts}
          sub={`from ${total + data.uncategorisedCases} cases · + ${data.banks.clinic.observations} observations`}
        />
      </div>

      <div className="insight-cols" style={{ marginTop: 24 }}>
        <section className="card card-pad emphasis-surface" aria-labelledby="dist-title">
          <div className="section-title">
            <div>
              <span className="eyebrow">Recorded results</span>
              <h2 id="dist-title">Outcome distribution</h2>
            </div>
            <span className="result-count">{total} cases</span>
          </div>
          {total === 0 ? (
            <EmptyState title="No outcomes yet" hint="Record an outcome in Consult and it will be counted here." icon={<OutcomeIcon size={20} />} />
          ) : (
            <>
              <div className="dist-strip" role="img" aria-label={ORDER.map((o) => `${OUTCOME_LABEL[o]} ${data.byOutcome[o]}`).join(", ")}>
                {ORDER.filter((o) => data.byOutcome[o] > 0).map((o) => (
                  <span key={o} className={`dist-seg o-${o}`} style={{ flexGrow: data.byOutcome[o] }} />
                ))}
              </div>
              <div className="bar-list">
                {ORDER.map((o) => {
                  const n = data.byOutcome[o];
                  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                  return (
                    <div key={o} className="bar-row">
                      <span className="bar-label">{OUTCOME_LABEL[o]}</span>
                      <span className="bar-track">
                        <span className={`bar-fill o-${o}`} style={{ width: `${n === 0 ? 0 : Math.max(pct, 4)}%` }} />
                      </span>
                      <span className="bar-num">
                        <CountUp value={n} />
                        <small>{pct}%</small>
                      </span>
                    </div>
                  );
                })}
              </div>
              {data.uncategorisedCases > 0 && (
                <p className="sample-note">
                  {data.uncategorisedCases} more {data.uncategorisedCases === 1 ? "case has" : "cases have"} no outcome category recorded, so {data.uncategorisedCases === 1 ? "it is" : "they are"} not
                  counted above.
                </p>
              )}
              {smallSample && (
                <p className="sample-note">
                  These are actual counts from {total} recorded {total === 1 ? "case" : "cases"} — too small a sample for statistical trends. The distribution grows more
                  meaningful as the clinic records more outcomes.
                </p>
              )}
            </>
          )}
        </section>

        <section className="quiet-surface" aria-labelledby="learning-title">
          <div className="section-title">
            <div>
              <span className="eyebrow">Latest</span>
              <h2 id="learning-title">Recent clinic learning</h2>
            </div>
          </div>
          {data.recentActivity.length === 0 ? (
            <EmptyState title="No activity yet" hint="Clinic-level learning appears here as outcomes are recorded." icon={<InsightsIcon size={20} />} />
          ) : (
            <ActivityFeed items={data.recentActivity} />
          )}
        </section>
      </div>

      <div className="section-block">
        <div className="section-title section-title-lg">
          <div>
            <span className="eyebrow">Anonymised</span>
            <h2>Similar-case evidence</h2>
          </div>
          <span className="section-hint">The most recently recorded cases</span>
        </div>
        {data.recentCases.length === 0 ? (
          <EmptyState title="No clinic cases yet" hint="Anonymised case outcomes will appear here for inspection." icon={<CaseIcon size={20} />} />
        ) : (
          <div className="memcard-list">
            {data.recentCases.map((c) => (
              <MemoryCard key={c.documentId} record={caseRecord(c)} onOpen={openEvidence} />
            ))}
          </div>
        )}
      </div>

      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
    </div>
  );
}

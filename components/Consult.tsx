"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BriefCard } from "@/components/BriefCard";
import { EvidenceDrawer, type Evidence } from "@/components/EvidenceDrawer";
import { HindsightTrace, type TracePhase } from "@/components/HindsightTrace";
import { MemoryPanel } from "@/components/MemoryPanel";
import { MemoryIcon, OutcomeIcon, SparkIcon, VisitIcon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { prefersReducedMotion, useSlidingIndicator } from "@/components/motion";
import { getJson, postJson } from "@/lib/client";
import { isToday, suggestProblem } from "@/lib/text";
import type { BriefResult, MemoryItem, Outcome, Patient, RetainReceipt } from "@/lib/types";

type Status = { hindsight: boolean; groq: boolean };
type Toast = { kind: "ok" | "err"; text: string } | null;
type CloseTab = "visit" | "outcome";

const STEPS = ["Recalling the patient's chart", "Recalling similar cases across the clinic", "Reasoning over both"];
const OUTCOMES: [Outcome, string][] = [
  ["resolved", "Resolved"],
  ["improved", "Improved"],
  ["no_change", "No change"],
  ["worse", "Worse"],
];
const MAX = { complaint: 1000, notes: 1000, plan: 1000, problem: 300, treatment: 500, detail: 1000, question: 500 };

const firstName = (p: Patient) => p.name.split(" ")[0];

/** Let the shell (and any other page) refresh its memory counts after a write. */
const notifyMemoryChanged = () => window.dispatchEvent(new CustomEvent("clinicdesk:memory-changed"));

export function Consult({ initialPatientId }: { initialPatientId?: string }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [selectedId, setSelectedId] = useState<string>(initialPatientId ?? "P001");
  const [complaint, setComplaint] = useState("");
  const [compare, setCompare] = useState(true);
  const [result, setResult] = useState<BriefResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [tab, setTab] = useState<CloseTab>("visit");
  const [chartVersion, setChartVersion] = useState(0);
  const [learned, setLearned] = useState<CloseTab | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState("");
  const [problem, setProblem] = useState("");
  const [problemEdited, setProblemEdited] = useState(false);
  const [treatment, setTreatment] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("resolved");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedVisit, setSavedVisit] = useState<string | null>(null);
  const [savedOutcome, setSavedOutcome] = useState<string | null>(null);
  // What Hindsight actually confirmed writing. Null until that write has been made.
  const [visitReceipt, setVisitReceipt] = useState<RetainReceipt | null>(null);
  const [outcomeReceipts, setOutcomeReceipts] = useState<{ patient: RetainReceipt; clinic: RetainReceipt } | null>(null);

  const [question, setQuestion] = useState("");
  const [askScope, setAskScope] = useState<"patient" | "clinic">("patient");
  const [answer, setAnswer] = useState<{ text: string; basedOn: string[]; failed?: boolean; scope?: "patient" | "clinic" } | null>(null);
  const [asking, setAsking] = useState(false);
  // Motion only: a brief confirmation pulse on the CTA, and the toast's exit.
  const [justPrepared, setJustPrepared] = useState(false);
  const [toastLeaving, setToastLeaving] = useState(false);

  const busy = useRef(false);
  async function exclusive(fn: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn();
    } finally {
      busy.current = false;
    }
  }

  const patient = useMemo(() => patients.find((p) => p.id === selectedId), [patients, selectedId]);
  const queueRef = useSlidingIndicator<HTMLUListElement>(`${selectedId}:${patients.length}`, '[aria-current="true"]');
  const closeTabsRef = useSlidingIndicator<HTMLDivElement>(`${tab}:${Boolean(result)}`);
  const outcomeRef = useSlidingIndicator<HTMLDivElement>(`${outcome}:${tab}:${Boolean(result)}`);
  const askRef = useSlidingIndicator<HTMLDivElement>(askScope);
  const selectedIndex = useMemo(() => patients.findIndex((p) => p.id === selectedId), [patients, selectedId]);
  const visitKey = JSON.stringify([selectedId, complaint.trim(), notes.trim(), plan.trim()]);
  const outcomeKey = JSON.stringify([selectedId, problem.trim(), treatment.trim(), outcome, detail.trim()]);

  useEffect(() => {
    getJson<{ patients: Patient[]; configured: Status }>("/api/patients")
      .then((d) => {
        setPatients(d.patients);
        setStatus(d.configured);
        if (initialPatientId && d.patients.some((p) => p.id === initialPatientId)) setSelectedId(initialPatientId);
      })
      .catch(() => setError("Could not load today's queue. Check that the app is running and refresh."));
  }, [initialPatientId]);

  useEffect(() => {
    if (!patient) return;
    setComplaint(patient.todayComplaint);
    setResult(null);
    setError(null);
    setAnswer(null);
    setNotes("");
    setPlan("");
    setProblem("");
    setProblemEdited(false);
    setTreatment("");
    setDetail("");
    setVisitReceipt(null);
    setOutcomeReceipts(null);
    setLearned(null);
    setTab("visit");
  }, [patient]);

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const t1 = setTimeout(() => setStep(1), 700);
    const t2 = setTimeout(() => setStep(2), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [loading]);

  useEffect(() => {
    if (!toast) return;
    setToastLeaving(false);
    const hold = toast.kind === "err" ? 8000 : 4500;
    const leave = setTimeout(() => setToastLeaving(true), hold);
    const gone = setTimeout(() => setToast(null), hold + 220);
    return () => {
      clearTimeout(leave);
      clearTimeout(gone);
    };
  }, [toast]);

  useEffect(() => {
    if (!justPrepared) return;
    const t = setTimeout(() => setJustPrepared(false), 900);
    return () => clearTimeout(t);
  }, [justPrepared]);

  const prepare = () =>
    exclusive(async () => {
      if (!patient || !complaint.trim()) return;
      setLoading(true);
      setError(null);
      setResult(null);
      setLearned(null);
      try {
        const r = await postJson<BriefResult>("/api/brief", { patientId: patient.id, complaint, compare });
        setResult(r);
        setJustPrepared(true);
        if (!problemEdited) setProblem(suggestProblem(r.withMemory.problem, complaint));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    });

  const saveVisit = () =>
    exclusive(async () => {
      if (!patient || !plan.trim() || savedVisit === visitKey) return;
      setSaving(true);
      try {
        const r = await postJson<{ patient: RetainReceipt }>("/api/visit", { patientId: patient.id, complaint, notes, plan });
        setVisitReceipt(r.patient);
        setSavedVisit(visitKey);
        setChartVersion((v) => v + 1);
        setLearned("visit");
        notifyMemoryChanged();
        setToast({ kind: "ok", text: `Visit saved to ${firstName(patient)}'s memory. Next time, the brief will know.` });
        if (!problemEdited && !problem.trim()) setProblem(suggestProblem(result?.withMemory.problem, complaint));
        if (!treatment.trim()) setTreatment(plan);
        setTab("outcome");
      } catch (e) {
        setToast({ kind: "err", text: (e as Error).message });
      } finally {
        setSaving(false);
      }
    });

  const saveOutcome = () =>
    exclusive(async () => {
      if (!patient || !problem.trim() || !treatment.trim() || savedOutcome === outcomeKey) return;
      setSaving(true);
      try {
        const r = await postJson<{ ok: boolean; patient: RetainReceipt; clinic: RetainReceipt }>("/api/outcome", {
          patientId: patient.id,
          problem,
          treatment,
          outcome,
          detail,
        });
        setSavedOutcome(outcomeKey);
        setOutcomeReceipts({ patient: r.patient, clinic: r.clinic });
        setChartVersion((v) => v + 1);
        setLearned("outcome");
        notifyMemoryChanged();
        // A partial write is reported as partial, never as a clean success.
        setToast(
          r.ok
            ? { kind: "ok", text: "Outcome learned. Saved to the patient's chart and, anonymised, to clinic memory." }
            : { kind: "err", text: `Partly saved: ${[r.patient, r.clinic].find((x) => !x.ok)?.error ?? "one memory bank refused the write."}` }
        );
      } catch (e) {
        setToast({ kind: "err", text: (e as Error).message });
      } finally {
        setSaving(false);
      }
    });

  const ask = () =>
    exclusive(async () => {
      if (!question.trim()) return;
      setAsking(true);
      setAnswer(null);
      const scope = askScope;
      try {
        const r = await postJson<{ text: string; basedOn: string[] }>("/api/ask", { patientId: patient?.id, question, scope });
        setAnswer({ ...r, scope });
      } catch (e) {
        setAnswer({ text: (e as Error).message, basedOn: [], failed: true, scope });
      } finally {
        setAsking(false);
      }
    });

  function onRefHover(ref: string | null) {
    setHighlight(ref);
    // Only when the memory rail scrolls on its own (three-column layout). Below that the rail
    // sits under the workspace, and scrolling would pull the page out from under the pointer.
    if (ref && window.matchMedia("(min-width: 1441px)").matches) {
      document.getElementById(`mem-${ref}`)?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }

  function onRefClick(ref: string, claim: string) {
    const memory = result?.memories.find((m) => m.ref === ref);
    if (!memory) return;
    setEvidence({ memory, claim, patientId: patient?.id, patientName: patient?.name });
  }

  function onTabKey(e: React.KeyboardEvent, current: CloseTab) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next: CloseTab = current === "visit" ? "outcome" : "visit";
    setTab(next);
    document.getElementById(`closetab-${next}`)?.focus();
  }

  const patientCount = result?.memories.filter((m) => m.source === "patient").length ?? 0;
  const clinicCount = result?.memories.filter((m) => m.source === "clinic").length ?? 0;
  const learnedToday = result?.memories.filter((m: MemoryItem) => isToday(m.learnedAt)).length ?? 0;
  const visitSaved = savedVisit === visitKey;
  const outcomeSaved = savedOutcome === outcomeKey;
  const groqMissing = status && !status.groq;

  // Number of brief claims grounded in a recalled memory (a real count, not invented).
  const citationCount = result
    ? [...result.withMemory.flags, ...result.withMemory.whatWorked].filter((c) => c.refs.some((r) => r !== "NOW")).length
    : 0;
  const tracePhase: TracePhase = loading ? (step >= 2 ? "reasoning" : "recalling") : result ? "ready" : "idle";
  const showTrace = loading || Boolean(result);

  /**
   * The honest difference between the two briefs: memories each side could see, and
   * claims each side could cite. Both are counted from the real results — the memoryless
   * brief is never edited or weakened to make the comparison look better.
   */
  const comparison = result?.withoutMemory
    ? {
        without: { memories: 0, cited: 0, flags: result.withoutMemory.flags.length },
        with: { memories: result.memories.length, cited: citationCount, flags: result.withMemory.flags.length },
      }
    : null;

  function openBasedOn(text: string, scope: "patient" | "clinic") {
    setEvidence({ memory: { source: scope, text, date: null, learnedAt: null, type: "world" }, patientId: scope === "patient" ? patient?.id : undefined, patientName: scope === "patient" ? patient?.name : undefined });
  }

  return (
    <div className="page consult-page">
      <main className="grid">
        <nav className="queue" aria-label="Today's queue">
          <div className="rail-head">
            <h2>Today&apos;s queue</h2>
            <span className="rail-count">{patients.length}</span>
          </div>
          <ul ref={queueRef}>
            {patients.map((p, i) => {
              const state = p.id === selectedId ? "is-current" : i < selectedIndex ? "is-done" : "is-upcoming";
              return (
                <li key={p.id}>
                  <button type="button" className={`rail-item ${state}`} aria-current={p.id === selectedId ? "true" : undefined} onClick={() => setSelectedId(p.id)}>
                    <span className="rail-time">{p.slot}</span>
                    <span className="rail-track" aria-hidden>
                      <span className="rail-dot" />
                    </span>
                    <span className="rail-body">
                      <span className="rail-name">
                        <strong>{p.name}</strong>
                        <span className="rail-demo">
                          {p.age}
                          {p.sex}
                        </span>
                      </span>
                      <span className="rail-reason">{p.tagline}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="consult" aria-label="Consultation">
          {!patient && error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {patient && (
            <>
              <div className="patient-id swap-in" key={patient.id}>
                <Avatar patient={patient} size={54} />
                <div className="patient-id-text">
                  <span className="eyebrow">Active patient · {patient.slot}</span>
                  <h1 className="patient-name">{patient.name}</h1>
                  <div className="patient-meta">
                    <span className="meta-chip">
                      {patient.age} · {patient.sex === "M" ? "Male" : "Female"}
                    </span>
                    <span className="meta-dot" aria-hidden />
                    <span className="meta-reason">{patient.tagline}</span>
                  </div>
                </div>
                <Link href={`/patients/${patient.id}`} className="ghost-btn">
                  Profile <span className="arrow" aria-hidden>→</span>
                </Link>
              </div>

              <label className="field visit-field">
                <span className="eyebrow">Reason for visit · from reception</span>
                <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={3} maxLength={MAX.complaint} />
                {complaint.length > MAX.complaint * 0.8 && (
                  <small className="counter">
                    {complaint.length} / {MAX.complaint}
                  </small>
                )}
              </label>

              <div className="prepare-bar">
                <div className="prepare-copy">
                  <strong>Prepare the brief</strong>
                  <small>Recall {firstName(patient)}&apos;s history and what worked for similar patients — in ~20 seconds.</small>
                </div>
                <div className="prepare-actions" style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                  <button type="button" className="compare" role="switch" aria-checked={compare} onClick={() => setCompare((c) => !c)}>
                    <span className="switch" aria-hidden />
                    <span className="compare-text">
                      <strong>Comparison mode</strong>
                      <small>Show a memoryless assistant</small>
                    </span>
                  </button>
                  <button type="button" className={`cta cta-lg ${justPrepared ? "is-success" : ""}`} onClick={prepare} disabled={loading || !complaint.trim()} aria-busy={loading}>
                    {loading ? (
                      <>
                        <span className="spin" aria-hidden /> Preparing…
                      </>
                    ) : (
                      <>
                        Prepare brief <kbd>↵</kbd>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {loading && (
                <ol className="steps" aria-live="polite">
                  {STEPS.map((s, i) => (
                    <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>
                      {s}
                    </li>
                  ))}
                </ol>
              )}

              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}

              {result && (
                <>
                  <div className="stats">
                    <span>
                      <b>{patientCount}</b> from the chart
                    </span>
                    <span>
                      <b>{clinicCount}</b> from similar cases
                    </span>
                    <span>
                      recall <b>{result.timings.recallMs} ms</b>
                    </span>
                    <span>
                      reasoning <b>{(result.timings.llmMs / 1000).toFixed(1)} s</b>
                    </span>
                    <span title={result.fallbackUsed ? "The primary model was unavailable, so the fallback model wrote this brief" : undefined}>
                      model <b>{result.model}</b>
                      {result.fallbackUsed ? " (fallback)" : ""}
                    </span>
                  </div>
                  {learnedToday > 0 && (
                    <div className="learned-banner" role="status">
                      <span className="new-badge">New</span> This brief uses {learnedToday} {learnedToday === 1 ? "memory" : "memories"} Clinic Desk learned today. Look
                      for the New badge in the memory panel.
                    </div>
                  )}
                  {result.compareFailed && <p className="note">The memoryless comparison could not be generated this time (the model was busy). The brief below is complete.</p>}
                  {comparison && (
                    <div className="cmp-strip" role="group" aria-label="What memory changed">
                      <div className="cmp-side cmp-without">
                        <span className="cmp-head">Without Hindsight</span>
                        <dl>
                          <div>
                            <dt>Memories available</dt>
                            <dd>{comparison.without.memories}</dd>
                          </div>
                          <div>
                            <dt>Claims cited to evidence</dt>
                            <dd>{comparison.without.cited}</dd>
                          </div>
                          <div>
                            <dt>Flags raised</dt>
                            <dd>{comparison.without.flags}</dd>
                          </div>
                        </dl>
                        <p className="cmp-note">Today&apos;s complaint only. No chart, no clinic experience.</p>
                      </div>
                      <div className="cmp-side cmp-with">
                        <span className="cmp-head">With Hindsight</span>
                        <dl>
                          <div>
                            <dt>Memories available</dt>
                            <dd>
                              {comparison.with.memories}
                              <small>
                                {patientCount} patient · {clinicCount} clinic
                              </small>
                            </dd>
                          </div>
                          <div>
                            <dt>Claims cited to evidence</dt>
                            <dd>{comparison.with.cited}</dd>
                          </div>
                          <div>
                            <dt>Flags raised</dt>
                            <dd>{comparison.with.flags}</dd>
                          </div>
                        </dl>
                        <p className="cmp-note">
                          Same prompt, same model. The only difference is the recalled context — both briefs below are shown exactly as the model wrote them.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className={`briefs ${result.withoutMemory ? "two" : "one"}`}>
                    {result.withoutMemory && <BriefCard brief={result.withoutMemory} variant="generic" />}
                    <BriefCard brief={result.withMemory} variant="memory" onRefHover={onRefHover} onRefClick={onRefClick} memories={result.memories} />
                  </div>

                  <div className="close">
                    <div className="tabs" role="tablist" aria-label="After the consultation" ref={closeTabsRef}>
                      {(
                        [
                          ["visit", "1 · Close the visit"],
                          ["outcome", "2 · Record the outcome"],
                        ] as [CloseTab, string][]
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          id={`closetab-${v}`}
                          type="button"
                          role="tab"
                          aria-selected={tab === v}
                          aria-controls="close-panel"
                          tabIndex={tab === v ? 0 : -1}
                          className={tab === v ? "on" : ""}
                          onClick={() => setTab(v)}
                          onKeyDown={(e) => onTabKey(e, v)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {learned && !outcomeSaved && (
                      <div className="learn-cta" role="status">
                        <div>
                          <strong>
                            Hindsight retained this {learned}
                            {learned === "visit" && visitReceipt?.items !== null && visitReceipt?.items !== undefined
                              ? ` · ${visitReceipt.items} ${visitReceipt.items === 1 ? "fact" : "facts"} accepted`
                              : ""}
                            .
                          </strong>
                          <p>
                            {learned === "visit"
                              ? "It is now in the patient's chart. Re-run the brief to see it recalled."
                              : "It is in the patient's chart and, anonymised, in clinic memory. Re-run the brief to see the new memory used."}
                          </p>
                        </div>
                        <button type="button" className="primary" onClick={prepare} disabled={loading}>
                          Re-run the brief
                        </button>
                      </div>
                    )}

                    <div id="close-panel" role="tabpanel" aria-labelledby={`closetab-${tab}`}>
                      {tab === "visit" ? (
                        <div className="form">
                          <p className="lede">Saved to this patient&apos;s memory, so the next brief starts from here.</p>
                          <label className="field">
                            <span>Findings</span>
                            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={MAX.notes} placeholder="e.g. Chest clear, BP 134/84" />
                          </label>
                          <label className="field">
                            <span>Plan</span>
                            <input value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={MAX.plan} placeholder="e.g. Switched lisinopril to losartan, review in 3 weeks" />
                          </label>
                          <button type="button" className={`primary ${visitSaved ? "is-saved" : ""}`} onClick={saveVisit} disabled={saving || !plan.trim() || visitSaved} aria-busy={saving}>
                            {visitSaved && <OutcomeIcon size={15} className="saved-check" />}
                            {saving ? "Saving…" : visitSaved ? "Saved to memory" : "Save visit to memory"}
                          </button>
                        </div>
                      ) : (
                        <div className="form">
                          <p className="lede">
                            Did it work? This is how Clinic Desk learns. It goes to the patient&apos;s chart and, with no name attached, into clinic memory for the next
                            similar patient.
                          </p>
                          <div className="row">
                            <label className="field">
                              <span>Problem</span>
                              <input
                                value={problem}
                                onChange={(e) => {
                                  setProblem(e.target.value);
                                  setProblemEdited(true);
                                }}
                                maxLength={MAX.problem}
                                placeholder="e.g. dry cough on lisinopril"
                              />
                            </label>
                            <label className="field">
                              <span>Treatment</span>
                              <input value={treatment} onChange={(e) => setTreatment(e.target.value)} maxLength={MAX.treatment} placeholder="e.g. switched to losartan" />
                            </label>
                          </div>
                          <div className="seg" role="group" aria-label="Outcome" ref={outcomeRef}>
                            {OUTCOMES.map(([v, l]) => (
                              <button key={v} type="button" aria-pressed={outcome === v} className={`seg-${v} ${outcome === v ? "on" : ""}`} onClick={() => setOutcome(v)}>
                                {l}
                              </button>
                            ))}
                          </div>
                          <label className="field">
                            <span>Detail (optional)</span>
                            <input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={MAX.detail} placeholder="e.g. Cough gone in 2 weeks, BP 132/84" />
                          </label>
                          <button type="button" className={`primary ${outcomeSaved ? "is-saved" : ""}`} onClick={saveOutcome} disabled={saving || !problem.trim() || !treatment.trim() || outcomeSaved} aria-busy={saving}>
                            {outcomeSaved && <OutcomeIcon size={15} className="saved-check" />}
                            {saving ? "Saving…" : outcomeSaved ? "Learned" : "Teach Clinic Desk"}
                          </button>

                          {outcomeSaved && outcomeReceipts && (
                            <div className="loop-complete">
                              <div className="loop-complete-head">
                                <span className="loop-check" aria-hidden>
                                  <OutcomeIcon size={19} />
                                </span>
                                <div>
                                  <h3>Visit complete</h3>
                                  <p className="lede" style={{ marginTop: 2 }}>
                                    Outcome recorded.{" "}
                                    {outcomeReceipts.patient.ok && outcomeReceipts.clinic.ok
                                      ? "Hindsight confirmed both writes."
                                      : "Hindsight refused part of this write — see below."}
                                  </p>
                                </div>
                              </div>
                              <div className="loop-steps">
                                <span className="loop-step">
                                  <VisitIcon size={13} /> Consultation
                                </span>
                                <span className="loop-arrow">→</span>
                                <span className="loop-step">
                                  <OutcomeIcon size={13} /> Outcome
                                </span>
                                <span className="loop-arrow">→</span>
                                <span className="loop-step">
                                  <MemoryIcon size={13} /> Memory updated
                                </span>
                                <span className="loop-arrow">→</span>
                                <span className="loop-step">
                                  <SparkIcon size={13} /> Future recall
                                </span>
                              </div>

                              <span className="learned-title">What was learned</span>
                              <div className="learned-writes">
                                {([
                                  [outcomeReceipts.patient, "Patient memory", `${patient.name}'s chart · tagged patient:${patient.id}`],
                                  [outcomeReceipts.clinic, "Clinic memory", "Anonymised — no name, no id"],
                                ] as [RetainReceipt, string, string][]).map(([r, label, hint]) => (
                                  <div key={r.bank} className={`learned-write src-${r.bank} ${r.ok ? "is-ok" : "is-failed"}`}>
                                    <div className="lw-head">
                                      <span className={`kind-badge src-${r.bank}`}>{label}</span>
                                      <span className={`lw-state ${r.ok ? "ok" : "failed"}`}>
                                        {r.ok ? (r.items !== null ? `${r.items} ${r.items === 1 ? "fact" : "facts"} accepted` : "written") : "write failed"}
                                      </span>
                                    </div>
                                    <p className="lw-hint">{hint}</p>
                                    {r.ok ? <p className="lw-text">{r.text}</p> : <p className="lw-error">{r.error}</p>}
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                                <button type="button" className="primary" onClick={prepare} disabled={loading}>
                                  Re-run the brief
                                </button>
                                <Link href="/memory?scope=all" className="ghost-btn">
                                  See what was learned in Memory
                                </Link>
                              </div>
                              <p className="lw-proof">
                                Re-running the brief recalls these memories from Hindsight, not from this page. When a recalled memory carries the{" "}
                                <span className="new-badge">New</span> badge, the loop has closed.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!result && !loading && !error && (
                <div className="placeholder">
                  <span className="ph-mark" aria-hidden>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3a6 6 0 0 0-6 6c0 2 1 3.2 2 4.2.7.7 1 1.2 1 2.3v.5h6v-.5c0-1.1.3-1.6 1-2.3 1-1 2-2.2 2-4.2a6 6 0 0 0-6-6z" />
                      <path d="M9.5 20h5M10 22h4" />
                    </svg>
                  </span>
                  <p>
                    Press <b>Prepare brief</b>. Clinic Desk recalls {firstName(patient)}&apos;s history and what worked for similar patients in this clinic, then tells you
                    what matters in 20 seconds.
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="memory" aria-label="Memory">
          {showTrace && (
            <div className="panel">
              <div className="panel-head">
                <div className="head-text">
                  <span className="eyebrow">Live pipeline</span>
                  <h2>Hindsight trace</h2>
                </div>
                <span className="powered-tag">Hindsight</span>
              </div>
              <div className="panel-body">
                <HindsightTrace
                  state={{
                    phase: tracePhase,
                    patientCount,
                    clinicCount,
                    citationCount,
                    model: result?.model,
                    llmMs: result?.timings.llmMs,
                    recallMs: result?.timings.recallMs,
                    fallbackUsed: result?.fallbackUsed,
                    visitReceipt,
                    outcomePatientReceipt: outcomeReceipts?.patient ?? null,
                    outcomeClinicReceipt: outcomeReceipts?.clinic ?? null,
                    recalledLearnedToday: learnedToday,
                  }}
                />
              </div>
            </div>
          )}
          <div className="panel">
            <div className="panel-head">
              <div className="head-text">
                <span className="eyebrow">Clinic memory</span>
                <h2>What Clinic Desk remembered</h2>
              </div>
              <span className="powered-tag">Hindsight</span>
            </div>
            <div className="panel-body">
              {patient && <MemoryPanel memories={result?.memories ?? null} highlight={highlight ?? evidence?.memory.ref ?? null} loading={loading} patient={patient} chartVersion={chartVersion} />}
            </div>
          </div>

          <div className="panel ask">
            <div className="panel-head">
              <div className="head-text">
                <span className="eyebrow">Intelligence</span>
                <h2 id="ask-title">Ask the memory</h2>
              </div>
            </div>
            <div className="panel-body">
              <div className="seg small" role="group" aria-label="Ask about" ref={askRef}>
                <button type="button" aria-pressed={askScope === "patient"} className={askScope === "patient" ? "on" : ""} onClick={() => setAskScope("patient")}>
                  This patient
                </button>
                <button type="button" aria-pressed={askScope === "clinic"} className={askScope === "clinic" ? "on" : ""} onClick={() => setAskScope("clinic")}>
                  Whole clinic
                </button>
              </div>
              <form
                aria-labelledby="ask-title"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={MAX.question}
                  aria-label={askScope === "patient" ? `Question about ${patient?.name ?? "this patient"}` : "Question about the whole clinic"}
                  placeholder={askScope === "patient" ? "Which treatments have failed before?" : "What worked for ACE-inhibitor cough?"}
                />
                <button type="submit" className="primary" disabled={asking || !question.trim()}>
                  {asking ? "Asking…" : "Ask"}
                </button>
              </form>
              {answer && (
                <div className={`answer ${answer.failed ? "error" : ""}`} role={answer.failed ? "alert" : "status"}>
                  <p>{answer.text}</p>
                  {answer.basedOn.length > 0 && (
                    <details>
                      <summary>Based on {answer.basedOn.length} {answer.basedOn.length === 1 ? "memory" : "memories"} · click to inspect</summary>
                      <ul className="basedon">
                        {answer.basedOn.map((b, i) => (
                          <li key={i}>
                            <button type="button" onClick={() => openBasedOn(b, answer.scope ?? "patient")}>
                              {b}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>

      {groqMissing && (
        <p className="foot" style={{ paddingTop: 0 }}>
          Add <code style={{ fontFamily: "var(--mono)" }}>GROQ_API_KEY</code> in <code style={{ fontFamily: "var(--mono)" }}>.env.local</code> to generate briefs.
        </p>
      )}
      <footer className="foot">Decision support only. Clinic Desk never diagnoses or doses; the doctor decides. All patients shown are synthetic.</footer>

      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />

      <div className="toast-region" aria-live="polite">
        {toast && (
          <div className={`toast toast-${toast.kind} ${toastLeaving ? "is-leaving" : ""}`} role={toast.kind === "err" ? "alert" : "status"}>
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BriefCard } from "@/components/BriefCard";
import { MemoryPanel } from "@/components/MemoryPanel";
import { isToday, suggestProblem } from "@/lib/text";
import type { BriefResult, MemoryStats, Outcome, Patient } from "@/lib/types";

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
/** Same limits as the API routes, so the browser stops input before the server rejects it. */
const MAX = { complaint: 1000, notes: 1000, plan: 1000, problem: 300, treatment: 500, detail: 1000, question: 500 };

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Clinic Desk's server could not be reached. Check that the app is running.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

const firstName = (p: Patient) => p.name.split(" ")[0];

export default function Home() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [selectedId, setSelectedId] = useState<string>("P001");
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
  const [memStats, setMemStats] = useState<MemoryStats | null>(null);
  const [memError, setMemError] = useState<string | null>(null);
  /** Set after a save: the brief on screen predates what Clinic Desk just learned. */
  const [learned, setLearned] = useState<CloseTab | null>(null);

  // close-visit form
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState("");
  // outcome form
  const [problem, setProblem] = useState("");
  /** Once the doctor edits the problem, suggestions stop overwriting it. */
  const [problemEdited, setProblemEdited] = useState(false);
  const [treatment, setTreatment] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("resolved");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharedText, setSharedText] = useState<string | null>(null);
  /** What was last written, so the same content cannot be sent twice. */
  const [savedVisit, setSavedVisit] = useState<string | null>(null);
  const [savedOutcome, setSavedOutcome] = useState<string | null>(null);

  // ask
  const [question, setQuestion] = useState("");
  const [askScope, setAskScope] = useState<"patient" | "clinic">("patient");
  const [answer, setAnswer] = useState<{ text: string; basedOn: string[]; failed?: boolean } | null>(null);
  const [asking, setAsking] = useState(false);

  /**
   * Synchronous lock: React state updates are async, so two fast clicks can both see
   * `saving === false`. The ref flips immediately and blocks the second request.
   */
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
  const visitKey = JSON.stringify([selectedId, complaint.trim(), notes.trim(), plan.trim()]);
  const outcomeKey = JSON.stringify([selectedId, problem.trim(), treatment.trim(), outcome, detail.trim()]);

  /** Counts come straight from Hindsight; on any failure the header shows no number, and the banner says why. */
  function loadStats() {
    fetch("/api/stats")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || typeof d.patient !== "number") throw new Error(d.error || "Memory is unavailable right now.");
        setMemStats(d as MemoryStats);
        setMemError(null);
      })
      .catch((e: Error) => {
        setMemStats(null);
        setMemError(e.message);
      });
  }

  useEffect(loadStats, [chartVersion]);

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setPatients(d.patients);
        setStatus(d.configured);
      })
      .catch(() => setError("Could not load today's queue. Check that the app is running and refresh."));
  }, []);

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
    setSharedText(null);
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
    const t = setTimeout(() => setToast(null), toast.kind === "err" ? 8000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const prepare = () =>
    exclusive(async () => {
      if (!patient || !complaint.trim()) return;
      setLoading(true);
      setError(null);
      setResult(null);
      setLearned(null);
      try {
        const r = await post<BriefResult>("/api/brief", { patientId: patient.id, complaint, compare });
        setResult(r);
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
        await post("/api/visit", { patientId: patient.id, complaint, notes, plan });
        setSavedVisit(visitKey);
        setChartVersion((v) => v + 1);
        setLearned("visit");
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
        const r = await post<{ sharedText: string }>("/api/outcome", { patientId: patient.id, problem, treatment, outcome, detail });
        setSavedOutcome(outcomeKey);
        setSharedText(r.sharedText);
        setChartVersion((v) => v + 1);
        setLearned("outcome");
        setToast({ kind: "ok", text: "Outcome learned. Saved to the patient's chart and, anonymised, to clinic memory." });
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
      try {
        setAnswer(await post("/api/ask", { patientId: patient?.id, question, scope: askScope }));
      } catch (e) {
        setAnswer({ text: (e as Error).message, basedOn: [], failed: true });
      } finally {
        setAsking(false);
      }
    });

  function onRefHover(ref: string | null) {
    setHighlight(ref);
    if (ref) document.getElementById(`mem-${ref}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function onTabKey(e: React.KeyboardEvent, current: CloseTab) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next: CloseTab = current === "visit" ? "outcome" : "visit";
    setTab(next);
    document.getElementById(`closetab-${next}`)?.focus();
  }

  const missing = status && (!status.hindsight || !status.groq);
  const patientCount = result?.memories.filter((m) => m.source === "patient").length ?? 0;
  const clinicCount = result?.memories.filter((m) => m.source === "clinic").length ?? 0;
  const learnedToday = result?.memories.filter((m) => isToday(m.learnedAt)).length ?? 0;
  const visitSaved = savedVisit === visitKey;
  const outcomeSaved = savedOutcome === outcomeKey;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
              <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <strong>Clinic Desk</strong>
            <span>Sunrise Family Clinic · Hyderabad</span>
          </div>
        </div>
        <div className="banks" aria-label="Memory banks">
          <span className="bank bank-patient">
            Patient memory{memStats && <b> · {memStats.patient.toLocaleString("en-IN")}</b>}
          </span>
          <span className="plus" aria-hidden>
            +
          </span>
          <span className="bank bank-clinic">
            Clinic memory{memStats && <b> · {memStats.clinic.toLocaleString("en-IN")}</b>}
          </span>
          <span className="powered">powered by Hindsight</span>
        </div>
      </header>

      {missing ? (
        <div className="banner" role="alert">
          Setup needed: {!status?.hindsight && "HINDSIGHT_BASE_URL / HINDSIGHT_API_KEY"}
          {!status?.hindsight && !status?.groq && " and "}
          {!status?.groq && "GROQ_API_KEY"} missing in <code>.env.local</code>. See README.
        </div>
      ) : (
        memError && (
          <div className="banner" role="alert">
            Memory unavailable: {memError}
          </div>
        )
      )}

      <main className="grid">
        <nav className="queue" aria-label="Today's queue">
          <h2>Today&apos;s queue</h2>
          <ul>
            {patients.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`qitem ${p.id === selectedId ? "active" : ""}`}
                  aria-current={p.id === selectedId ? "true" : undefined}
                  onClick={() => setSelectedId(p.id)}
                >
                  <span className="slot">{p.slot}</span>
                  <span className="avatar" aria-hidden>
                    {p.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className="qtext">
                    <strong>{p.name}</strong>
                    <small>
                      {p.age}
                      {p.sex} · {p.tagline}
                    </small>
                  </span>
                </button>
              </li>
            ))}
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
              <div className="phead">
                <h1>{patient.name}</h1>
                <p>
                  {patient.age} years · {patient.sex === "M" ? "Male" : "Female"} · {patient.slot}
                </p>
              </div>

              <label className="field">
                <span>Reason for visit (from reception)</span>
                <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={3} maxLength={MAX.complaint} />
                {complaint.length > MAX.complaint * 0.8 && (
                  <small className="counter">
                    {complaint.length} / {MAX.complaint}
                  </small>
                )}
              </label>

              <div className="actions">
                <button type="button" className="primary" onClick={prepare} disabled={loading || !complaint.trim()}>
                  {loading ? "Preparing…" : "Prepare brief"}
                </button>
                <label className="toggle">
                  <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
                  Compare with a memoryless assistant
                </label>
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
                      <span className="new-badge">New</span> This brief uses {learnedToday} {learnedToday === 1 ? "memory" : "memories"} Clinic
                      Desk learned today. Look for the New badge in the memory panel.
                    </div>
                  )}
                  {result.compareFailed && (
                    <p className="note">The memoryless comparison could not be generated this time (the model was busy). The brief below is complete.</p>
                  )}
                  <div className={`briefs ${result.withoutMemory ? "two" : "one"}`}>
                    {result.withoutMemory && <BriefCard brief={result.withoutMemory} variant="generic" />}
                    <BriefCard brief={result.withMemory} variant="memory" onRefHover={onRefHover} />
                  </div>

                  <div className="close">
                    <div className="tabs" role="tablist" aria-label="After the consultation">
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

                    {learned && (
                      <div className="learn-cta" role="status">
                        <div>
                          <strong>Clinic Desk just learned from this {learned}.</strong>
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
                            <input
                              value={plan}
                              onChange={(e) => setPlan(e.target.value)}
                              maxLength={MAX.plan}
                              placeholder="e.g. Switched lisinopril to losartan, review in 3 weeks"
                            />
                          </label>
                          <button type="button" className="primary" onClick={saveVisit} disabled={saving || !plan.trim() || visitSaved}>
                            {saving ? "Saving…" : visitSaved ? "Saved to memory" : "Save visit to memory"}
                          </button>
                        </div>
                      ) : (
                        <div className="form">
                          <p className="lede">
                            Did it work? This is how Clinic Desk learns. It goes to the patient&apos;s chart and, with no name attached,
                            into clinic memory for the next similar patient.
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
                              <input
                                value={treatment}
                                onChange={(e) => setTreatment(e.target.value)}
                                maxLength={MAX.treatment}
                                placeholder="e.g. switched to losartan"
                              />
                            </label>
                          </div>
                          <div className="seg" role="group" aria-label="Outcome">
                            {OUTCOMES.map(([v, l]) => (
                              <button
                                key={v}
                                type="button"
                                aria-pressed={outcome === v}
                                className={`seg-${v} ${outcome === v ? "on" : ""}`}
                                onClick={() => setOutcome(v)}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                          <label className="field">
                            <span>Detail (optional)</span>
                            <input
                              value={detail}
                              onChange={(e) => setDetail(e.target.value)}
                              maxLength={MAX.detail}
                              placeholder="e.g. Cough gone in 2 weeks, BP 132/84"
                            />
                          </label>
                          <button
                            type="button"
                            className="primary"
                            onClick={saveOutcome}
                            disabled={saving || !problem.trim() || !treatment.trim() || outcomeSaved}
                          >
                            {saving ? "Saving…" : outcomeSaved ? "Learned" : "Teach Clinic Desk"}
                          </button>
                          {sharedText && (
                            <div className="shared">
                              <span>Written to clinic memory (anonymised)</span>
                              <p>{sharedText}</p>
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
                  <p>
                    Press <b>Prepare brief</b>. Clinic Desk recalls {firstName(patient)}&apos;s history and what worked for similar patients
                    in this clinic, then tells you what matters in 20 seconds.
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="memory" aria-label="Memory">
          <h2>What Clinic Desk remembered</h2>
          {patient && (
            <MemoryPanel memories={result?.memories ?? null} highlight={highlight} loading={loading} patient={patient} chartVersion={chartVersion} />
          )}

          <div className="ask">
            <h2 id="ask-title">Ask the memory</h2>
            <div className="seg small" role="group" aria-label="Ask about">
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
                    <summary>Based on {answer.basedOn.length} memories</summary>
                    <ul>
                      {answer.basedOn.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="foot">
        Decision support only. Clinic Desk never diagnoses or doses; the doctor decides. All patients shown are synthetic.
      </footer>

      <div className="toast-region" aria-live="polite">
        {toast && (
          <div className={`toast toast-${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

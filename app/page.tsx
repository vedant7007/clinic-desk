"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefCard } from "@/components/BriefCard";
import { MemoryPanel } from "@/components/MemoryPanel";
import type { BriefResult, Outcome, Patient } from "@/lib/types";

type Status = { hindsight: boolean; groq: boolean };
type Toast = { kind: "ok" | "err"; text: string } | null;

const STEPS = ["Recalling the patient's chart", "Recalling similar cases across the clinic", "Reasoning over both"];

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

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
  const [tab, setTab] = useState<"visit" | "outcome">("visit");
  const [chartVersion, setChartVersion] = useState(0);

  // close-visit form
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState("");
  // outcome form
  const [problem, setProblem] = useState("");
  const [treatment, setTreatment] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("resolved");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharedText, setSharedText] = useState<string | null>(null);

  // ask
  const [question, setQuestion] = useState("");
  const [askScope, setAskScope] = useState<"patient" | "clinic">("patient");
  const [answer, setAnswer] = useState<{ text: string; basedOn: string[] } | null>(null);
  const [asking, setAsking] = useState(false);

  const patient = useMemo(() => patients.find((p) => p.id === selectedId), [patients, selectedId]);

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => r.json())
      .then((d) => {
        setPatients(d.patients);
        setStatus(d.configured);
      })
      .catch(() => setError("Could not load the patient queue."));
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
    setTreatment("");
    setDetail("");
    setSharedText(null);
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
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  async function prepare() {
    if (!patient || !complaint.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await post<BriefResult>("/api/brief", { patientId: patient.id, complaint, compare });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveVisit() {
    if (!patient || !plan.trim()) return;
    setSaving(true);
    try {
      await post("/api/visit", { patientId: patient.id, complaint, notes, plan });
      setChartVersion((v) => v + 1);
      setToast({ kind: "ok", text: `Visit saved to ${patient.name.split(" ")[0]}'s memory. Next time, the brief will know.` });
      setProblem(complaint.split(/[.,]/)[0].toLowerCase());
      setTreatment(plan);
      setTab("outcome");
    } catch (e) {
      setToast({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function saveOutcome() {
    if (!patient || !problem.trim() || !treatment.trim()) return;
    setSaving(true);
    try {
      const r = await post<{ sharedText: string }>("/api/outcome", { patientId: patient.id, problem, treatment, outcome, detail });
      setSharedText(r.sharedText);
      setChartVersion((v) => v + 1);
      setToast({ kind: "ok", text: "Outcome learned. Saved to the patient's chart and, anonymised, to clinic memory." });
    } catch (e) {
      setToast({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function ask() {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      setAnswer(await post("/api/ask", { patientId: patient?.id, question, scope: askScope }));
    } catch (e) {
      setAnswer({ text: `⚠ ${(e as Error).message}`, basedOn: [] });
    } finally {
      setAsking(false);
    }
  }

  function onRefHover(ref: string | null) {
    setHighlight(ref);
    if (ref) document.getElementById(`mem-${ref}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const missing = status && (!status.hindsight || !status.groq);
  const patientCount = result?.memories.filter((m) => m.source === "patient").length ?? 0;
  const clinicCount = result?.memories.filter((m) => m.source === "clinic").length ?? 0;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" fill="currentColor" /></svg>
          </span>
          <div>
            <strong>Clinic Desk</strong>
            <span>Sunrise Family Clinic · Hyderabad</span>
          </div>
        </div>
        <div className="banks">
          <span className="bank bank-patient">Patient memory</span>
          <span className="plus">+</span>
          <span className="bank bank-clinic">Clinic memory</span>
          <span className="powered">powered by Hindsight</span>
        </div>
      </header>

      {missing && (
        <div className="banner">
          Setup needed: {!status?.hindsight && "HINDSIGHT_BASE_URL / HINDSIGHT_API_KEY"}
          {!status?.hindsight && !status?.groq && " and "}
          {!status?.groq && "GROQ_API_KEY"} missing in <code>.env.local</code>. See README.
        </div>
      )}

      <main className="grid">
        {/* ── Queue ─────────────────────────────── */}
        <aside className="queue">
          <h2>Today&apos;s queue</h2>
          <ul>
            {patients.map((p) => (
              <li key={p.id}>
                <button className={`qitem ${p.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(p.id)}>
                  <span className="slot">{p.slot}</span>
                  <span className="avatar" aria-hidden>
                    {p.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
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
        </aside>

        {/* ── Consultation ─────────────────────── */}
        <section className="consult">
          {patient && (
            <>
              <div className="phead">
                <div>
                  <h1>{patient.name}</h1>
                  <p>
                    {patient.age} years · {patient.sex === "M" ? "Male" : "Female"} · {patient.slot}
                  </p>
                </div>
              </div>

              <label className="field">
                <span>Reason for visit (from reception)</span>
                <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} />
              </label>

              <div className="actions">
                <button className="primary" onClick={prepare} disabled={loading || !complaint.trim()}>
                  {loading ? "Preparing…" : "Prepare brief"}
                </button>
                <label className="toggle">
                  <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
                  Compare with a memoryless assistant
                </label>
              </div>

              {loading && (
                <ol className="steps">
                  {STEPS.map((s, i) => (
                    <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>
                      {s}
                    </li>
                  ))}
                </ol>
              )}

              {error && <div className="error">{error}</div>}

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
                  </div>
                  <div className={`briefs ${result.withoutMemory ? "two" : "one"}`}>
                    {result.withoutMemory && <BriefCard brief={result.withoutMemory} variant="generic" />}
                    <BriefCard brief={result.withMemory} variant="memory" onRefHover={onRefHover} />
                  </div>

                  <div className="close">
                    <div className="tabs" role="tablist">
                      <button role="tab" aria-selected={tab === "visit"} className={tab === "visit" ? "on" : ""} onClick={() => setTab("visit")}>
                        1 · Close the visit
                      </button>
                      <button role="tab" aria-selected={tab === "outcome"} className={tab === "outcome" ? "on" : ""} onClick={() => setTab("outcome")}>
                        2 · Record the outcome
                      </button>
                    </div>

                    {tab === "visit" ? (
                      <div className="form">
                        <p className="lede">Saved to this patient&apos;s memory, so the next brief starts from here.</p>
                        <label className="field">
                          <span>Findings</span>
                          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Chest clear, BP 134/84" />
                        </label>
                        <label className="field">
                          <span>Plan</span>
                          <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Switched lisinopril to losartan, review in 3 weeks" />
                        </label>
                        <button className="primary" onClick={saveVisit} disabled={saving || !plan.trim()}>
                          {saving ? "Saving…" : "Save visit to memory"}
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
                            <input value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="e.g. dry cough on lisinopril" />
                          </label>
                          <label className="field">
                            <span>Treatment</span>
                            <input value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="e.g. switched to losartan" />
                          </label>
                        </div>
                        <div className="seg" role="radiogroup" aria-label="Outcome">
                          {(
                            [
                              ["resolved", "Resolved"],
                              ["improved", "Improved"],
                              ["no_change", "No change"],
                              ["worse", "Worse"],
                            ] as [Outcome, string][]
                          ).map(([v, l]) => (
                            <button key={v} role="radio" aria-checked={outcome === v} className={`seg-${v} ${outcome === v ? "on" : ""}`} onClick={() => setOutcome(v)}>
                              {l}
                            </button>
                          ))}
                        </div>
                        <label className="field">
                          <span>Detail (optional)</span>
                          <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Cough gone in 2 weeks, BP 132/84" />
                        </label>
                        <button className="primary" onClick={saveOutcome} disabled={saving || !problem.trim() || !treatment.trim()}>
                          {saving ? "Saving…" : "Teach Clinic Desk"}
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
                </>
              )}

              {!result && !loading && !error && (
                <div className="placeholder">
                  <p>
                    Press <b>Prepare brief</b>. Clinic Desk recalls {patient.name.split(" ")[0]}&apos;s history and what worked for similar
                    patients in this clinic, then tells you what matters in 20 seconds.
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Memory ───────────────────────────── */}
        <aside className="memory">
          <h2>What Clinic Desk remembered</h2>
          {patient && (
            <MemoryPanel
              memories={result?.memories ?? null}
              highlight={highlight}
              loading={loading}
              patient={patient}
              chartVersion={chartVersion}
            />
          )}

          <div className="ask">
            <h2>Ask the memory</h2>
            <div className="seg small">
              <button className={askScope === "patient" ? "on" : ""} onClick={() => setAskScope("patient")}>
                This patient
              </button>
              <button className={askScope === "clinic" ? "on" : ""} onClick={() => setAskScope("clinic")}>
                Whole clinic
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={askScope === "patient" ? "Which treatments have failed before?" : "What worked for ACE-inhibitor cough?"}
              />
              <button className="primary" disabled={asking || !question.trim()}>
                {asking ? "…" : "Ask"}
              </button>
            </form>
            {answer && (
              <div className="answer">
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

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}

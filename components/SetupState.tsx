"use client";

import { useEffect, useState } from "react";
import { MemoryIcon } from "./icons";
import { getJson } from "@/lib/client";
import type { HealthReport, ServiceState } from "@/lib/types";

const ENV_VARS: { name: string; desc: string }[] = [
  { name: "HINDSIGHT_BASE_URL", desc: "Hindsight Cloud URL (e.g. https://api.hindsight.vectorize.io)" },
  { name: "HINDSIGHT_API_KEY", desc: "Your Hindsight Cloud key — read/writes the patient & clinic memory banks" },
  { name: "GROQ_API_KEY", desc: "Groq key — reasons over recalled memory to write the brief" },
];

/** Plain words for what the live probe found, so the fix is never a guess. */
const DIAGNOSIS: Record<ServiceState, { label: string; fix: string }> = {
  ok: { label: "Connected", fix: "" },
  missing: { label: "Not configured", fix: "HINDSIGHT_BASE_URL is not set, so there is no server to call." },
  rejected: { label: "Key rejected", fix: "The server was reached but refused HINDSIGHT_API_KEY. Check the key." },
  unreachable: { label: "Unreachable", fix: "HINDSIGHT_BASE_URL is set but the server did not answer. Check the URL and your connection." },
  unseeded: { label: "No memories yet", fix: "The connection works but the banks are empty. Run `npm run seed`." },
};

/**
 * Shown when a memory-backed page hits a 503 configuration error. It renders the page's
 * structure, then actually probes /api/health so it can name the real problem — a missing
 * URL, a rejected key, an unreachable server or an unseeded bank are different fixes.
 * It never fabricates data and never hides the requirement.
 */
export function SetupState({ what, message }: { what: string; message?: string }) {
  const [health, setHealth] = useState<HealthReport | null>(null);

  useEffect(() => {
    getJson<HealthReport>("/api/health").then(setHealth).catch(() => {});
  }, []);

  const hs = health?.hindsight;
  const diagnosis = hs ? DIAGNOSIS[hs.state] : null;

  /** True only for a variable the live probe proved is the problem. */
  const isCulprit = (name: string): boolean => {
    if (!hs || !health) return false;
    if (name === "HINDSIGHT_BASE_URL") return !hs.baseUrlSet || hs.state === "unreachable";
    if (name === "HINDSIGHT_API_KEY") return !hs.apiKeySet || hs.state === "rejected";
    return !health.groq.apiKeySet;
  };

  return (
    <div className="setup-state">
      <div className="setup-head">
        <span className="setup-mark" aria-hidden>
          <MemoryIcon size={22} />
        </span>
        <div>
          <h2>Connect Hindsight to enable {what}</h2>
          <p>
            {what[0].toUpperCase() + what.slice(1)} is powered by live Hindsight memory. Add the credentials below to <code>.env.local</code>, then restart the app.
          </p>
        </div>
      </div>

      {message && <p className="setup-detail">{message}</p>}

      {hs && diagnosis && (
        <div className="setup-probe">
          <div className="sp-row">
            <span className="sp-label">Hindsight</span>
            <span className={`sp-state st-${hs.state}`}>{diagnosis.label}</span>
            <span className="sp-host">{hs.host ?? "no URL set"}</span>
          </div>
          {diagnosis.fix && <p className="sp-fix">{diagnosis.fix}</p>}
          <div className="sp-banks">
            {([
              ["Patient bank", hs.banks.patient],
              ["Clinic bank", hs.banks.clinic],
            ] as const).map(([label, bank]) => (
              <span key={label} className={`sp-bank st-${bank.state}`}>
                {label}
                <b>{bank.memories === null ? "—" : bank.memories.toLocaleString("en-IN")}</b>
              </span>
            ))}
          </div>
          <div className="sp-row">
            <span className="sp-label">Groq</span>
            <span className={`sp-state st-${health.groq.apiKeySet ? "ok" : "missing"}`}>{health.groq.apiKeySet ? "Key set" : "Not configured"}</span>
            <span className="sp-host">{health.groq.model}</span>
          </div>
          <p className="sp-checked">Checked live against your Hindsight server, not read from a cache.</p>
        </div>
      )}

      <ul className="setup-vars">
        {ENV_VARS.map((v) => (
          <li key={v.name} className={isCulprit(v.name) ? "is-culprit" : ""}>
            <code>{v.name}</code>
            <span>{v.desc}</span>
          </li>
        ))}
      </ul>

      <p className="setup-foot">
        See the README for full setup and <code>npm run seed</code> to load the synthetic practice. No memory is fabricated while credentials are missing — this page will
        populate from real Hindsight data once connected.
      </p>
    </div>
  );
}

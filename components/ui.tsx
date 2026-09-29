"use client";

import type { ReactNode } from "react";
import { AllergyIcon, CaseIcon, NoteIcon, OutcomeIcon, VisitIcon } from "./icons";
import { CountUp } from "./motion";
import type { MemoryKind, Outcome, Patient } from "@/lib/types";

export const firstName = (name: string) => name.split(" ")[0];
export const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const OUTCOME_LABEL: Record<Outcome, string> = {
  resolved: "Resolved",
  improved: "Improved",
  no_change: "No change",
  worse: "Worse",
};

/** Section heading used at the top of every page's content. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {lede && <p className="page-lede">{lede}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}

/**
 * A metric tile for the Overview / Insights dashboards. `featured` makes it the one
 * dominant figure on the row; `meter` draws a real ratio (e.g. seen of booked) under it.
 */
export function StatCard({
  label,
  value,
  sub,
  tone = "accent",
  icon,
  featured = false,
  meter,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "accent" | "violet" | "neutral";
  icon?: ReactNode;
  featured?: boolean;
  meter?: { value: number; max: number; label: string };
}) {
  const pct = meter && meter.max > 0 ? Math.min(100, Math.round((meter.value / meter.max) * 100)) : 0;
  return (
    <div className={`stat-card tone-${tone} ${featured ? "is-featured" : ""}`}>
      <span className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </span>
      <span className="stat-value">{typeof value === "number" ? <CountUp value={value} /> : value}</span>
      {meter && (
        <span className="stat-meter" role="img" aria-label={meter.label}>
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
      {sub != null && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Avatar({ patient, size = 40 }: { patient: Pick<Patient, "name" | "sex">; size?: number }) {
  return (
    <span className={`avatar sex-${patient.sex}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {initials(patient.name)}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  return <span className={`outcome-badge o-${outcome}`}>{OUTCOME_LABEL[outcome]}</span>;
}

const KIND_META: Record<MemoryKind, { label: string; Icon: typeof VisitIcon }> = {
  visit: { label: "Visit", Icon: VisitIcon },
  outcome: { label: "Outcome", Icon: OutcomeIcon },
  case: { label: "Clinic case", Icon: CaseIcon },
  allergy: { label: "Allergy", Icon: AllergyIcon },
  note: { label: "Note", Icon: NoteIcon },
};

export function KindBadge({ kind, source }: { kind: MemoryKind; source: "patient" | "clinic" }) {
  const { label, Icon } = KIND_META[kind];
  return (
    <span className={`kind-badge k-${kind} src-${source}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}

export function KindGlyph({ kind }: { kind: MemoryKind }) {
  const { Icon } = KIND_META[kind];
  return <Icon size={15} />;
}

/** A loading state that previews the shape of what is coming, with its label for screen readers. */
export function Loading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="loading" role="status">
      <span className="loading-label">
        <span className="pulse" aria-hidden />
        {label}
      </span>
      <span className="loading-rows" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className="loading-row">
            <Skeleton h={34} w={34} r={10} />
            <span className="loading-lines">
              <Skeleton h={11} w={`${62 - i * 9}%`} />
              <Skeleton h={9} w={`${86 - i * 7}%`} />
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-icon">{icon}</span>}
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </div>
  );
}

/** Skeleton shimmer block for loading states. */
export function Skeleton({ h = 16, w = "100%", r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConsultIcon, InsightsIcon, MemoryIcon, OverviewIcon, PatientsIcon, SearchIcon } from "./icons";
import { Avatar } from "./ui";
import { usePresence } from "./motion";
import type { Patient } from "@/lib/types";

type Action = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords: string;
  run: () => void;
};

export function CommandPalette({ open, onClose, patients }: { open: boolean; onClose: () => void; patients: Patient[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { item: shown } = usePresence(open ? true : null, 160);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      // focus after the element mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      returnFocus.current?.focus?.({ preventScroll: true });
    }
  }, [open]);

  const go = (href: string) => {
    router.push(href);
    onClose();
  };

  const actions = useMemo<Action[]>(() => {
    const nav: Action[] = [
      { id: "nav-overview", label: "Overview", hint: "Clinic command centre", icon: <OverviewIcon size={16} />, keywords: "overview home dashboard today", run: () => go("/") },
      { id: "nav-patients", label: "Patients", hint: "Browse patient intelligence", icon: <PatientsIcon size={16} />, keywords: "patients people roster", run: () => go("/patients") },
      { id: "nav-consult", label: "Consult", hint: "Open the clinical workspace", icon: <ConsultIcon size={16} />, keywords: "consult brief queue workspace", run: () => go("/consult") },
      { id: "nav-memory", label: "Memory", hint: "What Clinic Desk remembers", icon: <MemoryIcon size={16} />, keywords: "memory learned facts recall", run: () => go("/memory") },
      { id: "nav-insights", label: "Insights", hint: "Clinic-level intelligence", icon: <InsightsIcon size={16} />, keywords: "insights outcomes analytics trends", run: () => go("/insights") },
    ];
    const people: Action[] = patients.map((p) => ({
      id: `patient-${p.id}`,
      label: p.name,
      hint: `${p.age} · ${p.sex === "M" ? "Male" : "Female"} · ${p.tagline}`,
      icon: <Avatar patient={p} size={24} />,
      keywords: `${p.name} ${p.tagline} ${p.todayComplaint} patient`,
      run: () => go(`/patients/${p.id}`),
    }));
    return [...nav, ...people];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => `${a.label} ${a.keywords}`.toLowerCase().includes(q));
  }, [actions, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Render the moment it opens (so focus lands); linger only while it animates out.
  if (!open && !shown) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    }
  };

  const navResults = results.filter((r) => r.id.startsWith("nav-"));
  const peopleResults = results.filter((r) => r.id.startsWith("patient-"));
  const indexOf = (a: Action) => results.indexOf(a);

  return (
    <div className={`cmd-overlay ${!open ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Command centre" onMouseDown={onClose}>
      <div className="cmd-box" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="cmd-input">
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patients or jump to a section…"
            aria-label="Command search"
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmd-results" ref={listRef}>
          {results.length === 0 && <p className="cmd-empty">No matches for “{query}”.</p>}
          {navResults.length > 0 && (
            <div className="cmd-group">
              <span className="cmd-group-label">Go to</span>
              {navResults.map((a) => (
                <CmdRow key={a.id} action={a} active={indexOf(a) === active} onHover={() => setActive(indexOf(a))} />
              ))}
            </div>
          )}
          {peopleResults.length > 0 && (
            <div className="cmd-group">
              <span className="cmd-group-label">Patients</span>
              {peopleResults.map((a) => (
                <CmdRow key={a.id} action={a} active={indexOf(a) === active} onHover={() => setActive(indexOf(a))} />
              ))}
            </div>
          )}
        </div>
        <div className="cmd-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
        </div>
      </div>
    </div>
  );
}

function CmdRow({ action, active, onHover }: { action: Action; active: boolean; onHover: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <button ref={ref} type="button" className={`cmd-row ${active ? "on" : ""}`} onMouseMove={onHover} onClick={action.run}>
      <span className="cmd-row-icon">{action.icon}</span>
      <span className="cmd-row-text">
        <strong>{action.label}</strong>
        {action.hint && <small>{action.hint}</small>}
      </span>
    </button>
  );
}

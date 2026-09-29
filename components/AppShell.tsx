"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";
import { CountUp, prefersReducedMotion, useSlidingIndicator } from "./motion";
import { ConsultIcon, InsightsIcon, MemoryIcon, OverviewIcon, PatientsIcon, SearchIcon } from "./icons";
import { getJson } from "@/lib/client";
import type { MemoryStats, Patient } from "@/lib/types";

type Status = { hindsight: boolean; groq: boolean };
type NavItem = { href: string; label: string; Icon: typeof OverviewIcon };

const NAV: NavItem[] = [
  { href: "/", label: "Overview", Icon: OverviewIcon },
  { href: "/patients", label: "Patients", Icon: PatientsIcon },
  { href: "/consult", label: "Consult", Icon: ConsultIcon },
  { href: "/memory", label: "Memory", Icon: MemoryIcon },
  { href: "/insights", label: "Insights", Icon: InsightsIcon },
];

/** True when the current path is within a nav section (so /patients/P001 lights up Patients). */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const loadStats = useCallback(() => {
    getJson<MemoryStats>("/api/stats")
      .then((d) => {
        setStats(d);
        setStatsError(false);
      })
      .catch(() => setStatsError(true));
  }, []);

  useEffect(() => {
    loadStats();
    getJson<{ patients: Patient[]; configured: Status }>("/api/patients")
      .then((d) => {
        setPatients(d.patients);
        setStatus(d.configured);
      })
      .catch(() => {});
  }, [loadStats]);

  // The Consult workflow dispatches this after writing to memory, so the counts stay live.
  useEffect(() => {
    const onChange = () => loadStats();
    window.addEventListener("clinicdesk:memory-changed", onChange);
    return () => window.removeEventListener("clinicdesk:memory-changed", onChange);
  }, [loadStats]);

  // ⌘K / Ctrl K opens the command centre from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navRef = useSlidingIndicator<HTMLElement>(pathname, '[aria-current="page"]');
  const mobileNavRef = useSlidingIndicator<HTMLElement>(pathname, '[aria-current="page"]');

  // iOS Safari only applies :active press states once the page listens for touches.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  // Sections below the fold rise in once as they are scrolled to. Content is visible by
  // default: only elements this observer has registered start hidden, and never with
  // reduced motion, so nothing depends on it running.
  useEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    const main = document.querySelector(".app-main");
    if (!main) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px" }
    );
    const register = () => {
      main.querySelectorAll<HTMLElement>(".section-block, .insight-cols, .overview-cols").forEach((el) => {
        if (el.dataset.reveal) return;
        el.dataset.reveal = "1";
        // Already on screen: no reveal, it is simply there.
        if (el.getBoundingClientRect().top < window.innerHeight) return;
        el.classList.add("reveal");
        io.observe(el);
      });
    };
    register();
    const mo = new MutationObserver(register);
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, [pathname]);

  const missing = status && (!status.hindsight || !status.groq);
  const degraded = Boolean(missing || statsError);
  const section = NAV.find(({ href }) => isActive(pathname, href))?.label ?? "Clinic Desk";
  // Only ever claims a connection Hindsight actually answered: stats arrive from a live call.
  const memoryState = missing ? "Setup needed" : statsError ? "Memory unreachable" : stats ? "Hindsight live" : "Connecting…";

  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="sidebar-brand" aria-label="Clinic Desk — overview">
          <BrandMark />
          <span className="brand-text">
            <strong>Clinic Desk</strong>
            <span>Clinical memory</span>
          </span>
        </Link>

        <nav className="sidenav" aria-label="Sections" ref={navRef}>
          <span className="sidenav-label">Workspace</span>
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={`sidenav-item ${isActive(pathname, href) ? "on" : ""}`} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="sidenav-label">Hindsight memory</span>
          <div className="banks">
            <span
              className="bank bank-patient"
              title={`Patient memory — the chart for the whole practice${stats ? `. ${stats.patient.facts} facts, plus ${stats.patient.observations} derived observations` : ""}`}
            >
              <i aria-hidden />
              <span className="bank-name">Patient</span>
              {stats ? <b><CountUp value={stats.patient.facts} /></b> : <span className="bank-wait" aria-hidden />}
            </span>
            <span
              className="bank bank-clinic"
              title={`Clinic memory — anonymised outcomes shared across the practice${stats ? `. ${stats.clinic.facts} facts, plus ${stats.clinic.observations} derived observations` : ""}`}
            >
              <i aria-hidden />
              <span className="bank-name">Clinic</span>
              {stats ? <b><CountUp value={stats.clinic.facts} /></b> : <span className="bank-wait" aria-hidden />}
            </span>
          </div>
          <p className="bank-note">Facts retained · derived observations not counted</p>
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <Link href="/" className="topbar-brand" aria-label="Clinic Desk — overview">
            <BrandMark />
            <strong>Clinic Desk</strong>
          </Link>
          <div className="crumb">
            <span className="crumb-clinic">Sunrise Family Clinic</span>
            <span className="crumb-sep" aria-hidden>
              /
            </span>
            <span className="crumb-section" aria-current="page">
              {section}
            </span>
          </div>
          <div className="topbar-right">
            <span className={`clinic-chip ${degraded ? "is-degraded" : stats ? "is-live" : ""}`} role="status">
              <span className="status-dot" aria-hidden />
              <span className="chip-label">{memoryState}</span>
            </span>
            <button type="button" className="cmd-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search patients and sections">
              <SearchIcon size={15} />
              <span>Search</span>
              <kbd>⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </header>
        {missing && (
          <div className="banner" role="alert">
            Setup needed: {!status?.hindsight && "HINDSIGHT_BASE_URL / HINDSIGHT_API_KEY"}
            {!status?.hindsight && !status?.groq && " and "}
            {!status?.groq && "GROQ_API_KEY"} missing in <code>.env.local</code>. See README.
          </div>
        )}
        <main className="app-main" key={section}>
          {children}
        </main>
      </div>

      <nav className="mobilenav" aria-label="Sections" ref={mobileNavRef}>
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={isActive(pathname, href) ? "on" : ""} aria-current={isActive(pathname, href) ? "page" : undefined}>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} patients={patients} />
    </div>
  );
}

/** The Clinic Desk mark: a clinical cross cut into a rounded glacier tile. */
function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg viewBox="0 0 24 24" width="17" height="17" focusable="false">
        <path d="M10 3.5h4v6.5h6.5v4H14v6.5h-4V14H3.5v-4H10z" fill="currentColor" />
      </svg>
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";

type Pref = "system" | "light" | "dark";
type Resolved = "light" | "dark";

const KEY = "clinicdesk-theme";
const prefersDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

function resolve(pref: Pref): Resolved {
  if (pref === "system") return prefersDark() ? "dark" : "light";
  return pref;
}

function apply(pref: Pref, animate = false) {
  const r = resolve(pref);
  const root = document.documentElement;
  // A brief, global colour cross-fade — only for a switch the user asked for, never on load.
  if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 420);
  }
  root.dataset.theme = r;
  root.style.colorScheme = r;
}

/**
 * Light / dark switch. Persists the preference and follows the system when set to it.
 * The resolved theme is written to <html data-theme> (also done pre-paint in layout).
 */
export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  const [resolved, setResolved] = useState<Resolved>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: Pref = "system";
    try {
      stored = (localStorage.getItem(KEY) as Pref | null) ?? "system";
    } catch {
      // Storage blocked: follow the system.
    }
    setPref(stored);
    setResolved(resolve(stored));
    setMounted(true);
  }, []);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      apply("system");
      setResolved(prefersDark() ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function toggle() {
    // A single control that flips the *effective* theme and remembers it.
    const next: Pref = resolved === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the switch still works for this visit.
    }
    setPref(next);
    apply(next, true);
    setResolved(next);
  }

  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      className={`theme-toggle ${isDark ? "is-dark" : "is-light"}`}
      onClick={toggle}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"}
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"}
    >
      <svg className="theme-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <mask id="theme-moon-cut">
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle className="theme-cut" cx="24" cy="4" r="8" fill="black" />
        </mask>
        <circle className="theme-core" cx="12" cy="12" r="5" fill="currentColor" stroke="none" mask="url(#theme-moon-cut)" />
        <g className="theme-rays">
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </g>
      </svg>
      <span className="theme-label">{mounted ? (isDark ? "Dark" : "Light") : "Theme"}</span>
    </button>
  );
}

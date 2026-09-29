"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Clinic Desk's motion primitives. Everything here only changes how a real state change
 * is shown — never what the state is — and all of it steps aside for reduced motion.
 */

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A sliding active indicator for tabs, segmented controls, the sidebar and the queue.
 * It measures the active child (by `selector`) and writes its box to CSS variables on the
 * container; the stylesheet draws the indicator from them, so it glides with a transform
 * instead of the active item snapping. Until it has measured, items keep their own
 * active styling — nothing depends on this running.
 */
export function useSlidingIndicator<T extends HTMLElement>(
  dep: unknown,
  selector = '[aria-selected="true"], [aria-pressed="true"], [aria-current="page"], [aria-current="true"]'
) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>(selector);
      if (!on || on.offsetParent === null) {
        el.classList.remove("has-ind");
        return;
      }
      const box = el.getBoundingClientRect();
      const r = on.getBoundingClientRect();
      el.style.setProperty("--ind-x", `${r.left - box.left + el.scrollLeft - el.clientLeft}px`);
      el.style.setProperty("--ind-y", `${r.top - box.top + el.scrollTop - el.clientTop}px`);
      el.style.setProperty("--ind-w", `${r.width}px`);
      el.style.setProperty("--ind-h", `${r.height}px`);
      el.classList.add("has-ind");
    };
    place();
    // Glide only after the first placement, so the indicator never flies in from 0,0.
    const raf = requestAnimationFrame(() => el.classList.add("ind-ready"));
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [dep, selector]);

  return ref;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts to a real number: from 0 when it first appears, and from the previous value when
 * it genuinely changes (a memory written, a count refreshed). Re-renders with the same
 * value never replay it. Screen readers always get the final value, never the tween.
 */
export function CountUp({ value, duration = 700, locale = "en-IN" }: { value: number; duration?: number; locale?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    const start = first.current ? 0 : from.current;
    first.current = false;
    from.current = value;
    if (start === value || prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const span = Math.min(duration, 260 + Math.abs(value - start) * 40);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / span);
      setShown(Math.round(start + (value - start) * easeOutCubic(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <>
      <span aria-hidden className="countup">
        {shown.toLocaleString(locale)}
      </span>
      <span className="sr-only">{value.toLocaleString(locale)}</span>
    </>
  );
}

/**
 * Keeps an overlay mounted for its exit animation. Returns the last non-null value while
 * `closing` is true, then releases it after `ms`.
 */
export function usePresence<V>(value: V | null, ms = 200): { item: V | null; closing: boolean } {
  const [item, setItem] = useState<V | null>(value);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (value !== null) {
      setItem(value);
      setClosing(false);
      return;
    }
    if (item === null) return;
    if (prefersReducedMotion()) {
      setItem(null);
      return;
    }
    setClosing(true);
    const t = setTimeout(() => {
      setItem(null);
      setClosing(false);
    }, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);

  return { item, closing };
}

/** Focus stays inside an open dialog, starts on its first control, and returns on close. */
export function useDialogFocus(open: boolean, container: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = container.current;
    const focusables = () =>
      Array.from(el?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])') ?? []);
    if (el && !el.contains(document.activeElement)) focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, container]);
}

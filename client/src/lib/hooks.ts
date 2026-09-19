import { useEffect, useRef, useState, type RefObject } from 'react';

/** Eases a number toward its new value so KPIs glide instead of jumping. Respects reduced motion. */
export function useAnimatedNumber(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) { setValue(target); return; }
    const from = fromRef.current;
    if (from === target) return;
    startRef.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);

  return value;
}

/** Wall clock for a fixed IANA time zone, ticking once a minute. */
export function useZonedClock(timeZone = 'Asia/Karachi'): { time: string; date: string; hour: number } {
  const compute = () => {
    const now = new Date();
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(now);
    const date = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(now);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(now));
    return { time, date, hour };
  };
  const [clock, setClock] = useState(compute);
  useEffect(() => {
    const id = setInterval(() => setClock(compute()), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone]);
  return clock;
}

/**
 * Sets the document title and meta description/Open Graph tags for the lifetime of the
 * mounted route, restoring the previous title on unmount. Small, dependency-free stand-in
 * for a head-management library — the app only needs one page to override the static
 * defaults in index.html.
 */
export function useDocumentMeta(opts: { title: string; description?: string }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = opts.title;

    const restores: Array<() => void> = [];
    const setMeta = (selector: string, attr: string, value: string) => {
      const el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) return;
      const prev = el.getAttribute(attr);
      el.setAttribute(attr, value);
      restores.push(() => el.setAttribute(attr, prev ?? ''));
    };

    if (opts.description) {
      setMeta('meta[name="description"]', 'content', opts.description);
      setMeta('meta[property="og:description"]', 'content', opts.description);
    }
    setMeta('meta[property="og:title"]', 'content', opts.title);

    return () => {
      document.title = prevTitle;
      restores.forEach((restore) => restore());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.title, opts.description]);
}

/**
 * Adds `.is-visible` to an element the first time it scrolls into view, pairing with the
 * `.reveal` CSS class for a subtle fade/rise-in. Skips the observer entirely under
 * prefers-reduced-motion, so the element is simply visible immediately.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('is-visible');
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useReveal } from '../../lib/hooks';

/**
 * Thin wrapper that fades + rises its children into view on first scroll intersection.
 * CSS-only animation (see `.reveal` in index.css); respects prefers-reduced-motion.
 * Renders a plain <div> — put semantic landmarks (<section>, headings) around it.
 */
export default function Reveal({ className, delay = 0, children }: { className?: string; delay?: number; children: ReactNode }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={clsx('reveal', className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

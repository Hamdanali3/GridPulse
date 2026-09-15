import { clsx } from 'clsx';
import { X, Loader2, Inbox } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import type { AlertStatus, OperationalStatus, Priority, Severity, SiteType, WorkOrderStatus } from '../../lib/types';
import { humanize } from '../../lib/format';

/* ---------- Status chips ---------- */

const statusStyles: Record<OperationalStatus, string> = {
  online: 'bg-moss text-pine',
  degraded: 'bg-[#fdf0d5] text-[#8a5a00]',
  offline: 'bg-ember-soft text-[#9c2f1c]',
  maintenance: 'bg-teal-soft text-[#1d5c5c]',
};

export function StatusChip({ status }: { status: OperationalStatus }) {
  const dot: Record<OperationalStatus, string> = {
    online: 'bg-[#2f8f5b]',
    degraded: 'bg-amber',
    offline: 'bg-ember',
    maintenance: 'bg-teal',
  };
  return (
    <span className={clsx('chip', statusStyles[status])}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', dot[status])} />
      {humanize(status)}
    </span>
  );
}

const severityStyles: Record<Severity, string> = {
  critical: 'bg-ember-soft text-[#9c2f1c]',
  warning: 'bg-[#fdf0d5] text-[#8a5a00]',
  info: 'bg-teal-soft text-[#1d5c5c]',
};

export function SeverityChip({ severity }: { severity: Severity }) {
  return <span className={clsx('chip', severityStyles[severity])}>{humanize(severity)}</span>;
}

const alertStatusStyles: Record<AlertStatus, string> = {
  open: 'bg-ember-soft text-[#9c2f1c]',
  acknowledged: 'bg-[#fdf0d5] text-[#8a5a00]',
  resolved: 'bg-moss text-pine',
};

export function AlertStatusChip({ status }: { status: AlertStatus }) {
  return <span className={clsx('chip', alertStatusStyles[status])}>{humanize(status)}</span>;
}

const priorityStyles: Record<Priority, string> = {
  low: 'bg-mist text-ink-muted border border-line',
  medium: 'bg-teal-soft text-[#1d5c5c]',
  high: 'bg-[#fdf0d5] text-[#8a5a00]',
  urgent: 'bg-ember-soft text-[#9c2f1c]',
};

export function PriorityChip({ priority }: { priority: Priority }) {
  return <span className={clsx('chip', priorityStyles[priority])}>{humanize(priority)}</span>;
}

const woStyles: Record<WorkOrderStatus, string> = {
  planned: 'bg-mist text-ink-muted border border-line',
  in_progress: 'bg-teal-soft text-[#1d5c5c]',
  blocked: 'bg-ember-soft text-[#9c2f1c]',
  done: 'bg-moss text-pine',
};

export function WorkOrderStatusChip({ status }: { status: WorkOrderStatus }) {
  return <span className={clsx('chip', woStyles[status])}>{humanize(status)}</span>;
}

export function TypeMark({ type, className }: { type: SiteType; className?: string }) {
  const label = { solar: 'Solar', wind: 'Wind', hydro: 'Hydro' }[type];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-ink-muted', className)}>
      <TypeGlyph type={type} />
      {label}
    </span>
  );
}

export function TypeGlyph({ type, size = 14 }: { type: SiteType; size?: number }) {
  if (type === 'solar')
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="3" fill="#F2A93B" />
        <g stroke="#F2A93B" strokeWidth="1.4" strokeLinecap="round">
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" />
        </g>
      </svg>
    );
  if (type === 'wind')
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <path d="M8 8v7" stroke="#2E8B8B" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M8 8 L8 1.5 M8 8 L13.6 11.2 M8 8 L2.4 11.2" stroke="#2E8B8B" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="8" r="1.4" fill="#2E8B8B" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M2 6c2 0 2 2 4 2s2-2 4-2 2 2 4 2" fill="none" stroke="#2E8B8B" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 11c2 0 2 2 4 2s2-2 4-2 2 2 4 2" fill="none" stroke="#2E8B8B" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Page scaffolding ---------- */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight text-pine">{title}</h1>
        {description && <p className="mt-1 max-w-[62ch] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, bodyClassName }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={clsx('panel', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-[15px] font-semibold text-pine">{title}</h2>}
          {action}
        </header>
      )}
      <div className={clsx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <Inbox className="h-7 w-7 text-ink-faint" strokeWidth={1.5} />
      <p className="font-medium text-pine">{title}</p>
      {hint && <p className="max-w-[46ch] text-ink-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-ink-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-control border border-ember/40 bg-ember-soft px-4 py-3 text-[#9c2f1c]" role="alert">
      {message}
    </div>
  );
}

/* ---------- Forms ---------- */

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-[13px] font-medium text-pine">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12.5px] text-ember">{error}</span> : hint ? <span className="mt-1 block text-[12.5px] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

/* ---------- Drawer ---------- */

export function Drawer({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-pine/40" aria-label="Close" onClick={onClose} />
      <div className={clsx('relative flex h-full w-full flex-col bg-paper', width)}>
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-pine">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel, busy }: { open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-pine/40" aria-label="Cancel" onClick={onCancel} />
      <div className="panel relative w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-pine">{title}</h2>
        <p className="mt-2 text-ink-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Keep it</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Pagination ---------- */

export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (p: number) => void }) {
  if (pages <= 1) return <p className="px-1 text-[13px] text-ink-muted">{total} {total === 1 ? 'result' : 'results'}</p>;
  return (
    <div className="flex items-center justify-between gap-3 px-1 text-[13px] text-ink-muted">
      <span>Page {page} of {pages} · {total} results</span>
      <div className="flex gap-1">
        <button className="btn btn-secondary btn-sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>Previous</button>
        <button className="btn btn-secondary btn-sm" onClick={() => onChange(page + 1)} disabled={page >= pages}>Next</button>
      </div>
    </div>
  );
}

/* ---------- Segmented filter ---------- */

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="inline-flex rounded-control border border-line bg-paper p-0.5" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors',
            o.value === value ? 'bg-pine text-white' : 'text-ink-muted hover:bg-moss hover:text-pine',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={clsx('ml-1.5 tabular', o.value === value ? 'text-amber' : 'text-ink-faint')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function HealthBar({ value }: { value: number }) {
  const tone = value >= 85 ? 'bg-[#2f8f5b]' : value >= 65 ? 'bg-amber' : 'bg-ember';
  return (
    <div className="flex items-center gap-2" aria-label={`Health ${value}%`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-moss">
        <div className={clsx('h-full rounded-full', tone)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
      <span className="tabular text-[12.5px] text-ink-muted">{Math.round(value)}</span>
    </div>
  );
}

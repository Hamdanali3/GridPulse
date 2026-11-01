import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import type { User } from '../lib/types';

/** Minimalist header account menu. */
export default function UserMenu({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = user?.name?.slice(0, 1).toUpperCase() ?? '?';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={clsx(
          'inline-flex h-8 w-8 items-center justify-center rounded-control border bg-paper text-[12.5px] font-semibold text-pine transition-colors hover:bg-moss',
          open ? 'border-line-strong bg-moss' : 'border-line hover:border-line-strong',
        )}
      >
        {initial}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-10 z-40 w-60 overflow-hidden rounded-panel border border-line-strong bg-paper">
          <div className="px-3.5 py-3">
            <p className="truncate text-[13.5px] font-medium text-pine">{user?.name}</p>
            <p className="truncate text-[12px] text-ink-muted">{user?.email}</p>
            <p className="mt-1.5 text-[11px] uppercase tracking-[0.06em] text-ink-faint">{user?.role} access</p>
          </div>
          <div className="border-t border-line p-1">
            <Link
              to="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-control px-2.5 py-1.5 text-[13px] text-ink transition-colors hover:bg-moss"
            >
              Profile and password
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="block w-full rounded-control px-2.5 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-ember-soft hover:text-ember"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

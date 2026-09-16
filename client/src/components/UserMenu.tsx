import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Settings, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import type { User } from '../lib/types';

/** Avatar button in the header that opens a small account menu. */
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
          'inline-flex h-9 w-9 items-center justify-center rounded-full bg-pine font-display text-[13px] font-semibold text-amber ring-offset-2 transition-shadow hover:ring-2 hover:ring-pine/30',
          open && 'ring-2 ring-pine/30',
        )}
      >
        {initial}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-panel border border-line bg-paper shadow-[0_12px_32px_rgba(20,49,43,0.14)]">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pine font-display text-[15px] font-semibold text-amber">{initial}</span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-pine">{user?.name}</p>
              <p className="truncate text-[12.5px] text-ink-muted">{user?.email}</p>
            </div>
          </div>
          <div className="mx-4 flex items-center gap-1.5 border-t border-line py-2.5 text-[12.5px] text-ink-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-teal" strokeWidth={1.75} />
            <span className="capitalize">{user?.role}</span>
            <span>access</span>
          </div>
          <div className="border-t border-line p-1.5">
            <Link
              to="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-control px-2.5 py-2 text-[13.5px] text-ink transition-colors hover:bg-moss"
            >
              <Settings className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
              Profile and password
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-[13.5px] text-ink transition-colors hover:bg-ember-soft hover:text-ember"
            >
              <LogOut className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

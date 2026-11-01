import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { clsx } from 'clsx';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'gridpulse_theme';

function readStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

function readSystemTheme(): Theme {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Theme | null>(() => (typeof window !== 'undefined' ? readStoredTheme() : null));
  const [system, setSystem] = useState<Theme>(() => readSystemTheme());

  const theme: Theme = stored ?? system;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#131414' : '#fafafa');
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setStored(next);
    writeStoredTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = (stored ?? system) === 'dark' ? 'light' : 'dark';
    setStored(next);
    writeStoredTheme(next);
  }, [stored, system]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className={clsx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line bg-paper text-ink-muted transition-colors hover:border-line-strong hover:bg-moss hover:text-pine',
        className,
      )}
    >
      {isDark ? <Sun className="h-[15px] w-[15px]" strokeWidth={1.6} /> : <Moon className="h-[15px] w-[15px]" strokeWidth={1.6} />}
    </button>
  );
}

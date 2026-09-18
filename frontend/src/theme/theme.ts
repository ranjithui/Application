import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'hs.theme';
const listeners = new Set<() => void>();

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function system(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function current(): Theme {
  const v = document.documentElement.getAttribute('data-theme');
  return v === 'dark' ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  listeners.forEach((l) => l());
}

/** Applies the saved choice, or the device setting on a first visit, and follows device changes until the user picks. */
export function initTheme() {
  apply(stored() ?? system());
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (!stored()) apply(system());
    });
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as Theme);
  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    apply(t);
  }, []);
  const toggle = useCallback(() => setTheme(current() === 'dark' ? 'light' : 'dark'), [setTheme]);
  return { theme, setTheme, toggle };
}

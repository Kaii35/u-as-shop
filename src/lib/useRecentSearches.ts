import { useCallback, useState } from 'react';

const KEY = 'aurelle:recent-searches';
const DEFAULTS = ['Builder gel', 'Top coat', 'Lámpara LED'];

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as string[]) : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  const push = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 5);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
      return next;
    });
  }, []);

  return { recent, push };
}

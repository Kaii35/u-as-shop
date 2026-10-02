import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  apply,
  nextPreference,
  readPreference,
  resolve,
  savePreference,
  watchSystem,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme';

/**
 * Estado del tema, compartido por la tienda y el panel.
 *
 * Vive por encima de los dos proveedores de `App.tsx` para que el tema no se
 * reinicie al pasar de la tienda al panel: son dos árboles distintos, pero el
 * tema es de la persona, no de la sección.
 */
interface ThemeValue {
  /** Lo que la persona eligió: `system`, `light` o `dark`. */
  preference: ThemePreference;
  /** Lo que se está pintando de verdad. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Avanza al siguiente estado del ciclo. Es lo que hace el botón. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  /**
   * Arranca leyendo lo que el guion de `index.html` ya aplicó.
   *
   * No se vuelve a aplicar en el primer render: el guion corrió antes de que
   * el navegador pintara, así que la clase ya está puesta. Reaplicarla aquí
   * no rompería nada, pero animar en el arranque sí daría un destello.
   */
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference());
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolve(readPreference()));

  const setPreference = useCallback((next: ThemePreference) => {
    const resolved = resolve(next);
    savePreference(next);
    apply(resolved, true);
    setPreferenceState(next);
    setTheme(resolved);
  }, []);

  // El equipo cambió de tema y la preferencia es `system`: se sigue.
  useEffect(() => watchSystem((next) => {
    apply(next, true);
    setTheme(next);
  }), []);

  /**
   * Si otra pestaña cambia el tema, esta lo sigue.
   *
   * Sin esto, tener la tienda y el panel abiertos en dos pestañas dejaría una
   * en claro y otra en oscuro, y la siguiente recarga daría un salto sin que
   * nadie entienda por qué.
   */
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== 'aurelle.theme') return;
      const next = readPreference();
      const resolved = resolve(next);
      apply(resolved, true);
      setPreferenceState(next);
      setTheme(resolved);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      preference,
      theme,
      setPreference,
      cycle: () => setPreference(nextPreference(preference)),
    }),
    [preference, theme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}

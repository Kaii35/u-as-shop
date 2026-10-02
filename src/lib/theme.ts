/**
 * Tema claro / oscuro.
 *
 * Tres estados, no dos: `system` sigue al equipo, `light` y `dark` lo fuerzan.
 * Un interruptor de dos posiciones obliga a elegir para siempre y deja sin
 * salida a quien solo quiere que la tienda haga lo mismo que su teléfono.
 *
 * Este módulo es el ÚNICO sitio que toca la clase `.dark` del <html>. El resto
 * del proyecto no sabe en qué tema está: los colores salen de variables CSS
 * que `index.css` redefine, así que `text-ink` o `bg-sand` cambian solos.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
/** El tema que realmente se está pintando. `system` ya resuelto. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'aurelle.theme';

const query = (): MediaQueryList | null =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Navegación privada con almacenamiento bloqueado: se sigue al sistema.
  }
  return 'system';
}

export function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return query()?.matches ? 'dark' : 'light';
}

/**
 * Aplica el tema al documento.
 *
 * Además de la clase, mueve `theme-color`: es lo que tiñe la barra del
 * navegador en móvil, y sin tocarlo quedaría una franja blanca sobre una
 * página oscura, que se ve como un error de carga.
 */
export function apply(theme: ResolvedTheme, animate = false): void {
  const root = document.documentElement;

  if (animate) {
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 220);
  }

  root.classList.toggle('dark', theme === 'dark');

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#17130F' : '#FFFFFF');
}

export function savePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    /* Sin almacenamiento el tema dura lo que la pestaña. No es un error. */
  }
}

/**
 * Avisa cuando el equipo cambia de tema.
 *
 * Solo importa si la preferencia es `system`: si alguien forzó claro u oscuro,
 * que su portátil pase a modo noche no debe deshacer su decisión.
 */
export function watchSystem(onChange: (theme: ResolvedTheme) => void): () => void {
  const mq = query();
  if (!mq) return () => {};
  const handler = (event: MediaQueryListEvent): void => {
    if (readPreference() !== 'system') return;
    onChange(event.matches ? 'dark' : 'light');
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/**
 * El ciclo del botón: Claro → Oscuro → Equipo → Claro.
 *
 * Fijo y sin mirar en qué está el sistema, y eso es lo importante. La versión
 * anterior saltaba desde `system` al contrario de lo que el equipo mostrara, y
 * con el equipo en oscuro el ciclo degeneraba a dos estados: se quedaba
 * rebotando entre «según tu equipo» y «claro», y no habia forma de llegar a
 * «oscuro» fijo. Un ciclo que depende del entorno tampoco es predecible: el
 * mismo botón, pulsado dos veces, llevaba a sitios distintos en dos equipos.
 */
const CICLO: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function nextPreference(current: ThemePreference): ThemePreference {
  const i = CICLO.indexOf(current);
  return CICLO[(i + 1) % CICLO.length] ?? 'light';
}

export const PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: 'Según tu equipo',
  light: 'Claro',
  dark: 'Oscuro',
};

/**
 * La misma idea en una palabra, para los sitios donde no cabe la frase.
 *
 * «Según tu equipo» desborda un cajón de móvil de 320 px dentro de un control
 * segmentado de tres posiciones, y partir la etiqueta en dos líneas descuadra
 * la fila entera.
 */
export const PREFERENCE_SHORT: Record<ThemePreference, string> = {
  system: 'Equipo',
  light: 'Claro',
  dark: 'Oscuro',
};

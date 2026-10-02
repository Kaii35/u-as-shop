import type { Config } from 'tailwindcss';

/**
 * Sistema de diseño Aurelle.
 *
 * Cuatro reglas que el resto del código respeta:
 * 1. Ningún componente escribe un hex ni un tamaño de fuente arbitrario; todo sale de aquí.
 * 2. La escala tipográfica tiene 9 pasos y el mayor es 44px. Si algo necesita ser más
 *    grande, casi siempre el problema es la jerarquía, no el tamaño.
 * 3. El espaciado es múltiplo de 4. Las secciones usan `section` / `section-lg`.
 * 4. Los colores NO son hex: son variables CSS que `index.css` redefine para el modo
 *    oscuro. Por eso `text-ink` o `bg-sand` cambian de tema sin que ningún componente
 *    lleve una variante `dark:`.
 */

/**
 * Color desde una variable CSS, conservando el modificador de opacidad.
 *
 * La variable guarda los canales sueltos (`20 17 16`), no un color completo,
 * porque es la única forma de que `bg-ink/35` siga funcionando: Tailwind
 * sustituye `<alpha-value>` por la opacidad y necesita poder inyectarla dentro
 * de `rgb(...)`. Con `--ink: #141110` el modificador se perdería en silencio,
 * y hay 38 sitios en el proyecto que lo usan.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  // El tema se controla con la clase `.dark` en <html>, no con la preferencia
  // del sistema: así una persona puede forzar claro aunque su equipo esté en
  // oscuro, y `src/lib/theme.ts` es el único sitio que decide.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- Texto -------------------------------------------------------
        // Neutros cálidos: la fotografía del sitio es cálida y los grises fríos la ensucian.
        // En oscuro siguen significando lo mismo aunque dejen de ser literales:
        // `ink` es "el texto principal", no "tinta negra".
        ink: token('ink'),
        ash: token('ash'),
        mist: token('mist'),
        /** Texto que va ENCIMA de una superficie `ink`. Blanco en claro, oscuro en oscuro. */
        'on-ink': token('on-ink'),
        /**
         * Texto sobre un relleno de color: clay, ok, warn o danger.
         *
         * No es lo mismo que `on-ink`. Esos cuatro rellenos se ACLARAN en modo
         * oscuro, así que el blanco que servía en claro cae a 2,6-3,0:1 sobre
         * ellos. Aquí el valor correcto en oscuro es la tinta oscura.
         */
        'on-accent': token('on-accent'),
        /**
         * Bloque de contraste a sangre: pie, banda de anuncios, franja de
         * promesas. Oscuro en los DOS temas, al contrario que `ink`.
         */
        slab: token('slab'),
        'on-slab': token('on-slab'),

        // --- Superficies -------------------------------------------------
        /** Fondo de página. */
        canvas: token('canvas'),
        /** Fondo de página hundido, con tarjetas flotando encima (el panel). */
        'canvas-sunk': token('canvas-sunk'),
        /** Tarjetas, paneles, barras. Sustituye a `bg-white`. */
        surface: token('surface'),
        /** Superficie alterna: recessiva en claro, elevada en oscuro. */
        sand: token('sand'),
        /** Bordes y separadores. */
        line: token('line'),

        // --- Acento ------------------------------------------------------
        // Terracota. Es el único color saturado del sistema, así que marca
        // precio, oferta y acción. En oscuro se aclara a #E07A5A para mantener
        // el mismo peso: el original daba 3,08:1 sobre el fondo oscuro, por
        // debajo de lo legible.
        clay: {
          DEFAULT: token('clay'),
          /** La versión enfática (hover, texto sobre relleno suave). */
          dark: token('clay-strong'),
          /** Relleno teñido. */
          soft: token('clay-soft'),
        },

        // --- Estado ------------------------------------------------------
        ok: token('ok'),
        warn: token('warn'),
        danger: token('danger'),
        /** Rellenos de distintivo. Antes eran hex sueltos dentro de los componentes. */
        'ok-soft': token('ok-soft'),
        'warn-soft': token('warn-soft'),
        'danger-soft': token('danger-soft'),
        'info-soft': token('info-soft'),

        // Alias semánticos al estilo shadcn, para que los componentes de
        // terceros que esperan bg-background / text-foreground funcionen.
        background: token('canvas'),
        foreground: token('ink'),
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        meta: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],      // 11
        cap: ['0.75rem', { lineHeight: '1.125rem' }],                              // 12
        body: ['0.875rem', { lineHeight: '1.375rem' }],                            // 14
        lead: ['1rem', { lineHeight: '1.5rem' }],                                  // 16
        h5: ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],      // 18
        h4: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],    // 22
        h3: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],     // 28
        h2: ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.025em' }],      // 36
        h1: ['2.75rem', { lineHeight: '3rem', letterSpacing: '-0.03em' }],         // 44
      },
      spacing: {
        section: '3rem',      // 48 · separación vertical de sección en móvil
        'section-lg': '4.5rem', // 72 · en desktop
      },
      borderRadius: {
        xs: '3px',
        sm: '5px',
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      /**
       * Las sombras también son variables.
       *
       * Una sombra es oscuridad proyectada, y sobre un fondo ya oscuro no se
       * ve nada: en modo oscuro la elevación se comunica subiendo el tono de
       * la superficie y marcando el borde, no con sombra. Por eso `--shadow`
       * sube de opacidad y `--edge` añade un filo claro arriba, que es lo que
       * de verdad separa una tarjeta del fondo en oscuro.
       */
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / var(--shadow-weak)), 0 8px 24px -14px rgb(var(--shadow) / var(--shadow-mid))',
        pop: '0 16px 48px -16px rgb(var(--shadow) / var(--shadow-strong))',
        drawer: '-16px 0 48px -24px rgb(var(--shadow) / var(--shadow-strong))',
        header: '0 1px 0 rgb(var(--line) / 1)',
        /** Filo superior claro: la forma de "elevar" algo en modo oscuro. */
        edge: 'inset 0 1px 0 rgb(var(--edge) / var(--edge-weight))',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(.2,.7,.3,1)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .35s cubic-bezier(.2,.7,.3,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;

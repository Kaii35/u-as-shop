import type { Config } from 'tailwindcss';

/**
 * Sistema de diseño Aurelle.
 *
 * Tres reglas que el resto del código respeta:
 * 1. Ningún componente escribe un hex ni un tamaño de fuente arbitrario; todo sale de aquí.
 * 2. La escala tipográfica tiene 9 pasos y el mayor es 44px. Si algo necesita ser más
 *    grande, casi siempre el problema es la jerarquía, no el tamaño.
 * 3. El espaciado es múltiplo de 4. Las secciones usan `section` / `section-lg`.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutros cálidos: la fotografía del sitio es cálida y los grises fríos la ensucian.
        ink: '#141110',      // texto principal, botón primario
        ash: '#5C554F',      // texto secundario
        mist: '#8A827B',     // metadatos, texto deshabilitado
        line: '#E7E2DC',     // bordes y separadores
        sand: '#F6F3EF',     // superficie alterna
        // Acento: terracota. Es el único color saturado del sistema, así que marca
        // precio, oferta y acción. Contraste 5.2:1 sobre blanco.
        clay: {
          DEFAULT: '#A8432A',
          dark: '#8A3621',
          soft: '#F7E9E4',
        },
        // Alias semanticos al estilo shadcn, para que los componentes de
        // terceros que esperan bg-background / text-foreground funcionen.
        background: '#FFFFFF',
        foreground: '#141110',
        ok: '#2F6B4F',
        warn: '#9A6B1F',
        danger: '#B3261E',
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
      boxShadow: {
        card: '0 1px 2px rgba(20,17,16,.04), 0 8px 24px -14px rgba(20,17,16,.14)',
        pop: '0 16px 48px -16px rgba(20,17,16,.22)',
        drawer: '-16px 0 48px -24px rgba(20,17,16,.28)',
        header: '0 1px 0 rgba(231,226,220,1)',
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

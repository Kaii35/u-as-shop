import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';

const SLIDES = ['/images/auth/auth-1.jpg', '/images/auth/auth-2.jpg', '/images/auth/auth-3.jpg', '/images/auth/auth-4.jpg'];
const SLIDE_MS = 5000;

/**
 * Dos columnas a pantalla completa: carrusel a un lado, formulario al otro.
 *
 * El contenedor no scrollea. Si un formulario no cabe (pantallas bajas), la
 * que scrollea es su propia columna, no la página: recortar el contenido sería
 * peor que un scroll local.
 */
export function AuthLayout({ children, aside, reverse }: {
  children: ReactNode;
  aside?: ReactNode;
  reverse?: boolean;
  /** Se mantiene por compatibilidad; el carrusel usa su propio juego de fotos. */
  image?: string;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className={cn('flex h-full overflow-hidden rounded-lg border border-line', reverse && 'md:flex-row-reverse')}>
      {/* Panel de imagen. Oculto en móvil: ahí el formulario necesita todo el alto. */}
      <div className="relative hidden w-1/2 overflow-hidden bg-sand md:block">
        {SLIDES.map((src, n) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-soft',
              n === i ? 'opacity-100' : 'opacity-0',
            )}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />
        {aside && <div className="absolute inset-x-5 bottom-12">{aside}</div>}
        <div className="absolute inset-x-0 bottom-5 flex justify-center gap-1.5">
          {SLIDES.map((src, n) => (
            <button
              key={src}
              type="button"
              onClick={() => setI(n)}
              aria-label={`Imagen ${n + 1}`}
              aria-current={n === i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                n === i ? 'w-5 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      </div>

      {/* Columna del formulario */}
      <div className="flex w-full min-h-0 items-center justify-center overflow-y-auto px-5 py-6 md:w-1/2">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
  );
}

export function GoogleButton({ onClick, children, loading }: { onClick: () => void; children: ReactNode; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded border border-line bg-white text-body font-medium transition-colors hover:border-ink disabled:opacity-50"
    >
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {children}
    </button>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-meta uppercase tracking-[.1em] text-mist">
      <span className="h-px flex-1 bg-line" />{children}<span className="h-px flex-1 bg-line" />
    </div>
  );
}

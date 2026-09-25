import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Copy, Tag, X } from 'lucide-react';
import { api } from '../lib/api';
import type { PopupFrequency, PopupPromotion } from '../lib/admin-types';
import { useEscape, useLockBody } from '../lib/utils';
import { Button } from './ui/Button';
import { Img } from './ui/Primitives';

/**
 * El anuncio de la promoción en la portada.
 *
 * Es la cara pública de lo que se crea en el panel. Tres reglas lo gobiernan:
 *
 * 1. Si no hay promoción, o la API está apagada, no se pinta nada. Un aviso
 *    comercial no puede ser el motivo de que la tienda no cargue.
 * 2. No sale en el checkout ni en ingreso/registro: interrumpir a alguien que
 *    está pagando es la peor decisión posible en una tienda.
 * 3. La frecuencia la decide el navegador, porque el dato de «esta persona ya
 *    lo vio» solo existe aquí. El servidor no sabe quién es quién.
 */

// ---------------------------------------------------------------------------
// Memoria del navegador
// ---------------------------------------------------------------------------

/**
 * La marca se guarda **por id de promoción**.
 *
 * Si se guardara una sola bandera global, la campaña siguiente nacería
 * descartada para todo el que hubiera cerrado la anterior, y la dueña vería un
 * anuncio que nadie llega a ver.
 */
const SEEN_PREFIX = 'aurelle.promo.seen.';
/** Identifica la pestaña abierta: es lo que hace distinta una sesión de otra. */
const SESSION_KEY = 'aurelle.promo.session';
const DAY_MS = 24 * 60 * 60 * 1000;

interface SeenRecord {
  /** Cuándo se mostró, en milisegundos. */
  at: number;
  /** En qué sesión se mostró. */
  session: string;
}

/**
 * Todo acceso al almacenamiento va envuelto.
 *
 * En navegación privada y con las cookies bloqueadas, `localStorage` no
 * devuelve null: lanza. Sin el try/catch, un ajuste del navegador de la
 * clienta tumbaría la portada entera.
 */
function currentSession(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return '';
  }
}

function readSeen(id: string): SeenRecord | null {
  try {
    const raw = localStorage.getItem(SEEN_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SeenRecord>;
    if (typeof parsed?.at !== 'number') return null;
    return { at: parsed.at, session: typeof parsed.session === 'string' ? parsed.session : '' };
  } catch {
    return null;
  }
}

function writeSeen(id: string): void {
  try {
    const record: SeenRecord = { at: Date.now(), session: currentSession() };
    localStorage.setItem(SEEN_PREFIX + id, JSON.stringify(record));
    // Solo se anuncia una promoción a la vez, así que las marcas de las demás
    // ya no sirven para nada y, sin limpiarlas, el almacenamiento crecería una
    // entrada por campaña para siempre.
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SEEN_PREFIX) && key !== SEEN_PREFIX + id) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* Sin almacenamiento el anuncio saldrá otra vez: molesta menos que fallar. */
  }
}

/** Si a esta persona le toca ver el anuncio ahora mismo. */
function shouldShow(id: string, frequency: PopupFrequency): boolean {
  if (frequency === 'ALWAYS') return true;

  const seen = readSeen(id);
  if (!seen) return true;

  switch (frequency) {
    case 'ONCE':
      return false;
    case 'SESSION': {
      const session = currentSession();
      // Sin sesión fiable se muestra: perder una visita del anuncio es peor
      // que repetirlo, y es el caso raro (almacenamiento bloqueado).
      return session === '' || seen.session !== session;
    }
    case 'DAILY':
      // Ventana de 24 h y no «otro día del calendario»: si no, cerrarlo a las
      // 23:55 lo devolvería cinco minutos después.
      return Date.now() - seen.at >= DAY_MS;
    default:
      return true;
  }
}

/**
 * El contador de vistas, clics y cierres.
 *
 * Nunca espera ni propaga el fallo: que no se registre una vista no puede
 * impedir que el pop-up se cierre.
 */
function track(id: string, event: 'view' | 'click' | 'dismiss'): void {
  void api.publicPost<void>(`/api/promotions/${id}/track`, { event }).catch(() => undefined);
}

/** Rutas donde el anuncio estorba en vez de vender. */
const isBlocked = (pathname: string): boolean =>
  /^\/(checkout|ingresar|registro)(\/|$)/.test(pathname);

const untilText = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });

const TITLE_ID = 'promo-popup-titulo';

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PromoPopup() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [promotion, setPromotion] = useState<PopupPromotion | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const shownRef = useRef(false);
  const copyTimer = useRef<number | null>(null);

  const blocked = isBlocked(pathname);
  const visible = open && !blocked;

  // Se pide una sola vez al montar. Si falla —API apagada, sin red— la portada
  // sigue exactamente igual: no hay estado de error que pintar.
  useEffect(() => {
    const controller = new AbortController();
    api
      .publicGet<{ promotion: PopupPromotion | null }>(
        '/api/promotions/popup',
        controller.signal,
      )
      .then((response) => {
        if (!controller.signal.aborted) setPromotion(response?.promotion ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // El temporizador se cancela al desmontar y al salir a una ruta prohibida:
  // si no, el anuncio aparecería encima del checkout un segundo después.
  useEffect(() => {
    if (!promotion || blocked || shownRef.current) return;
    if (!shouldShow(promotion.id, promotion.frequency)) return;

    const timer = window.setTimeout(() => {
      shownRef.current = true;
      writeSeen(promotion.id);
      track(promotion.id, 'view');
      setOpen(true);
    }, Math.max(0, promotion.delayMs));

    return () => window.clearTimeout(timer);
  }, [promotion, blocked]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  // El foco entra al diálogo al abrir y vuelve a donde estaba al cerrar. Sin
  // esto, quien navega con teclado sigue en la página de atrás.
  useEffect(() => {
    if (!visible) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => restoreRef.current?.focus();
  }, [visible]);

  const dismiss = useCallback(() => {
    setOpen(false);
    if (promotion) track(promotion.id, 'dismiss');
  }, [promotion]);

  useLockBody(visible);
  useEscape(visible, dismiss);

  if (!promotion || !visible) return null;

  const goToPromotion = (): void => {
    track(promotion.id, 'click');
    setOpen(false);
    const url = promotion.ctaUrl;
    if (!url) return;
    if (/^https?:\/\//i.test(url)) window.location.assign(url);
    else navigate(url);
  };

  const copyCode = async (): Promise<void> => {
    if (!promotion.code) return;
    try {
      await navigator.clipboard.writeText(promotion.code);
      setCopied(true);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Sin permiso de portapapeles el cupón sigue a la vista para copiarlo a mano. */
    }
  };

  // Trampa de tabulación: en un diálogo modal el teclado no puede escaparse a
  // la página de atrás, que está tapada por el velo.
  const keepFocus = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea',
    );
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        aria-label="Cerrar el anuncio"
        onClick={dismiss}
        className="absolute inset-0 cursor-default bg-ink/45"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        onKeyDown={keepFocus}
        className="relative w-full max-w-[680px] animate-fade-up overflow-hidden rounded-lg bg-white shadow-pop outline-none"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="absolute right-2 top-2 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded bg-white/85 text-ash transition-colors hover:bg-sand hover:text-ink"
        >
          <X size={17} strokeWidth={2} aria-hidden />
        </button>

        <div className="flex flex-col sm:flex-row">
          {promotion.image && (
            <div className="relative min-h-[150px] shrink-0 bg-sand sm:min-h-[320px] sm:w-[42%]">
              <div className="absolute inset-0">
                <Img src={promotion.image} alt="" label="Promoción" />
              </div>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-3 p-5 sm:p-6">
            {promotion.badge && <span className="kicker">{promotion.badge}</span>}

            <h2 id={TITLE_ID} className="display text-balance text-h4 text-ink">
              {promotion.title}
            </h2>

            {promotion.subtitle && <p className="text-body text-ash">{promotion.subtitle}</p>}

            {promotion.code && (
              <div className="flex flex-col gap-1">
                <span className="text-cap text-mist">Usa este cupón al pagar</span>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-sm border border-dashed border-clay bg-clay-soft px-2.5 py-1.5 text-body font-semibold tracking-[.08em] text-clay-dark transition-colors hover:bg-clay hover:text-white"
                >
                  <Tag size={13} strokeWidth={2} aria-hidden />
                  {promotion.code}
                  {copied ? (
                    <Check size={13} strokeWidth={2.5} aria-hidden />
                  ) : (
                    <Copy size={13} strokeWidth={2} aria-hidden />
                  )}
                  <span className="sr-only">Copiar el cupón</span>
                </button>
                <span aria-live="polite" className="sr-only">
                  {copied ? 'Cupón copiado' : ''}
                </span>
              </div>
            )}

            <div className="mt-1 flex flex-col items-start gap-2">
              <Button block onClick={goToPromotion}>
                {promotion.ctaLabel ?? 'Ver la promoción'}
              </Button>
              <button
                type="button"
                onClick={dismiss}
                className="cursor-pointer self-center text-cap text-mist underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Ahora no
              </button>
            </div>

            {promotion.endsAt && (
              <p className="text-cap text-mist">Va hasta el {untilText(promotion.endsAt)}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../store/ThemeContext';

/*
  HeroAbanico — hero animado (React + TS, sin dependencias).

  Se dibuja en un lienzo de tamaño fijo y se escala al ancho disponible. Hay
  dos lienzos: uno apaisado para escritorio y uno vertical para celular. Con
  uno solo, en un teléfono todo quedaba al 20 %: botones de 11 px de alto.

  Usa las mismas fuentes que el resto de la tienda (Poppins en titulares,
  Inter en texto), que ya carga index.html.

  Sigue el tema de la página: en oscuro es una escena nocturna vino; en claro,
  un fondo rosa empolvado con texto en tinta. Los esmaltes del abanico son los
  mismos en los dos, porque son el producto.
*/

type Props = {
  catalogHref?: string;
  offersHref?: string;
  stats?: [number, string][];
  tilt?: number;
  bokeh?: boolean;
};

const ease = {
  enter: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  pop: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  sweep: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
const tw = (from: number, to: number, start: number, end: number, T: number, e = ease.enter) => {
  const p = Math.min(1, Math.max(0, (T - start) / (end - start)));
  return from + (to - from) * e(p);
};

const CUES = { Spot: 0, Fan: 1.6, Title: 4.2, Shop: 7 };
const DURATION = 10;
const DIST = 370, TW = 112, TH = 196;
const CHROME = 'chrome';
/**
 * Paleta por tema. Va en hex y no en tokens porque la escena tiene su propia
 * iluminación (halos, sombras, reflejos) afinada a mano para cada fondo.
 */
// tema-ok: paletas propias del hero, una por tema; se elige con useTheme()
const PALETTES = {
  dark: {
    bg: '#1A0B0F', text: '#F8ECEC', muted: '#CDB2B6', accent: '#F28C9E', onAccent: '#1A0B0F',
    halo: 'radial-gradient(closest-side, rgba(150,40,62,0.55), rgba(90,26,40,0.25) 55%, rgba(26,11,15,0) 100%)',
    corner: 'radial-gradient(closest-side, rgba(242,140,158,0.16), rgba(26,11,15,0))',
    floor: 'radial-gradient(closest-side, rgba(242,140,158,0.18), rgba(0,0,0,0))',
    stem: 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.06))',
    tipShadow: '0 24px 40px rgba(0,0,0,0.5)', btnShadow: '0 12px 30px rgba(242,140,158,0.3)',
    outline: 'rgba(248,236,236,0.3)', bokeh: 0.45,
  },
  // tema-ok: paleta clara del hero, se elige con useTheme()
  light: {
    bg: '#FBEFEE', text: '#2A1215', muted: '#7A5E5C', accent: '#B8233F', onAccent: '#FFF7F7',
    halo: 'radial-gradient(closest-side, rgba(242,140,158,0.45), rgba(244,210,200,0.3) 55%, rgba(251,239,238,0) 100%)',
    corner: 'radial-gradient(closest-side, rgba(255,255,255,0.8), rgba(251,239,238,0))',
    floor: 'radial-gradient(closest-side, rgba(122,20,40,0.16), rgba(0,0,0,0))',
    stem: 'linear-gradient(180deg, rgba(122,20,40,0.35), rgba(122,20,40,0.08))',
    tipShadow: '0 22px 36px rgba(90,26,40,0.28)', btnShadow: '0 12px 28px rgba(184,35,63,0.28)',
    outline: 'rgba(42,18,21,0.25)', bokeh: 0.35,
  },
} as const;
type Palette = (typeof PALETTES)[keyof typeof PALETTES];
// tema-ok: colores de esmalte de las uñas del abanico, son el producto
const TIPS = ['#7A1428', '#B8233F', '#E0475F', '#F28C9E', CHROME, '#F4D2C8', '#E9B7A7', '#C98B7C', '#3B0E18'];
// tema-ok: uñas desenfocadas del fondo, mismos tonos de esmalte
const BOKEH: [number, number, number, string, number][] = [
  [180, 140, 0.55, '#E0475F', 9], [760, 90, 0.4, '#F4D2C8', 7], [1780, 210, 0.6, '#B8233F', 10],
  [1650, 690, 0.45, '#F28C9E', 8], [980, 760, 0.35, '#C98B7C', 12], [90, 640, 0.5, '#7A1428', 9], [1180, 120, 0.3, '#F28C9E', 6],
];
const display = "'Poppins', system-ui, sans-serif", sans = "'Inter', system-ui, sans-serif";

/**
 * Medidas de cada lienzo, en sus propias unidades (no en px de pantalla).
 * En celular el texto va arriba y el abanico abajo, y las letras y botones
 * son el doble de grandes en el lienzo porque este se encoge más.
 */
const LAYOUTS = {
  desktop: {
    W: 1920, H: 900, PX: 1390, PY: 820,
    text: { left: 190, top: 210, width: 760 },
    kicker: 14, h1: 148, p: 18, pMax: 440, btnH: 54, btnF: 16, btnPad: 26, gap: 12,
    statNum: 36, statLbl: 13, statGap: 40, m: 1,
  },
  mobile: {
    W: 900, H: 1700, PX: 450, PY: 1620,
    text: { left: 70, top: 90, width: 760 },
    kicker: 26, h1: 132, p: 34, pMax: 760, btnH: 104, btnF: 32, btnPad: 46, gap: 20,
    statNum: 64, statLbl: 26, statGap: 64, m: 1.9,
  },
} as const;
const MOBILE_BELOW = 768;

/**
 * Movimiento ambiental después de la intro. Va en CSS y no en el bucle de
 * React a propósito: solo cambia `transform`, que el navegador compone en la
 * tarjeta gráfica sin repintar. El bucle por fotograma anterior volvía a
 * renderizar toda la escena 60 veces por segundo para siempre, y con el menú
 * abierto (que desenfocaba lo de atrás) la página caía a ~12 fps.
 */
const HERO_CSS = `
@keyframes hero-sway { 0%, 100% { transform: rotateY(-3deg); } 50% { transform: rotateY(3deg); } }
@keyframes hero-drift {
  from { transform: translateY(0) rotate(var(--r0)); }
  to { transform: translateY(var(--dy)) rotate(calc(var(--r0) + var(--rot))); }
}
.hero-sway { animation: hero-sway 9s ease-in-out infinite; will-change: transform; }
.hero-drift { animation: hero-drift 60s linear infinite; will-change: transform; transform: rotate(var(--r0)); }
[data-paused] .hero-sway, [data-paused] .hero-drift { animation-play-state: paused; }
/* Con el menú o el carrito abiertos, useLockBody pone overflow:hidden en el
   body; el hero queda tapado por el velo y no vale la pena seguir animándolo. */
body[style*="overflow: hidden"] .hero-sway, body[style*="overflow: hidden"] .hero-drift { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .hero-sway, .hero-drift { animation: none; } }
`;

const tipFill = (c: string) =>
  c === CHROME
    // tema-ok: degradado cromado de la uña metalizada
    ? 'linear-gradient(160deg,#fbe9ee 0%,#b9a3ab 32%,#ffffff 48%,#8d7680 68%,#f3dde3 100%)'
    : `linear-gradient(90deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 68%, rgba(0,0,0,0.34) 100%), radial-gradient(110% 70% at 50% 8%, rgba(255,255,255,0.28), rgba(255,255,255,0) 60%), ${c}`;

function Tip({ color, shine, scale = 1, shadow }: { color: string; shine: number; scale?: number; shadow: string }) {
  return (
    <div style={{ position: 'relative', width: TW * scale, height: TH * scale, borderRadius: '50% 50% 20% 20% / 64% 64% 12% 12%', background: tipFill(color), overflow: 'hidden', boxShadow: `${shadow}, inset 0 -10px 16px rgba(0,0,0,0.25)` }}>
      <div style={{ position: 'absolute', left: '20%', top: '9%', width: '15%', height: '56%', borderRadius: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0))' }} />
      <div style={{ position: 'absolute', left: '-30%', width: '160%', height: '40%', top: `${shine}%`, transform: 'rotate(-18deg)', background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.45), rgba(255,255,255,0))' }} />
    </div>
  );
}

function Chars({ text, T, start, style }: { text: string; T: number; start: number; style?: CSSProperties }) {
  return (
    <span aria-hidden style={{ display: 'flex', ...style }}>
      {text.split('').map((ch, i) => {
        const st = start + i * 0.045;
        return (
          <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: tw(0, 1, st, st + 0.6, T), filter: `blur(${tw(12, 0, st, st + 0.7, T)}px)`, transform: `translateY(${tw(40, 0, st, st + 0.9, T)}px)` }}>{ch}</span>
        );
      })}
    </span>
  );
}

export default function HeroAbanico({
  catalogHref = '/tienda',
  offersHref = '/tienda?oferta=1',
  stats = [],
  tilt = 14,
  bokeh = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [T, setT] = useState(0);
  const [onScreen, setOnScreen] = useState(true);
  const P: Palette = PALETTES[useTheme().theme];

  // Fuera de pantalla las animaciones ambientales se pausan.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setT(DURATION); return; }
    // React solo anima la intro. Al terminar se detiene el bucle: el
    // balanceo y las uñas flotantes siguen con CSS (ver HERO_CSS), que corre
    // en la tarjeta gráfica y no vuelve a renderizar nada.
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      setT(Math.min(t, DURATION));
      if (t < DURATION) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const L = width > 0 && width < MOBILE_BELOW ? LAYOUTS.mobile : LAYOUTS.desktop;
  const { W, H, PX, PY } = L;
  const scale = width ? width / W : 1;

  // Intro termina en DURATION; después solo sigue el balanceo suave.
  const Ti = Math.min(T, DURATION);
  const glow = tw(0, 1, CUES.Spot, CUES.Spot + 1.4, Ti);
  const cam = tw(1.06, 1, 0, CUES.Shop + 3, Ti);
  const n = TIPS.length, mid = (n - 1) / 2, step = 16;
  const groupRot = tw(-24, 0, CUES.Fan, CUES.Fan + 1.6, Ti);
  const rivet = tw(0, 1, CUES.Fan, CUES.Fan + 0.5, Ti, ease.pop);
  const rise = (st: number): CSSProperties => ({ opacity: tw(0, 1, st, st + 0.7, Ti), transform: `translateY(${tw(22, 0, st, st + 0.9, Ti)}px)` });
  const s = CUES.Shop;
  const cnt = tw(0, 1, s + 0.7, s + 1.9, Ti);
  const line = tw(0, 64 * L.m, CUES.Title - 0.2, CUES.Title + 0.8, Ti);

  return (
    <section ref={wrapRef} data-paused={onScreen ? undefined : ''} aria-label="Natalia Sánchez — insumos profesionales" style={{ position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, overflow: 'hidden', background: P.bg, transition: 'background-color .4s ease' }}>
      <style>{HERO_CSS}</style>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {/* Fondo */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: PX - 900, top: PY - 1100, width: 1800, height: 1500, borderRadius: '50%', opacity: glow, background: P.halo }} />
          <div style={{ position: 'absolute', left: -300, top: -300, width: 1100, height: 1100, borderRadius: '50%', opacity: glow * 0.6, background: P.corner }} />
          {bokeh && BOKEH.map(([x, y, sc, c, b], i) => (
            <div
              key={i}
              className="hero-drift"
              style={{
                position: 'absolute', left: (x * W) / 1920, top: (y * H) / 900, opacity: glow * P.bokeh,
                ['--r0' as string]: `${i * 37}deg`,
                ['--dy' as string]: `${-60 * (6 + i * 2)}px`,
                ['--rot' as string]: `${(i % 2 ? 4 : -4) * 60}deg`,
              } as CSSProperties}
            >
              {/* El desenfoque va en una capa interior que no se anima: así se
                  dibuja una vez y solo se desplaza, en vez de recalcularse en
                  cada fotograma. */}
              <div style={{ filter: `blur(${b}px)` }}>
                <Tip color={c} shine={-100} scale={sc} shadow={P.tipShadow} />
              </div>
            </div>
          ))}
          <div style={{ position: 'absolute', left: PX - 520, top: PY - 30, width: 1040, height: 140, borderRadius: '50%', opacity: glow, background: P.floor }} />
        </div>

        <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam})`, transformOrigin: `${PX}px ${PY - 300}px` }}>
          {/* Abanico */}
          <div aria-hidden style={{ position: 'absolute', left: PX, top: PY, perspective: 1800 }}>
            <div className="hero-sway" style={{ transformStyle: 'preserve-3d' }}>
            <div style={{ transformStyle: 'preserve-3d', transform: `rotateX(${tilt * 0.6}deg) rotateY(${-tilt}deg) rotate(${groupRot}deg)` }}>
              {TIPS.map((c, i) => {
                const off = Math.abs(i - mid);
                const isHero = i === mid;
                const st = CUES.Fan + 0.15 + off * 0.1;
                const ang = isHero ? 0 : tw(0, (i - mid) * step, st, st + 1.1, Ti, ease.pop);
                const op = isHero ? tw(0, 1, CUES.Spot + 0.2, CUES.Spot + 0.8, Ti) : tw(0, 1, st, st + 0.3, Ti);
                const hs = isHero ? tw(0.35, 1, CUES.Spot + 0.2, CUES.Fan, Ti) : 1;
                const hy = isHero ? tw(360, 0, CUES.Spot + 0.2, CUES.Fan, Ti) : 0;
                const hr = isHero ? tw(320, 0, CUES.Spot + 0.2, CUES.Fan, Ti) : 0;
                const blur = isHero ? tw(18, 0, CUES.Spot + 0.2, CUES.Spot + 1.4, Ti) : 0;
                const shineSt = CUES.Title + 0.9 + i * 0.09;
                const shine = tw(-60, 140, shineSt, shineSt + 0.9, Ti, ease.sweep);
                return (
                  <div key={i} style={{ position: 'absolute', left: 0, top: 0, transform: `rotate(${ang}deg)`, transformOrigin: '0 0', opacity: op, zIndex: 20 - Math.round(off) }}>
                    <div style={{ position: 'absolute', left: -1, top: -(DIST - TH / 2) + 8, width: 2, height: DIST - TH / 2 - 8, background: P.stem, opacity: isHero ? rivet : 1 }} />
                    <div style={{ position: 'absolute', left: -TW / 2, top: -DIST - TH / 2, transform: `translateY(${hy}px) scale(${hs}) rotateY(${hr}deg)`, filter: blur > 0.2 ? `blur(${blur}px)` : 'none' }}>
                      <Tip color={c} shine={shine} shadow={P.tipShadow} />
                    </div>
                  </div>
                );
              })}
              {/* tema-ok: remache metalico del abanico */}
              <div style={{ position: 'absolute', left: -20, top: -20, width: 40, height: 40, borderRadius: '50%', transform: `scale(${rivet})`, background: 'radial-gradient(circle at 35% 30%, #fff, #c9b3ba 40%, #6d5660 100%)', boxShadow: '0 6px 14px rgba(0,0,0,0.5)', zIndex: 30 }} />
            </div>
            </div>
          </div>

          {/* Texto */}
          <div style={{ position: 'absolute', ...L.text, color: P.text, fontFamily: sans, transition: 'color .4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 * L.m, fontSize: L.kicker, letterSpacing: '0.28em', textTransform: 'uppercase', color: P.muted, ...rise(CUES.Title - 0.2) }}>
              <span style={{ width: line, height: L.m, background: P.accent }} />
              Insumos profesionales
            </div>
            <h1 aria-label="Color que se queda." style={{ margin: `${26 * L.m}px 0 0`, fontFamily: display, fontSize: L.h1, lineHeight: 1.02, letterSpacing: '-0.03em', fontWeight: 700 }}>
              <Chars text="Color que" T={Ti} start={CUES.Title} />
              <Chars text="se queda." T={Ti} start={CUES.Title + 0.4} style={{ fontStyle: 'italic', fontWeight: 600, color: P.accent }} />
            </h1>
            <p style={{ margin: `${34 * L.m}px 0 0`, maxWidth: L.pMax, fontSize: L.p, lineHeight: 1.55, color: P.muted, textWrap: 'pretty', ...rise(s) } as CSSProperties}>
              Esmaltes, geles, herramientas y nail art de las marcas que usan las profesionales. Envíos a toda Colombia.
            </p>
            <div style={{ display: 'flex', gap: L.gap, marginTop: 30 * L.m, ...rise(s + 0.25) }}>
              <Link to={catalogHref} style={{ display: 'flex', alignItems: 'center', gap: L.gap, height: L.btnH, padding: `0 ${L.btnPad}px`, borderRadius: 999, background: P.accent, color: P.onAccent, fontSize: L.btnF, fontWeight: 600, textDecoration: 'none', boxShadow: P.btnShadow }}>Ver catálogo <span aria-hidden>→</span></Link>
              <Link to={offersHref} style={{ display: 'flex', alignItems: 'center', height: L.btnH, padding: `0 ${L.btnPad}px`, borderRadius: 999, border: `${L.m}px solid ${P.outline}`, color: P.text, fontSize: L.btnF, fontWeight: 500, textDecoration: 'none' }}>Ofertas</Link>
            </div>
            {stats.length > 0 && (
              <div style={{ display: 'flex', gap: L.statGap, marginTop: 44 * L.m, ...rise(s + 0.5) }}>
                {stats.map(([num, l]) => (
                  <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 4 * L.m }}>
                    <span style={{ fontFamily: display, fontWeight: 600, fontSize: L.statNum, lineHeight: 1, color: P.text }}>{Math.round(num * cnt)}</span>
                    <span style={{ fontSize: L.statLbl, letterSpacing: '0.08em', color: P.muted }}>{l}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

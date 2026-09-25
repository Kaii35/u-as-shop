import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { money, shortCOP } from './Primitives';

/**
 * Gráficas del panel.
 *
 * Hechas a mano en SVG y no con una librería por dos razones: una librería de
 * gráficas pesa más que todo el resto del panel junto, y ninguna respeta este
 * sistema de diseño sin pelearse con ella. Aquí son cuatro formas contadas.
 *
 * Decisiones de color, que es donde más se estropea una gráfica:
 *
 * - **Una serie a la vez.** El selector de medida (ingresos, pedidos, unidades,
 *   margen) cambia lo que se mira en vez de amontonar cuatro líneas de escalas
 *   distintas en un mismo eje. Con una sola serie no hace falta paleta
 *   categórica, y la mitad de los problemas de daltonismo desaparecen.
 * - **El periodo anterior va en gris y discontinuo.** No es una segunda serie
 *   con identidad propia: es una referencia, y el gris lo dice sin necesidad de
 *   leer la leyenda. El trazo discontinuo es la codificación secundaria que
 *   permite distinguirlas sin depender del color.
 * - **Nunca dos ejes.** Si dos medidas no comparten escala, son dos gráficas.
 */

const CLAY = '#A8432A';
const MIST = '#8A827B';
const LINE = '#E7E2DC';
const INK = '#141110';

/** Ancho real del contenedor. El SVG se redibuja con él en vez de estirarse. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

// ---------------------------------------------------------------------------
// Serie de tiempo
// ---------------------------------------------------------------------------

export interface TimePoint {
  label: string;
  value: number;
  /** Mismo punto del periodo anterior. Se dibuja como referencia. */
  compare?: number;
  /** Lo que se muestra en el tooltip además del valor. */
  detail?: string;
}

export function TimeSeriesChart({
  points,
  format = 'money',
  compareLabel = 'Periodo anterior',
  valueLabel = 'Ingresos',
  height = 248,
  className,
}: {
  points: TimePoint[];
  format?: 'money' | 'count';
  compareLabel?: string;
  valueLabel?: string;
  height?: number;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const fmt = (n: number) => (format === 'money' ? money(n) : n.toLocaleString('es-CO'));
  const fmtAxis = (n: number) => (format === 'money' ? shortCOP(n) : n.toLocaleString('es-CO'));

  const hasCompare = points.some((p) => typeof p.compare === 'number');

  // El eje arranca en cero siempre. Recortarlo exagera las diferencias: un
  // 3 % de subida parece que se duplicó, y sobre eso se toman decisiones.
  const maxValue = Math.max(
    1,
    ...points.map((p) => Math.max(p.value, p.compare ?? 0)),
  );
  // Redondea el techo hacia arriba para que las guías caigan en números redondos.
  const step = Math.pow(10, Math.floor(Math.log10(maxValue))) / 2 || 1;
  const top = Math.ceil(maxValue / step) * step;

  const pad = { top: 14, right: 12, bottom: 26, left: format === 'money' ? 54 : 40 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;

  const x = (i: number) =>
    pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;

  const path = (get: (p: TimePoint) => number | undefined): string =>
    points
      .map((p, i) => {
        const v = get(p);
        if (v === undefined) return '';
        return `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');

  const areaPath =
    points.length > 0
      ? `${path((p) => p.value)} L${x(points.length - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`
      : '';

  // Como mucho 7 etiquetas en el eje: más se superponen y obligan a rotarlas,
  // que se lee peor que enseñar menos fechas.
  const tickEvery = Math.max(1, Math.ceil(points.length / 7));

  const onPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (points.length === 0 || innerW <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rel = event.clientX - rect.left - pad.left;
    const ratio = Math.min(1, Math.max(0, rel / innerW));
    setHover(Math.round(ratio * (points.length - 1)));
  };

  const active = hover !== null ? points[hover] : null;

  return (
    <div className={cn('relative', className)} ref={ref}>
      {hasCompare && (
        <div className="mb-2 flex flex-wrap items-center gap-4 text-cap text-ash">
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden>
              <line x1="0" y1="4" x2="16" y2="4" stroke={CLAY} strokeWidth="2" />
            </svg>
            {valueLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-mist">
            <svg width="16" height="8" aria-hidden>
              <line
                x1="0"
                y1="4"
                x2="16"
                y2="4"
                stroke={MIST}
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            </svg>
            {compareLabel}
          </span>
        </div>
      )}

      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${valueLabel} por periodo. Los datos exactos están en la tabla que sigue.`}
          onPointerMove={onPointer}
          onPointerLeave={() => setHover(null)}
          className="touch-none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={CLAY} stopOpacity="0.18" />
              <stop offset="1" stopColor={CLAY} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Guías horizontales. Recesivas a propósito: son referencia, no dato. */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const value = top * (1 - f);
            const gy = pad.top + innerH * f;
            return (
              <g key={f}>
                <line x1={pad.left} y1={gy} x2={width - pad.right} y2={gy} stroke={LINE} strokeWidth="1" />
                <text
                  x={pad.left - 8}
                  y={gy + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill={MIST}
                  className="tnum"
                >
                  {fmtAxis(value)}
                </text>
              </g>
            );
          })}

          {points.length > 0 && (
            <>
              <path d={areaPath} fill={`url(#${gradientId})`} />
              {hasCompare && (
                <path
                  d={path((p) => p.compare)}
                  fill="none"
                  stroke={MIST}
                  strokeWidth="2"
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                />
              )}
              <path
                d={path((p) => p.value)}
                fill="none"
                stroke={CLAY}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}

          {points.map((p, i) =>
            i % tickEvery === 0 ? (
              <text
                key={p.label + i}
                x={x(i)}
                y={height - 8}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                fontSize="10"
                fill={MIST}
              >
                {p.label}
              </text>
            ) : null,
          )}

          {hover !== null && active && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                y1={pad.top}
                x2={x(hover)}
                y2={pad.top + innerH}
                stroke={INK}
                strokeOpacity="0.18"
                strokeWidth="1"
              />
              {typeof active.compare === 'number' && (
                <circle cx={x(hover)} cy={y(active.compare)} r="4" fill={MIST} stroke="#fff" strokeWidth="2" />
              )}
              {/* Anillo blanco de 2px: separa el punto de la línea y del área
                  cuando se superponen, que es justo donde se va a mirar. */}
              <circle cx={x(hover)} cy={y(active.value)} r="5" fill={CLAY} stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}

      {hover !== null && active && width > 0 && (
        <div
          className="pointer-events-none absolute z-20 w-max max-w-[220px] rounded border border-line bg-white p-2.5 shadow-pop"
          style={{
            left: Math.min(Math.max(x(hover) - 70, 4), Math.max(4, width - 150)),
            top: 4,
          }}
        >
          <p className="text-meta font-semibold uppercase tracking-[.06em] text-mist">
            {active.label}
          </p>
          <p className="tnum display mt-0.5 text-h5 leading-tight text-ink">{fmt(active.value)}</p>
          {typeof active.compare === 'number' && (
            <p className="tnum mt-0.5 text-cap text-mist">
              {compareLabel}: {fmt(active.compare)}
            </p>
          )}
          {active.detail && <p className="mt-1 text-cap text-ash">{active.detail}</p>}
        </div>
      )}

      {/* La misma serie en tabla. Es lo que hace la gráfica utilizable con
          lector de pantalla, y de paso permite copiar las cifras exactas. */}
      <ChartTable
        caption={`${valueLabel} por periodo`}
        head={['Periodo', valueLabel, ...(hasCompare ? [compareLabel] : [])]}
        rows={points.map((p) => [
          p.label,
          fmt(p.value),
          ...(hasCompare ? [typeof p.compare === 'number' ? fmt(p.compare) : '—'] : []),
        ])}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras horizontales
// ---------------------------------------------------------------------------

export interface BarItem {
  id: string;
  label: string;
  value: number;
  /** Segunda cifra, a la derecha: unidades junto a ingresos, por ejemplo. */
  meta?: string;
  href?: string;
  icon?: ReactNode;
}

/**
 * Ranking. Barras horizontales porque las etiquetas son nombres largos de
 * producto: en vertical habría que rotarlas y dejan de leerse.
 *
 * Todas las barras del mismo color a propósito. Teñirlas por posición haría
 * que el color significara "puesto", y el puesto ya lo dice el orden.
 */
export function BarList({
  items,
  format = 'money',
  emptyLabel = 'Sin datos en este periodo',
  className,
}: {
  items: BarItem[];
  format?: 'money' | 'count';
  emptyLabel?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <p className="px-1 py-6 text-center text-body text-mist">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = (n: number) => (format === 'money' ? money(n) : n.toLocaleString('es-CO'));

  return (
    <ol className={cn('flex flex-col gap-2.5', className)}>
      {items.map((item, index) => (
        <li key={item.id} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-1.5 text-body text-ink">
              <span className="tnum w-4 shrink-0 text-cap text-mist">{index + 1}</span>
              <span className="truncate">{item.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              {item.meta && <span className="tnum text-cap text-mist">{item.meta}</span>}
              <span className="tnum text-body font-medium text-ink">{fmt(item.value)}</span>
            </span>
          </div>
          {/* Extremo redondeado de 4px anclado a la línea base, no una píldora:
              redondear los dos lados desplaza visualmente el origen. */}
          <div className="h-1.5 w-full overflow-hidden rounded-r-[4px] bg-sand">
            <div
              className="h-full rounded-r-[4px] bg-clay transition-[width] duration-500 ease-soft"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Minigráfica
// ---------------------------------------------------------------------------

/** Tendencia dentro de una tarjeta. Sin ejes: la forma es todo el mensaje. */
export function Sparkline({
  values,
  width = 88,
  height = 26,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const px = (i / (values.length - 1)) * (width - 2) + 1;
      const py = height - 2 - ((v - min) / span) * (height - 4);
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={d} fill="none" stroke={CLAY} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tabla equivalente
// ---------------------------------------------------------------------------

/**
 * La versión en tabla de una gráfica.
 *
 * Visualmente oculta pero presente en el árbol de accesibilidad y desplegable
 * a mano. No se usa `hidden` ni `display:none` porque eso la sacaría también
 * del lector de pantalla, que es justo a quien va dirigida.
 */
export function ChartTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: string[][];
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mt-2"
    >
      <summary className="cursor-pointer text-cap text-mist transition-colors hover:text-ink">
        Ver los datos en tabla
      </summary>
      <div className="mt-2 max-h-56 overflow-auto rounded border border-line">
        <table className="w-full border-collapse text-cap">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="sticky top-0 border-b border-line bg-sand px-2.5 py-1.5 text-left font-semibold text-ash"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={cn(
                      'border-b border-line px-2.5 py-1 text-ink',
                      j > 0 && 'tnum text-right',
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Barra de distribución: estados de pedido, canales de venta.
 *
 * Es una barra apilada con separación de 2px entre segmentos, para que dos
 * tramos contiguos no se lean como uno solo. Cada tramo lleva su etiqueta
 * fuera: el color por sí solo nunca identifica nada.
 */
export function DistributionBar({
  segments,
  className,
}: {
  segments: Array<{ id: string; label: string; value: number; className: string }>;
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) {
    return <p className="py-4 text-center text-body text-mist">Sin datos todavía</p>;
  }
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div className={className}>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-sm">
        {visible.map((s) => (
          <div
            key={s.id}
            className={cn('h-full first:rounded-l-sm last:rounded-r-sm', s.className)}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {segments.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-body">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-xs', s.className)} aria-hidden />
              <span className="truncate text-ash">{s.label}</span>
            </span>
            <span className="tnum shrink-0 font-medium text-ink">
              {s.value.toLocaleString('es-CO')}
              <span className="ml-1.5 font-normal text-mist">
                {Math.round((s.value / total) * 100)} %
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

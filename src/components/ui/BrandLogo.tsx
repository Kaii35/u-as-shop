import { cn } from '../../lib/utils';

/**
 * Wordmarks de las marcas del catálogo.
 *
 * Las marcas son ficticias, así que no existe un logo que traer: cada una se
 * dibuja aquí con su propio carácter tipográfico y una marca geométrica, que
 * es lo que distingue unos logos de otros en un muro real.
 *
 * Todo va en `currentColor` y como SVG en línea (no <img>), por dos motivos:
 * el muro puede pasar de gris a tinta al pasar el cursor con una sola clase,
 * y el texto usa las fuentes ya cargadas por la página — un SVG servido como
 * imagen queda aislado y no puede usarlas.
 */

const A = 'Archivo, system-ui, sans-serif';
const I = 'Inter, system-ui, sans-serif';

type Props = { name: string; className?: string };

const MARKS: Record<string, JSX.Element> = {
  // Serif de alto contraste con filete inferior
  'Velours Pro': (
    <g>
      <text x="0" y="20" fontFamily="Georgia, serif" fontSize="19" letterSpacing="2.4" fill="currentColor">VELOURS</text>
      {/* Filete decorativo de ancho fijo: no pretende igualar el ancho de la
          palabra, que cambia segun la fuente que resuelva el navegador. */}
      <rect x="0" y="27" width="104" height="1" fill="currentColor" />
      <text x="0" y="40" fontFamily={I} fontSize="8" fontWeight="600" letterSpacing="4.6" fill="currentColor">PRO</text>
    </g>
  ),
  // Geométrica en caja baja con punto
  'Nácar Lab': (
    <g>
      <circle cx="6" cy="24" r="6" fill="currentColor" />
      <text x="19" y="30" fontFamily={A} fontSize="21" fontWeight="600" letterSpacing="-0.6" fill="currentColor">
        nácar
        <tspan dx="8" fontFamily={I} fontSize="11" fontWeight="500" letterSpacing="1.6" opacity=".65">LAB</tspan>
      </text>
    </g>
  ),
  // Caps condensadas dentro de un filete
  'Atelier Nº9': (
    <g>
      <rect x="0.5" y="7.5" width="127" height="29" fill="none" stroke="currentColor" strokeWidth="1" />
      <text x="10" y="27" fontFamily={A} fontSize="14" fontWeight="500" letterSpacing="2.8" fill="currentColor">
        ATELIER
        <tspan dx="4" fontFamily="Georgia, serif" fontSize="14" fontStyle="italic" letterSpacing="0">Nº9</tspan>
      </text>
    </g>
  ),
  // Serif en cursiva con rombo
  'Lumière Gel': (
    <g>
      <path d="M6 18 L11 24 L6 30 L1 24 Z" fill="currentColor" />
      <text x="18" y="29" fontFamily="Georgia, serif" fontSize="20" fontStyle="italic" fill="currentColor">
        Lumière
        <tspan dx="7" fontFamily={I} fontSize="9" fontStyle="normal" fontWeight="600" letterSpacing="2.4" opacity=".65">GEL</tspan>
      </text>
    </g>
  ),
  // Caps muy espaciadas, sin marca
  Solenne: (
    <g>
      <text x="0" y="29" fontFamily={A} fontSize="16" fontWeight="500" letterSpacing="7.5" fill="currentColor">SOLENNE</text>
    </g>
  ),
  // Pesada y compacta con cuadrado
  Kirei: (
    <g>
      <rect x="0" y="14" width="20" height="20" fill="currentColor" />
      <text x="28" y="31" fontFamily={A} fontSize="25" fontWeight="700" letterSpacing="-1.2" fill="currentColor">KIREI</text>
    </g>
  ),
  // Bloque de dos líneas
  'Maré Cosmetics': (
    <g>
      <text x="0" y="22" fontFamily={A} fontSize="21" fontWeight="600" letterSpacing="1.2" fill="currentColor">MARÉ</text>
      <text x="0" y="36" fontFamily={I} fontSize="8" fontWeight="500" letterSpacing="3.6" fill="currentColor" opacity=".65">COSMETICS</text>
    </g>
  ),
  // Monolínea con arco de pestaña
  'Oriel Lash': (
    <g>
      <path d="M2 28 C8 16 22 16 28 28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 16 L15 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <text x="36" y="29" fontFamily={A} fontSize="18" fontWeight="500" letterSpacing="0.6" fill="currentColor">
        Oriel
        <tspan dx="7" fontFamily={I} fontSize="10" fontWeight="500" letterSpacing="2.2" opacity=".65">LASH</tspan>
      </text>
    </g>
  ),
};

export function BrandLogo({ name, className }: Props) {
  const mark = MARKS[name];
  return (
    <svg
      viewBox="0 0 150 48"
      role="img"
      aria-label={name}
      className={cn('h-full w-auto', className)}
      preserveAspectRatio="xMidYMid meet"
    >
      {mark ?? (
        <text x="0" y="30" fontFamily={A} fontSize="18" fontWeight="600" fill="currentColor">{name}</text>
      )}
    </svg>
  );
}

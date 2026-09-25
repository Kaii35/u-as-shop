import { cn } from '../../lib/utils';

/**
 * Wordmarks de las marcas del catálogo. Las marcas son ficticias, así que no
 * existe un logo que traer: cada una se dibuja aquí con su propio carácter.
 *
 * Van en HTML y no en SVG a propósito. En SVG centrar exige `text-anchor` o
 * un viewBox ajustado, y ambos dependen del ancho que acabe midiendo la
 * fuente: al medirlo, tres de los ocho quedaban desviados hasta 4px del eje.
 * En HTML el centrado lo resuelve el contenedor flex y deja de depender de la
 * fuente. El único resto es el espacio que el navegador añade tras la última
 * letra cuando hay letter-spacing, que se compensa con un margen negativo.
 *
 * Todo hereda `currentColor`, así que el muro pasa de gris a tinta con una
 * sola clase en el enlace que los envuelve.
 *
 * Los tamaños están afinados marca a marca, no con una escala común: una
 * versalita muy espaciada y una caja baja pesada no pesan igual a la vista
 * al mismo tamaño en puntos.
 */

type Props = { name: string; className?: string };

/** Compensa el espacio final que deja `tracking` para que el bloque quede centrado. */
const track = (em: string) => ({ letterSpacing: em, marginRight: `-${em}` });

const MARKS: Record<string, JSX.Element> = {
  'Velours Pro': (
    <span className="flex flex-col items-center leading-none">
      <span className="font-[Georgia,serif] text-[24px]" style={track('0.14em')}>VELOURS</span>
      <span className="my-[6px] h-px w-full bg-current" />
      <span className="text-[10px] font-semibold" style={track('0.55em')}>PRO</span>
    </span>
  ),

  'Nácar Lab': (
    <span className="flex items-baseline gap-2 leading-none">
      <span className="h-4 w-4 shrink-0 self-center rounded-full bg-current" />
      <span className="display text-[27px] tracking-[-0.02em]">nácar</span>
      <span className="text-[13px] font-medium" style={track('0.14em')}>LAB</span>
    </span>
  ),

  'Atelier Nº9': (
    <span className="flex items-baseline gap-1.5 border border-current px-4 py-[9px] leading-none">
      <span className="display text-[17px] font-medium" style={track('0.2em')}>ATELIER</span>
      <span className="font-[Georgia,serif] text-[17px] italic">Nº9</span>
    </span>
  ),

  'Lumière Gel': (
    <span className="flex items-baseline gap-2 leading-none">
      <span className="h-3 w-3 shrink-0 self-center rotate-45 bg-current" />
      <span className="font-[Georgia,serif] text-[26px] italic">Lumière</span>
      <span className="text-[11px] font-semibold" style={track('0.26em')}>GEL</span>
    </span>
  ),

  Solenne: (
    <span className="display text-[20px] font-medium leading-none" style={track('0.47em')}>SOLENNE</span>
  ),

  Kirei: (
    <span className="flex flex-col items-center leading-none">
      <span className="mb-[8px] h-[2px] w-14 bg-current" />
      <span className="display text-[32px] font-bold tracking-[-0.04em]">KIREI</span>
    </span>
  ),

  'Maré Cosmetics': (
    <span className="flex flex-col items-center leading-none">
      <span className="display text-[26px] font-semibold" style={track('0.06em')}>MARÉ</span>
      <span className="mt-[6px] text-[10px] font-medium" style={track('0.45em')}>COSMETICS</span>
    </span>
  ),

  'Oriel Lash': (
    <span className="flex flex-col items-center leading-none">
      <svg viewBox="0 0 30 10" aria-hidden className="mb-[7px] h-3 w-[36px]">
        <path d="M2 8 C8 1 22 1 28 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="flex items-baseline gap-1.5">
        <span className="display text-[24px] font-medium">Oriel</span>
        <span className="text-[12px] font-medium" style={track('0.22em')}>LASH</span>
      </span>
    </span>
  ),
};

export function BrandLogo({ name, className }: Props) {
  return (
    <span role="img" aria-label={name} className={cn('inline-flex items-center justify-center', className)}>
      {MARKS[name] ?? <span className="display text-[22px] font-semibold leading-none">{name}</span>}
    </span>
  );
}

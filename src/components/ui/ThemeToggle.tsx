import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../store/ThemeContext';
import { PREFERENCE_LABEL, type ThemePreference } from '../../lib/theme';
import { cn } from '../../lib/utils';

/**
 * Botón de tema.
 *
 * Un solo botón que cicla, no un desplegable: es una decisión de dos segundos
 * que se toma una vez, y un menú para eso pesa más de lo que vale. El icono
 * dice en qué estado está y el `title` dice a dónde lleva el siguiente clic,
 * porque un icono de luna no aclara por sí solo si es "estás en oscuro" o
 * "pulsa para oscuro" — la duda clásica de este control.
 */

const ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const NEXT_HINT: Record<ThemePreference, string> = {
  system: 'Cambiar a tema fijo',
  light: 'Cambiar a oscuro',
  dark: 'Volver a seguir tu equipo',
};

export function ThemeToggle({
  className,
  size = 'md',
}: {
  className?: string;
  /** `sm` para barras densas como la del panel. */
  size?: 'sm' | 'md';
}) {
  const { preference, cycle } = useTheme();
  const Icon = ICONS[preference];

  return (
    <button
      type="button"
      onClick={cycle}
      // El estado va en el nombre accesible, no solo en el icono: un lector de
      // pantalla no puede ver que la luna está rellena.
      aria-label={`Tema: ${PREFERENCE_LABEL[preference]}. ${NEXT_HINT[preference]}`}
      title={`Tema: ${PREFERENCE_LABEL[preference]} · ${NEXT_HINT[preference]}`}
      className={cn(
        'flex shrink-0 cursor-pointer items-center justify-center rounded text-ash transition-colors hover:bg-sand hover:text-ink',
        size === 'sm' ? 'h-9 w-9' : 'h-10 w-10',
        className,
      )}
    >
      <Icon size={size === 'sm' ? 16 : 17} strokeWidth={2} aria-hidden />
    </button>
  );
}

/**
 * Versión con las tres opciones a la vista. Para los ajustes del panel, donde
 * hay sitio y conviene que se entienda que "según tu equipo" existe.
 */
export function ThemeSegmented({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const options: ThemePreference[] = ['system', 'light', 'dark'];

  return (
    <div
      role="group"
      aria-label="Tema de la interfaz"
      className={cn('flex rounded border border-line bg-surface p-0.5', className)}
    >
      {options.map((option) => {
        const Icon = ICONS[option];
        const active = preference === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => setPreference(option)}
            aria-pressed={active}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-1 text-cap font-medium transition-colors',
              active ? 'bg-ink text-on-ink' : 'text-ash hover:bg-sand hover:text-ink',
            )}
          >
            <Icon size={13} strokeWidth={2} aria-hidden />
            {PREFERENCE_LABEL[option]}
          </button>
        );
      })}
    </div>
  );
}

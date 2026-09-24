import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'accent' | 'light' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
}

/**
 * Botones rectangulares y en caja baja. Los de píldora en versalitas pertenecían
 * al registro editorial anterior; en una tienda densa restan legibilidad y espacio.
 */
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ash',
  secondary: 'border border-line bg-white text-ink hover:border-ink',
  accent: 'bg-clay text-white hover:bg-clay-dark',
  light: 'bg-white text-ink hover:bg-sand',
  ghost: 'text-ash hover:bg-sand hover:text-ink',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 gap-1.5 px-3 text-cap',
  md: 'h-11 gap-2 px-4 text-body',
  lg: 'h-12 gap-2 px-5 text-body',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded font-medium transition-colors duration-200 ease-soft disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
});

export function IconButton({ className, label, badge, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; badge?: number }) {
  return (
    <button
      aria-label={label}
      className={cn('relative flex h-10 w-10 cursor-pointer items-center justify-center rounded text-ink transition-colors hover:bg-sand', className)}
      {...rest}
    >
      {rest.children}
      {!!badge && (
        <span className="tnum absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-clay px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

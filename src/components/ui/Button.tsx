import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'dark' | 'light' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-wine text-ivory hover:bg-wine-dark',
  secondary: 'border border-ink text-ink hover:bg-ink hover:text-ivory',
  dark: 'bg-ink text-ivory hover:bg-wine',
  light: 'bg-ivory text-wine hover:bg-blush',
  ghost: 'text-ink hover:text-wine',
};
const sizes: Record<Size, string> = {
  sm: 'h-11 px-5 text-[11px]',
  md: 'h-[52px] px-7 text-xs',
  lg: 'h-14 px-8 text-xs',
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
        'inline-flex items-center justify-center gap-2.5 rounded-full font-medium uppercase tracking-[.15em] transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
});

export function IconButton({ className, label, badge, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; badge?: number }) {
  return (
    <button
      aria-label={label}
      className={cn('relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-nude', className)}
      {...rest}
    >
      {rest.children}
      {!!badge && (
        <span className="absolute right-1 top-1 min-w-[17px] rounded-full bg-wine px-1 text-center text-[10px] font-semibold leading-[17px] text-ivory">
          {badge}
        </span>
      )}
    </button>
  );
}

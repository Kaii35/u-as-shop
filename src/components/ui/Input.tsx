import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
}

function Field({ id, label, hint, error, className, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[.14em]">
          {label}
          {hint && <span className="ml-2 font-normal normal-case tracking-normal text-muted">{hint}</span>}
        </label>
      )}
      {children}
      {error && <p id={`${id}-err`} role="alert" className="text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

const box = (error?: string) =>
  cn('rounded-xl border bg-white transition-colors focus-within:border-wine', error ? 'border-danger' : 'border-ink/20');

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {
  trailing?: ReactNode;
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, inputClassName, trailing, id, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field id={fid} label={label} hint={hint} error={error} className={className}>
      <div className={cn('flex h-[52px] items-center', box(error))}>
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error}
          aria-describedby={error ? `${fid}-err` : undefined}
          className={cn('h-full min-w-0 flex-1 bg-transparent px-[18px] text-[15.5px] outline-none placeholder:text-muted/70', inputClassName)}
          {...rest}
        />
        {trailing && <div className="pr-1.5">{trailing}</div>}
      </div>
    </Field>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {}
export function Select({ label, hint, error, className, id, children, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field id={fid} label={label} hint={hint} error={error} className={className}>
      <select id={fid} aria-invalid={!!error} className={cn('h-[52px] px-3.5 text-[15px] outline-none', box(error))} {...rest}>
        {children}
      </select>
    </Field>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}
export function Textarea({ label, hint, error, className, id, ...rest }: TextareaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field id={fid} label={label} hint={hint} error={error} className={className}>
      <textarea id={fid} className={cn('resize-y px-[18px] py-3.5 text-[15.5px] leading-normal outline-none', box(error))} {...rest} />
    </Field>
  );
}

export function Checkbox({ checked, onChange, children, radio, className }: {
  checked: boolean; onChange: (v: boolean) => void; children: ReactNode; radio?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      role={radio ? 'radio' : 'checkbox'}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('flex min-h-7 items-start gap-3 text-left text-[14.5px] leading-snug transition-colors hover:text-wine', className)}
    >
      <span className={cn(
        'mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-colors',
        radio ? 'rounded-full' : 'rounded-[5px]',
        checked ? (radio ? 'border-wine' : 'border-wine bg-wine text-ivory') : 'border-ink/30',
      )}>
        {checked && (radio ? <span className="h-2.5 w-2.5 rounded-full bg-wine" /> : <Check size={13} strokeWidth={2} />)}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

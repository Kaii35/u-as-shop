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
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-cap font-medium text-ash">
          {label}
          {hint && <span className="ml-1.5 font-normal text-mist">{hint}</span>}
        </label>
      )}
      {children}
      {error && <p id={`${id}-err`} role="alert" className="text-cap text-danger">{error}</p>}
    </div>
  );
}

/** Caja de campo: 40px de alto, esquina de 8px y foco marcado con el acento. */
const box = (error?: string) =>
  cn(
    'rounded border bg-white transition-colors focus-within:ring-2 focus-within:ring-clay/25',
    error ? 'border-danger focus-within:border-danger' : 'border-line focus-within:border-clay',
  );

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
      <div className={cn('flex h-10 items-center', box(error))}>
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error}
          aria-describedby={error ? `${fid}-err` : undefined}
          className={cn('h-full min-w-0 flex-1 rounded bg-transparent px-3 text-body outline-none placeholder:text-mist', inputClassName)}
          {...rest}
        />
        {trailing && <div className="pr-1">{trailing}</div>}
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
      <select id={fid} aria-invalid={!!error} className={cn('h-10 cursor-pointer px-2.5 text-body outline-none', box(error))} {...rest}>
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
      <textarea id={fid} className={cn('resize-y px-3 py-2.5 text-body leading-normal outline-none', box(error))} {...rest} />
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
      className={cn('flex min-h-6 cursor-pointer items-start gap-2.5 text-left text-body leading-snug text-ash transition-colors hover:text-ink', className)}
    >
      <span className={cn(
        'mt-px flex h-4 w-4 shrink-0 items-center justify-center border transition-colors',
        radio ? 'rounded-full' : 'rounded-xs',
        checked ? (radio ? 'border-clay' : 'border-clay bg-clay text-white') : 'border-line bg-white',
      )}>
        {checked && (radio ? <span className="h-2 w-2 rounded-full bg-clay" /> : <Check size={11} strokeWidth={3} />)}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

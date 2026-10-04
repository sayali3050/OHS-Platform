import {
  forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/utils/cn";

const control =
  "h-11 w-full rounded-md border bg-surface px-3 text-[15px] text-ink placeholder:text-muted/70 transition-colors focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-signal focus:border-transparent disabled:opacity-60";

interface FieldShell { label: string; error?: string; hint?: ReactNode; className?: string }

function Shell({ id, label, error, hint, className, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-sm font-medium text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldShell;

export const TextField = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, className, id, ...props }, ref) => {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} error={error} hint={hint} className={className}>
      <input ref={ref} id={fid} aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        className={cn(control, error ? "border-danger" : "border-line")} {...props} />
    </Shell>
  );
});
TextField.displayName = "TextField";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldShell;

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, hint, className, id, children, ...props }, ref) => {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} error={error} hint={hint} className={className}>
      <select ref={ref} id={fid} aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        className={cn(control, "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10",
          "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23738296%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
          error ? "border-danger" : "border-line")} {...props}>
        {children}
      </select>
    </Shell>
  );
});
SelectField.displayName = "SelectField";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaProps>(({ label, error, hint, className, id, ...props }, ref) => {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} error={error} hint={hint} className={className}>
      <textarea ref={ref} id={fid} rows={4} aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        className={cn(control, "h-auto min-h-[112px] py-2.5 leading-relaxed", error ? "border-danger" : "border-line")} {...props} />
    </Shell>
  );
});
TextAreaField.displayName = "TextAreaField";

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[15px]">
      <input type="checkbox" className="h-5 w-5 rounded border-line accent-[hsl(var(--signal))]" {...props} />
      {label}
    </label>
  );
}

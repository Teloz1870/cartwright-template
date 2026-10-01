import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * AdminField + AdminInput/Select/Textarea — Polaris-felt. Centraliserer
 * the `inputClass`/`labelClass` strings that were duplicated in ProductForm,
 * CategoryForm, PageForm, ServiceForm, DiscountCodeForm. Label = `font-medium`
 * (drop `uppercase font-black`); navy focus-ring beholdes.
 */
const CONTROL =
  "w-full rounded-lg border border-sol-glass-border-dark bg-sol-sand px-3 py-2 text-sm text-sol-ink placeholder:text-sol-muted/60 transition focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25 disabled:opacity-60";

export function AdminField({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-sol-ink">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
      {help && !error ? <p className="text-xs text-sol-muted">{help}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function AdminInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

export function AdminSelect({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function AdminTextarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-[96px]", className)} {...rest} />;
}

import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

const controlClass =
  "w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-acc focus:outline-none";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="text-xs font-medium tracking-wide text-sub uppercase">{label}</span>
      {children}
      {hint && <span className="text-xs text-sub">{hint}</span>}
    </label>
  );
}

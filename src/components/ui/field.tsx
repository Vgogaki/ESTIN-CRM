"use client";

import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useState } from "react";

const controlClass =
  "w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm text-ink placeholder:text-sub focus:border-acc focus:outline-none";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.25" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 5.5S5.2 4 10 4c1.1 0 2.08.16 2.95.43M17.5 8.5c-.5.9-1.2 1.8-2.15 2.6M10 12.25a2.25 2.25 0 0 1-2.13-2.98M7.35 7.7a2.25 2.25 0 0 1 2.83-.03"
      />
      <path strokeLinecap="round" d="M1.5 10S3 12.7 5.6 14.2M18.5 10s-.35.75-1 1.58" />
      <path strokeLinecap="round" d="M3.5 3.5l13 13" />
    </svg>
  );
}

/** A password field with a show/hide toggle. Not a native browser control, so the eye is our own icon, not a dependency. */
export function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${controlClass} pr-10 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute top-1/2 right-2 -translate-y-1/2 text-sub hover:text-ink"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
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

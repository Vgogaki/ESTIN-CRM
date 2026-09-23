import { type ReactNode } from "react";

type Tone = "accent" | "success" | "danger" | "warning" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  accent: "bg-accbg text-acc",
  success: "border border-success-bd bg-success-bg text-success",
  danger: "border border-danger-bd bg-danger-bg text-danger",
  warning: "border border-warning-bd bg-warning-bg text-warning",
  neutral: "bg-raise text-sub",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

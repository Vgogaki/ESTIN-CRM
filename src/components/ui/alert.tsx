import { type ReactNode } from "react";

type Tone = "danger" | "success" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  danger: "border-danger-bd bg-danger-bg text-[#e8938e]",
  success: "border-success-bd bg-success-bg text-[#5fcb98]",
  warning: "border-warning-bd bg-warning-bg text-[#e0b775]",
};

export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${TONE_CLASSES[tone]}`}>{children}</div>
  );
}

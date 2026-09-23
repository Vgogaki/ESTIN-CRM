import { type HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`w-full rounded-lg border border-bd bg-surface ${className}`}
      {...props}
    />
  );
}

function money(value: string, currency: string) {
  const n = Number(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function Meter({
  label,
  used,
  limit,
  currency,
}: {
  label: string;
  used: string;
  limit: string;
  currency: string;
}) {
  const pct = Math.min(100, (Number(used) / Math.max(Number(limit), 0.01)) * 100);
  const danger = pct >= 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-sub">{label}</span>
        <span className={danger ? "font-medium text-danger" : "font-medium"}>
          {money(used, currency)} / {money(limit, currency)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raise">
        <div
          className={`h-full rounded-full ${danger ? "bg-danger" : "bg-acc"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

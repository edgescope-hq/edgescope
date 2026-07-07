import type { GroupStat } from "@/lib/analytics";
import { fmtPct, fmtRR } from "@/lib/analytics";

export function StatCard({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: "primary" | "accent" | "success" | "destructive";
}) {
  const accentCls =
    accent === "primary"
      ? "text-primary"
      : accent === "accent"
        ? "text-primary-glow"
        : accent === "success"
          ? "text-success"
          : accent === "destructive"
            ? "text-destructive"
            : "text-foreground";
  return (
    <div className="glow-card rounded-2xl p-5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <div className={`mt-3 font-mono text-3xl font-bold tabular-nums ${accentCls}`}>
        {value}
        {unit && <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>}
      </div>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function GroupBars({
  title,
  stats,
  empty = "Not enough data yet.",
}: {
  title: string;
  stats: GroupStat[];
  empty?: string;
}) {
  const max = Math.max(1, ...stats.map((s) => s.count));
  return (
    <div className="glow-card rounded-2xl p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {stats.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {stats.map((s) => (
            <li key={s.key}>
              <div className="flex items-center justify-between text-sm">
                <span className="truncate font-medium capitalize">{s.key.replace(/_/g, " ")}</span>
                <span className="ml-2 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {s.count} · {fmtPct(s.winRate)} · {fmtRR(s.avgRR)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-700 ease-out"
                  style={{ width: `${(s.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InsightCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
  sub?: string;
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="glow-card rounded-2xl p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2.5 text-xl font-bold ${toneCls}`}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

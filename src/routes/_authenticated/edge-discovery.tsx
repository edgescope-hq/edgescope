import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Trophy, Heart, Frown, Layers, Clock, Info } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import type { DbTrade } from "@/lib/trade-mappers";
import { toAnalytics } from "@/lib/trade-mappers";
import {
  bestWorst, categoryStats, emotionStats, mistakeStats, sessionStats,
  weekdayStats, gradeStats, mostCommon, fmtPct, fmtRR,
} from "@/lib/analytics";
import { sessionLabel } from "@/lib/trade-constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/edge-discovery")({
  head: () => ({
    meta: [
      { title: "AI Edge Discovery — EdgeScope" },
      { name: "description", content: "Discover patterns in your trading journal based on actual trade data." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EdgeDiscoveryPage,
});

const MIN_SAMPLE = 5;
const MIN_GLOBAL = 20;

type Confidence = "none" | "low" | "medium" | "strong";

function confidenceLabel(c: Confidence): string {
  switch (c) {
    case "none": return "Not enough data";
    case "low": return "Low confidence";
    case "medium": return "Medium confidence";
    case "strong": return "Strong confidence";
  }
}

function confidenceLevel(count: number): Confidence {
  if (count < 5) return "none";
  if (count < 10) return "low";
  if (count < 20) return "medium";
  return "strong";
}

function confidenceBadge(count: number) {
  const c = confidenceLevel(count);
  const colors: Record<Confidence, string> = {
    none: "bg-muted/10 text-muted-foreground ring-muted/20",
    low: "bg-warning/10 text-warning ring-warning/20",
    medium: "bg-primary/10 text-primary ring-primary/20",
    strong: "bg-success/10 text-success ring-success/20",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", colors[c])}>
      {confidenceLabel(c)}
    </span>
  );
}

function EdgeDiscoveryPage() {
  const list = useServerFn(listTrades);
  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => list() });
  const trades = (data ?? []) as DbTrade[];
  const rows = useMemo(() => trades.map(toAnalytics), [trades]);

  const cats = useMemo(() => categoryStats(rows), [rows]);
  const sessions = useMemo(() => sessionStats(rows), [rows]);
  const days = useMemo(() => weekdayStats(rows), [rows]);
  const grades = useMemo(() => gradeStats(rows), [rows]);
  const mistakes = useMemo(() => mistakeStats(rows), [rows]);
  const emoBefore = useMemo(() => emotionStats(rows, "before"), [rows]);

  const bwCat = bestWorst(cats, MIN_SAMPLE);
  const bwSession = bestWorst(sessions, MIN_SAMPLE);
  const bwDay = bestWorst(days, MIN_SAMPLE);
  const costliestMistake = mostCommon(mistakes.filter((m) => m.count >= 3));

  const winEmotions = emoBefore.filter((e) => e.count >= 3 && (e.winRate ?? 0) >= 55).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  const loseEmotions = emoBefore.filter((e) => e.count >= 3 && (e.winRate ?? 0) < 45).sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0));

  const profitableCat = [...cats].filter((c) => c.count >= MIN_SAMPLE).sort((a, b) => (b.avgRR ?? -99) - (a.avgRR ?? -99))[0] ?? null;
  const consistentCat = [...cats].filter((c) => c.count >= MIN_SAMPLE).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0] ?? null;

  const patterns = useMemo(() => discoverPatterns(rows), [rows]);

  const playbook = buildPlaybook({
    bestSession: bwSession.best, worstSession: bwSession.worst,
    bestDay: bwDay.best, worstDay: bwDay.worst,
    bestCat: bwCat.best, worstCat: bwCat.worst,
    costliestMistake, loseEmotions, winEmotions,
  });

  const totalTrades = trades.length;

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold tracking-tight md:text-4xl">
            AI Edge Discovery
          </motion.h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Patterns are based on your actual journal data only. No market predictions or trade signals.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 text-muted-foreground ring-1 ring-white/[0.06]">
          <Clock className="h-3 w-3" /> {totalTrades} trades analyzed
        </span>
        {totalTrades < MIN_SAMPLE && (
          <span className="rounded-full bg-warning/10 px-3 py-1 text-warning ring-1 ring-warning/20">
            {MIN_SAMPLE - totalTrades} more trades needed for basic insights
          </span>
        )}
        {totalTrades >= MIN_SAMPLE && totalTrades < MIN_GLOBAL && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary ring-1 ring-primary/20">
            Log {MIN_GLOBAL - totalTrades} more trades for stronger confidence
          </span>
        )}
      </div>

      <SectionHeader title="Data Insights" subtitle="Your top-level stats across all accounts. Confidence improves with more data." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Insight icon={Trophy} tone="success" label="Strongest Edge"
          value={bwCat.best ? bwCat.best.key : null}
          sub={bwCat.best ? `${fmtPct(bwCat.best.winRate)} · ${bwCat.best.count} trades · ${fmtRR(bwCat.best.avgRR)} avg` : undefined}
          count={bwCat.best?.count ?? 0} />
        <Insight icon={AlertTriangle} tone="destructive" label="Weakest Edge"
          value={bwCat.worst ? bwCat.worst.key : null}
          sub={bwCat.worst ? `${fmtPct(bwCat.worst.winRate)} · ${bwCat.worst.count} trades` : undefined}
          count={bwCat.worst?.count ?? 0} />
        <Insight icon={TrendingUp} tone="success" label="Best Session"
          value={bwSession.best ? sessionLabel(bwSession.best.key) : null}
          sub={bwSession.best ? `${fmtPct(bwSession.best.winRate)} · ${bwSession.best.count} trades` : undefined}
          count={bwSession.best?.count ?? 0} />
        <Insight icon={TrendingDown} tone="destructive" label="Worst Session"
          value={bwSession.worst ? sessionLabel(bwSession.worst.key) : null}
          sub={bwSession.worst ? `${fmtPct(bwSession.worst.winRate)} · ${bwSession.worst.count} trades` : undefined}
          count={bwSession.worst?.count ?? 0} />
        <Insight icon={Trophy} tone="success" label="Best Trading Day"
          value={bwDay.best?.key ?? null}
          sub={bwDay.best ? `${fmtPct(bwDay.best.winRate)} · ${bwDay.best.count} trades` : undefined}
          count={bwDay.best?.count ?? 0} />
        <Insight icon={Heart} tone="success" label="Most Common Winning Emotion"
          value={winEmotions[0]?.key ?? null}
          sub={winEmotions[0] ? `${fmtPct(winEmotions[0].winRate)} win rate · ${winEmotions[0].count} trades` : undefined}
          count={winEmotions[0]?.count ?? 0} />
        <Insight icon={Frown} tone="destructive" label="Most Common Losing Emotion"
          value={loseEmotions[0]?.key ?? null}
          sub={loseEmotions[0] ? `${fmtPct(loseEmotions[0].winRate)} win rate · ${loseEmotions[0].count} trades` : undefined}
          count={loseEmotions[0]?.count ?? 0} />
        <Insight icon={TrendingUp} tone="success" label="Most Profitable Category"
          value={profitableCat?.key ?? null}
          sub={profitableCat ? `${fmtRR(profitableCat.avgRR)} avg · ${profitableCat.count} trades` : undefined}
          count={profitableCat?.count ?? 0} />
        <Insight icon={Layers} tone="success" label="Most Consistent Category"
          value={consistentCat?.key ?? null}
          sub={consistentCat ? `${fmtPct(consistentCat.winRate)} win rate · ${consistentCat.count} trades` : undefined}
          count={consistentCat?.count ?? 0} />
        <Insight icon={AlertTriangle} tone="destructive" label="Most Costly Mistake"
          value={costliestMistake?.key ?? null}
          sub={costliestMistake ? `${costliestMistake.count} occurrences · ${fmtPct(costliestMistake.winRate)} win rate` : undefined}
          count={costliestMistake?.count ?? 0} />
        <Insight icon={Trophy} tone="success" label="Highest Grade Performance"
          value={(() => {
            const g = grades.find((x) => x.count >= MIN_SAMPLE);
            return g?.key ?? null;
          })()}
          sub={(() => {
            const g = grades.find((x) => x.count >= MIN_SAMPLE);
            return g ? `${fmtPct(g.winRate)} · ${g.count} trades` : undefined;
          })()}
          count={(() => {
            const g = grades.find((x) => x.count >= MIN_SAMPLE);
            return g?.count ?? 0;
          })()} />
      </div>

      <SectionHeader title="What AI Discovered" subtitle="Combined patterns from your trade data. Each insight explains why and shows supporting evidence." />
      {totalTrades < MIN_SAMPLE ? (
        <div className="rounded-2xl bg-white/[0.03] p-6 text-center text-sm text-muted-foreground ring-1 ring-white/[0.04]">
          <p>Not enough data for pattern discovery. Log at least {MIN_SAMPLE} trades to see combined patterns here.</p>
        </div>
      ) : patterns.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.03] p-6 text-center text-sm text-muted-foreground ring-1 ring-white/[0.04]">
          Log more trades across different setups or sessions to discover combined patterns.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {patterns.map((p, i) => (
            <div key={p.key} className="glow-card rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold tracking-wider text-primary">PATTERN {String.fromCharCode(65 + i)}</div>
                <div className="flex items-center gap-1.5">
                  {confidenceBadge(p.count)}
                </div>
              </div>
              <div className="mt-2 text-sm font-semibold">{p.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{p.count} trades · {fmtRR(p.avgRR)} avg · Net {p.netR.toFixed(2)}R</div>
              <p className="mt-2 text-xs text-muted-foreground/80">{p.insight}</p>
            </div>
          ))}
        </div>
      )}

      <SectionHeader title="Your Personal Playbook" subtitle="Based on your actual results. Confidence depends on sample size." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glow-card rounded-2xl p-5">
          <div className="flex items-center gap-2 text-success">
            <Trophy className="h-4 w-4" />
            <div className="text-sm font-bold">Your Best Conditions</div>
          </div>
          {playbook.best.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Waiting for data.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {playbook.best.map((b) => (
                <li key={b.item} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  <div>
                    <div>{b.text}</div>
                    <div className="mt-0.5">{confidenceBadge(b.count)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glow-card rounded-2xl p-5">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <div className="text-sm font-bold">Conditions to Review</div>
          </div>
          {playbook.weak.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Waiting for data.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {playbook.weak.map((b) => (
                <li key={b.item} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                  <div>
                    <div>{b.text}</div>
                    <div className="mt-0.5">{confidenceBadge(b.count)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <SectionHeader title="About These Insights" />
      <div className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/[0.04]">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>EdgeScope analyzes your journal data only. It does not predict markets or give trade signals. All insights are based on patterns in your logged trades.</p>
            <p>Confidence levels are based on sample size: 5-9 trades is Low, 10-19 is Medium, 20+ is Strong. Review patterns with Low confidence as early signals rather than rules.</p>
            <p>The goal is to help you understand patterns in your own behavior and execution, not to tell you what to trade. Keep journaling consistently for more reliable insights over time.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mt-10 mb-3">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Insight({ icon: Icon, label, value, sub, count }: {
  icon: typeof Sparkles; label: string; value: string | null; sub?: string;
  tone: "success" | "destructive" | "neutral"; count: number;
}) {
  const empty = !value;
  return (
    <div className="glow-card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-[10px] font-semibold tracking-wider text-muted-foreground truncate">{label}</div>
        </div>
        {!empty && confidenceBadge(count)}
      </div>
      <div className={cn("mt-2 text-base font-bold", empty && "text-muted-foreground")}>
        {empty ? "Not enough data" : value}
      </div>
      {!empty && sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

type Pattern = { key: string; label: string; count: number; winRate: number; avgRR: number | null; netR: number; insight: string };

function discoverPatterns(rows: ReturnType<typeof toAnalytics>[]): Pattern[] {
  const buckets = new Map<string, { label: string; trades: typeof rows }>();
  for (const t of rows) {
    const cats = t.categories.length ? t.categories : [""];
    for (const c of cats) {
      if (!c && !t.session) continue;
      const key = `${c}|${t.session ?? ""}`;
      const label = [c || "Untagged", t.session ? sessionLabel(t.session) : null].filter(Boolean).join(" · ");
      if (!buckets.has(key)) buckets.set(key, { label, trades: [] });
      buckets.get(key)!.trades.push(t);
    }
  }
  const out: Pattern[] = [];
  for (const [key, b] of buckets) {
    if (b.trades.length < MIN_SAMPLE) continue;
    const wins = b.trades.filter((t) => t.result === "win").length;
    const losses = b.trades.filter((t) => t.result === "loss").length;
    const decided = wins + losses;
    if (!decided) continue;
    const winRate = (wins / decided) * 100;
    const rrs = b.trades.map((t) => (t.achieved_rr == null ? null : Number(t.achieved_rr))).filter((n): n is number => n != null && !isNaN(n));
    const netR = rrs.reduce((a, c) => a + c, 0);
    const avgRR = rrs.length ? netR / rrs.length : null;
    let insight = "";
    if (winRate >= 60) {
      insight = `Performs well in your journal with ${wins} wins in ${decided} decided trades. Keep collecting data before turning this into a fixed rule.`;
    } else if (winRate <= 40) {
      insight = `Below-average results with ${losses} losses in ${decided} decided trades. Consider reviewing entries and exits in this setup.`;
    } else {
      insight = `Mixed results across ${decided} decided trades. Review trade-by-trade execution — look for what separates the wins from the losses.`;
    }
    out.push({ key, label: b.label, count: b.trades.length, winRate, avgRR, netR, insight });
  }
  return out.sort((a, b) => b.netR - a.netR).slice(0, 9);
}

function buildPlaybook(input: {
  bestSession: ReturnType<typeof bestWorst>["best"];
  worstSession: ReturnType<typeof bestWorst>["best"];
  bestDay: ReturnType<typeof bestWorst>["best"];
  worstDay: ReturnType<typeof bestWorst>["best"];
  bestCat: ReturnType<typeof bestWorst>["best"];
  worstCat: ReturnType<typeof bestWorst>["best"];
  costliestMistake: ReturnType<typeof mostCommon>;
  loseEmotions: { key: string; winRate: number | null; count: number }[];
  winEmotions: { key: string; winRate: number | null; count: number }[];
}) {
  const best: { item: string; text: string; count: number }[] = [];
  const weak: { item: string; text: string; count: number }[] = [];
  if (input.bestSession) best.push({
    item: "session", text: `${sessionLabel(input.bestSession.key)} session (${fmtPct(input.bestSession.winRate)} win rate)`, count: input.bestSession.count,
  });
  if (input.bestCat) best.push({
    item: "category", text: `${input.bestCat.key} setups (${fmtPct(input.bestCat.winRate)})`, count: input.bestCat.count,
  });
  if (input.bestDay) best.push({
    item: "day", text: `Trading on ${input.bestDay.key}`, count: input.bestDay.count,
  });
  if (input.winEmotions[0]) best.push({
    item: "emotion", text: `Entering in a "${input.winEmotions[0].key}" emotional state`, count: input.winEmotions[0].count,
  });

  if (input.worstSession) weak.push({
    item: "session", text: `${sessionLabel(input.worstSession.key)} session (${fmtPct(input.worstSession.winRate)})`, count: input.worstSession.count,
  });
  if (input.worstCat) weak.push({
    item: "category", text: `${input.worstCat.key} setups (${fmtPct(input.worstCat.winRate)})`, count: input.worstCat.count,
  });
  if (input.worstDay) weak.push({
    item: "day", text: `Trading on ${input.worstDay.key}`, count: input.worstDay.count,
  });
  if (input.loseEmotions[0]) weak.push({
    item: "emotion", text: `Entering when feeling "${input.loseEmotions[0].key}"`, count: input.loseEmotions[0].count,
  });
  if (input.costliestMistake) weak.push({
    item: "mistake", text: `Recurring mistake: ${input.costliestMistake.key}`, count: input.costliestMistake.count,
  });
  return { best, weak };
}

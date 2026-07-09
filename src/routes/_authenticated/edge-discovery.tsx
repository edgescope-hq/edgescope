import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  Gauge,
  Layers,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import { formatTradeWhen, isPaperTrade, recordedR, rrNum, type DbTrade } from "@/lib/trade-mappers";
import { getReviewStatus } from "@/lib/review-status";
import {
  buildScopeDiscoveries,
  CONFIDENCE_LABEL,
  type DiscoveryCategory,
  type ScopeDiscovery,
} from "@/lib/scope-discovery";
import { cn } from "@/lib/utils";
import { PageHeader, PageShell } from "@/components/ui/premium";

export const Route = createFileRoute("/_authenticated/edge-discovery")({
  head: () => ({
    meta: [
      { title: "Scope — EdgeScope" },
      {
        name: "description",
        content:
          "Evidence-based review clues from your reviewed trades. No signals, no predictions.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ScopePage,
});

const REQUIRED_REVIEWED = 10;

// Display-only projection for the matching-trades modal.
type ReviewedTrade = DbTrade & {
  rr: number | null;
  category: string;
  directionLabel: "Long" | "Short";
};

function asReviewed(t: DbTrade): ReviewedTrade {
  return {
    ...t,
    rr: recordedR(t.achieved_rr),
    category: ((t.categories ?? []).find((c) => c?.trim()) ?? "").trim(),
    directionLabel: t.direction === "short" ? "Short" : "Long",
  };
}

function scopeStatusLabel(reviewedCount: number) {
  if (reviewedCount >= REQUIRED_REVIEWED) return "Scanning";
  if (reviewedCount > 0) return "Building sample";
  return "Early";
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(0)}%`;
}

function rLabel(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

function deltaLabel(value: number | null, suffix: "R" | "%"): string | null {
  if (value == null) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(suffix === "R" ? 2 : 0)}${suffix}`;
}

const SECTION_META: Record<
  DiscoveryCategory,
  { icon: LucideIcon; title: string; subtitle: string }
> = {
  setup: {
    icon: Layers,
    title: "Setup Conditions",
    subtitle: "Multi-factor setup context compared against its baseline.",
  },
  risk: {
    icon: AlertTriangle,
    title: "Risk Behavior",
    subtitle: "Risk sizing and RR-planning patterns that repeat.",
  },
  execution: {
    icon: ShieldCheck,
    title: "Execution Behavior",
    subtitle: "Re-entries, rule breaks, and overtrading patterns.",
  },
  journal: {
    icon: BookOpen,
    title: "Journal Patterns",
    subtitle: "Review-quality patterns visible in your journal.",
  },
};

const SECTION_ORDER: DiscoveryCategory[] = ["setup", "risk", "execution", "journal"];

function ScopePage() {
  const list = useServerFn(listTrades);
  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => list() });
  const trades = useMemo(() => (data ?? []) as DbTrade[], [data]);
  const reviewedDb = useMemo(
    () => trades.filter((t) => !isPaperTrade(t) && getReviewStatus(t) === "reviewed"),
    [trades],
  );
  const reviewedTrades = useMemo(() => reviewedDb.map(asReviewed), [reviewedDb]);
  const scan = useMemo(() => buildScopeDiscoveries(reviewedDb), [reviewedDb]);
  const [related, setRelated] = useState<ScopeDiscovery | null>(null);

  const relatedTrades = useMemo(() => {
    if (!related) return [];
    const ids = new Set(related.matchingTradeIds);
    return reviewedTrades.filter((trade) => ids.has(trade.id));
  }, [related, reviewedTrades]);

  const reviewedCount = scan.reviewedCount;
  const byCategory = useMemo(() => {
    const groups: Record<DiscoveryCategory, ScopeDiscovery[]> = {
      setup: [],
      risk: [],
      execution: [],
      journal: [],
    };
    for (const discovery of scan.discoveries) groups[discovery.category].push(discovery);
    return groups;
  }, [scan.discoveries]);

  return (
    <PageShell>
      <div className="w-full max-w-6xl">
        <PageHeader
          icon={Sparkles}
          eyebrow="Pattern discovery"
          title="Scope"
          description="Review clues from repeated conditions in your reviewed trades — always compared against your own baseline. No signals, no predictions."
        />

        <div className="min-w-0">
          {reviewedCount < REQUIRED_REVIEWED ? (
            <LowDataScope reviewedCount={reviewedCount} />
          ) : (
            <>
              <DiscoverySummary
                reviewedCount={reviewedCount}
                baselineWinRate={scan.baselineWinRate}
                baselineAvgR={scan.baselineAvgR}
                discoveryCount={scan.discoveries.length}
              />

              {scan.discoveries.length === 0 ? (
                <NoReliableDiscovery reviewedCount={reviewedCount} />
              ) : (
                <div className="mt-8 space-y-8">
                  {SECTION_ORDER.map((category) => (
                    <DiscoverySection
                      key={category}
                      category={category}
                      discoveries={byCategory[category]}
                      onRelated={setRelated}
                    />
                  ))}
                </div>
              )}
              <AboutScopeCompact />
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {related && (
          <RelatedTradesModal
            discovery={related}
            trades={relatedTrades}
            onClose={() => setRelated(null)}
          />
        )}
      </AnimatePresence>
    </PageShell>
  );
}

const scopePreviewCards = [
  {
    icon: Layers,
    title: "Setup Conditions",
    body: "Session, setup, instrument, direction, and planned RR combinations vs your baseline.",
  },
  {
    icon: AlertTriangle,
    title: "Risk Behavior",
    body: "RR planning, oversized risk, and losses that run past planned risk.",
  },
  {
    icon: ShieldCheck,
    title: "Execution Behavior",
    body: "Rule breaks, fast re-entries after losses, and overtrading days.",
  },
  {
    icon: BookOpen,
    title: "Journal Patterns",
    body: "Review-quality patterns, like brief reasoning or missing planned RR.",
  },
];

function DiscoverySummary({
  reviewedCount,
  baselineWinRate,
  baselineAvgR,
  discoveryCount,
}: {
  reviewedCount: number;
  baselineWinRate: number | null;
  baselineAvgR: number | null;
  discoveryCount: number;
}) {
  const baseline =
    baselineWinRate == null && baselineAvgR == null
      ? "—"
      : `${pct(baselineWinRate)} · ${rLabel(baselineAvgR)}`;
  return (
    <div className="surface-card mt-6 rounded-2xl px-4 py-3">
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Status" value={scopeStatusLabel(reviewedCount)} />
        <SummaryMetric label="Reviewed trades" value={`${reviewedCount}`} />
        <SummaryMetric label="Your baseline" value={baseline} />
        <SummaryMetric label="Discoveries" value={`${discoveryCount}`} />
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.045] px-3 py-2 ring-1 ring-white/[0.065]">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function NoReliableDiscovery({ reviewedCount }: { reviewedCount: number }) {
  return (
    <div className="glow-card mt-6 rounded-2xl p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
          <Lightbulb className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold">No reliable discovery yet</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Scope scanned your {reviewedCount} reviewed trades, but no repeated pattern is strong
            enough to show yet. That is working as intended — a discovery only appears when the same
            condition repeats with enough matching trades and a clear difference from your baseline.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Keep reviewing trades consistently. A quiet Scope is more trustworthy than a forced
            insight.
          </p>
        </div>
      </div>
    </div>
  );
}

function AboutScopeCompact() {
  return (
    <section className="surface-card mt-8 rounded-2xl p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold">About Scope</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Analytics shows what happened. Scope looks for repeated conditions behind it — as
              review clues, never as trading signals.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scopePreviewCards.map(({ icon: Icon, title }) => (
            <div
              key={title}
              className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.065]"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" />
              <span>{title}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LowDataScope({ reviewedCount }: { reviewedCount: number }) {
  const progress = Math.min(100, (reviewedCount / REQUIRED_REVIEWED) * 100);
  return (
    <div className="mt-5 space-y-5">
      <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.07]">
        <Check className="h-3.5 w-3.5 text-success/75" />
        No signals. No predictions. Only your journal data.
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="glow-card rounded-2xl p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                <Gauge className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold">Scope readiness</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {reviewedCount} / {REQUIRED_REVIEWED} complete reviews
                </p>
              </div>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary ring-1 ring-primary/20">
              {scopeStatusLabel(reviewedCount)}
            </span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
            {[
              { label: "Minimum", value: "10 complete reviews" },
              { label: "Recommended", value: "30+ complete reviews" },
              { label: "Source", value: "Reviewed trades only" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-white/[0.025] px-3.5 py-3 ring-1 ring-white/[0.045]"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1.5 font-semibold leading-5 text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Reaching 10 reviews unlocks scanning — it does not guarantee a discovery. Scope only
            surfaces patterns that repeat with clear evidence.
          </p>
        </motion.div>
        <section className="surface-card rounded-2xl p-5">
          <h2 className="text-sm font-bold">Pattern inputs</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Complete reviews help Scope inspect patterns with better context.
          </p>
          <div className="mt-4 space-y-2 text-xs">
            {[
              "Reasoning",
              "Mistakes / rule breaks",
              "Session / setup / instrument context",
              "Planned vs achieved R",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2 ring-1 ring-white/[0.065]"
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-primary/75" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <h2 className="text-lg font-bold tracking-tight">What Scope looks for</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {scopePreviewCards.map(({ icon: Icon, title, body }) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="surface-card flex h-full min-w-0 flex-col rounded-2xl p-4 text-left"
            >
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="select-none text-sm font-bold">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Lightbulb className="h-4 w-4 text-primary" /> Discoveries
        </h2>
        <div className="surface-card mt-3 rounded-2xl p-5">
          <h3 className="text-sm font-semibold">Not enough reviewed trades yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Scope starts after 10 complete reviews and only shows repeated clues against your own
            baseline.
          </p>
        </div>
      </section>
    </div>
  );
}

function DiscoverySection({
  category,
  discoveries,
  onRelated,
}: {
  category: DiscoveryCategory;
  discoveries: ScopeDiscovery[];
  onRelated: (discovery: ScopeDiscovery) => void;
}) {
  if (discoveries.length === 0) return null;
  const { icon: Icon, title, subtitle } = SECTION_META[category];
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Icon className="h-4 w-4 text-primary" /> {title}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {discoveries.map((discovery) => (
          <DiscoveryCard
            key={discovery.id}
            discovery={discovery}
            onRelated={() => onRelated(discovery)}
          />
        ))}
      </div>
    </section>
  );
}

function DiscoveryCard({
  discovery,
  onRelated,
}: {
  discovery: ScopeDiscovery;
  onRelated: () => void;
}) {
  const deltaWin = deltaLabel(discovery.deltaWinRate, "%");
  const deltaR = deltaLabel(discovery.deltaAvgR, "R");
  const differenceParts = [deltaR, deltaWin ? `${deltaWin} win rate` : null].filter(Boolean);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="glow-card flex flex-col rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {discovery.conditionChips.map((chip) => (
              <span
                key={`${chip.key}:${chip.label}`}
                className="es-pill px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
              >
                {chip.label}
              </span>
            ))}
          </div>
          <h3 className="mt-2.5 text-base font-bold leading-snug">{discovery.title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{discovery.description}</p>
          {discovery.dateRange && (
            <div className="mt-2 text-[11px] text-muted-foreground/60">
              Evidence timeframe: {discovery.dateRange}
            </div>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1",
            discovery.confidence === "good" && "bg-primary/15 text-primary ring-primary/25",
            discovery.confidence === "medium" && "bg-info/15 text-info ring-info/25",
            discovery.confidence === "low" &&
              "bg-white/[0.05] text-muted-foreground ring-white/[0.1]",
            discovery.confidence === "early" && "bg-warning/10 text-warning ring-warning/25",
          )}
        >
          {CONFIDENCE_LABEL[discovery.confidence]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Matching" value={`${discovery.matchingTradeCount}`} />
        <Metric label="Win rate" value={pct(discovery.winRate)} />
        <Metric
          label="Avg R"
          value={rLabel(discovery.avgR)}
          accent={discovery.direction === "negative" ? "risk" : "good"}
        />
      </div>

      <div className="mt-3 rounded-xl bg-white/[0.025] px-3.5 py-2.5 ring-1 ring-white/[0.04]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Baseline — {discovery.baseline.label}
        </div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">
          {discovery.baseline.sampleSize} trades · {pct(discovery.baseline.winRate)} win rate ·{" "}
          {rLabel(discovery.baseline.avgR)} avg
          {differenceParts.length > 0 && (
            <span className="text-foreground/80"> — difference: {differenceParts.join(" · ")}</span>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <span className="text-[11px] leading-4 text-muted-foreground/80">{discovery.caution}</span>
        {discovery.matchingTradeIds.length > 0 && (
          <button
            type="button"
            onClick={onRelated}
            className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition duration-200 hover:bg-white/[0.06] hover:text-foreground hover:ring-white/[0.1]"
          >
            Review matching trades <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "good" | "risk";
}) {
  return (
    <div className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.04]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-sm font-bold tabular-nums",
          accent === "good" && "text-primary",
          accent === "risk" && "text-warning",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function RelatedTradesModal({
  discovery,
  trades,
  onClose,
}: {
  discovery: ScopeDiscovery;
  trades: ReviewedTrade[];
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 6 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="glow-card w-full max-w-3xl rounded-2xl p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              Matching trades
            </div>
            <h2 className="mt-1 text-lg font-bold">{discovery.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Private evidence from your journal only. {discovery.caution}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close matching trades"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl ring-1 ring-white/[0.06]">
          <div className="grid grid-cols-[128px_minmax(100px,1fr)_86px_82px_80px_minmax(120px,1fr)_110px] border-b border-white/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <div>Date</div>
            <div>Instrument</div>
            <div>Direction</div>
            <div>Result</div>
            <div>R</div>
            <div>Setup</div>
            <div>Review</div>
          </div>
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="grid grid-cols-[128px_minmax(100px,1fr)_86px_82px_80px_minmax(120px,1fr)_110px] items-center border-b border-white/[0.04] px-3 py-3 text-xs last:border-b-0"
            >
              <div className="text-muted-foreground">
                {formatTradeWhen(trade.trade_date, trade.trade_time)}
              </div>
              <div className="truncate font-semibold">{trade.instrument || "—"}</div>
              <div className="font-semibold">{trade.directionLabel}</div>
              <div
                className={cn(
                  "font-semibold uppercase",
                  trade.result === "win" && "text-success",
                  trade.result === "loss" && "text-destructive",
                  trade.result === "breakeven" && "text-info",
                )}
              >
                {trade.result ?? "—"}
              </div>
              <div className="font-semibold tabular-nums">
                {trade.rr == null ? "—" : rLabel(trade.rr)}
              </div>
              <div className="truncate text-muted-foreground">{trade.category || "—"}</div>
              <div>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                  Reviewed
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Search, Plus, X, FolderPlus, LineChart, Trash2 } from "lucide-react";
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listTrades, deleteTrade, updateTrade } from "@/lib/trades.functions";
import { listTradingAccounts } from "@/lib/trading-accounts.functions";
import { rrNum, type DbTrade } from "@/lib/trade-mappers";
import {
  getReviewStatus,
  REVIEW_STATUS_BADGE,
  REVIEW_STATUS_LABEL,
  type ReviewStatus,
} from "@/lib/review-status";
import { TradeFormModal } from "@/components/trades/trade-form-modal";
import { GRADES, type Grade, type Taxonomy } from "@/lib/trade-constants";
import { TradeReviewModal } from "@/components/trades/trade-review-modal";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";

export const Route = createFileRoute("/_authenticated/trades")({
  head: () => ({
    meta: [
      { title: "My Trades - EdgeScope" },
      { name: "description", content: "Browse, filter and review every logged trade." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TradesPage,
});

type Row = {
  id: string;
  num: number;
  sym: string;
  date: string;
  rawDate: string;
  side: "LONG" | "SHORT";
  res: "WIN" | "LOSS" | "BE";
  rr: number;
  hasRR: boolean;
  plannedRR: string;
  category: string;
  subcategory: string;
  session: string;
  reasoning: string;
  notes: string;
  grade: Grade;
  emotionBefore: string;
  emotionDuring: string;
  emotionAfter: string;
  status: ReviewStatus;
  accountId: string | null;
};

function formatTradeDateOnly(date: string): string {
  try {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

function dbToRow(t: DbTrade, num: number): Row {
  const res =
    t.result === "win"
      ? "WIN"
      : t.result === "loss"
        ? "LOSS"
        : t.result === "breakeven"
          ? "BE"
          : "BE";
  const plannedRaw = t.planned_rr != null ? String(t.planned_rr).trim() : "";
  const achievedNum = t.achieved_rr == null || t.achieved_rr === "" ? null : Number(t.achieved_rr);
  return {
    id: t.id,
    num,
    sym: (t.instrument ?? "").trim(),
    date: formatTradeDateOnly(t.trade_date),
    rawDate: t.trade_date,
    side: t.direction === "short" ? "SHORT" : "LONG",
    res,
    rr: rrNum(t.achieved_rr),
    hasRR: achievedNum !== null && Number.isFinite(achievedNum),
    plannedRR: plannedRaw,
    category: ((t.categories ?? []).find((c) => c && c.trim()) ?? "").trim(),
    subcategory: ((t.subcategories ?? []).find((s) => s && s.trim()) ?? "").trim(),
    session: t.session ?? "",
    reasoning: t.reasoning ?? "",
    notes: t.lessons_learned ?? "",
    grade: (GRADES as readonly string[]).includes(t.grade ?? "") ? (t.grade as Grade) : "B",
    emotionBefore: t.emotion_before ?? "",
    emotionDuring: t.emotion_during ?? "",
    emotionAfter: t.emotion_after ?? "",
    status: getReviewStatus(t),
    accountId: t.account_id ?? null,
  };
}

function TradesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const list = useServerFn(listTrades);
  const listAccounts = useServerFn(listTradingAccounts);
  const del = useServerFn(deleteTrade);
  const update = useServerFn(updateTrade);

  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => list() });
  const { data: accounts = [] } = useSuspenseQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => listAccounts(),
  });
  const accountFilter = useMemo(() => {
    const account = new URLSearchParams(location.searchStr).get("account");
    return account || "ALL";
  }, [location.searchStr]);
  const setAccountFilter = (next: string) => {
    navigate({
      to: "/trades",
      search: (current) => ({
        ...current,
        account: next === "ALL" ? undefined : next,
      }),
      replace: true,
    });
  };
  const allDbRows = useMemo(() => (data ?? []) as DbTrade[], [data]);
  const dbRows = useMemo(
    () =>
      allDbRows.filter((t) => {
        const isOpen = (t as DbTrade & { status?: string }).status === "open";
        if (isOpen) return false; // hide live open positions; they live on /paper
        return true;
      }),
    [allDbRows],
  );
  const rows = useMemo<Row[]>(() => {
    const total = dbRows.length;
    return dbRows.map((t, i) => dbToRow(t, total - i));
  }, [dbRows]);

  const [extraTaxonomy, setExtraTaxonomy] = useState<Taxonomy>({});
  const derivedTaxonomy = useMemo<Taxonomy>(() => {
    const t: Taxonomy = {};
    for (const r of dbRows) {
      for (const c of r.categories ?? []) {
        if (!t[c]) t[c] = [];
        for (const s of r.subcategories ?? []) if (s && !t[c].includes(s)) t[c].push(s);
      }
    }
    return t;
  }, [dbRows]);
  const taxonomy = useMemo<Taxonomy>(() => {
    const merged: Taxonomy = { ...derivedTaxonomy };
    for (const [k, v] of Object.entries(extraTaxonomy)) {
      merged[k] = Array.from(new Set([...(merged[k] ?? []), ...v]));
    }
    return merged;
  }, [derivedTaxonomy, extraTaxonomy]);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"ALL" | "WIN" | "LOSS" | "BE">("ALL");
  const [newOpen, setNewOpen] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | "ALL">("ALL");
  const [detail, setDetail] = useState<Pick<Row, "id" | "num"> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Pick<Row, "id" | "num"> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const editingDb = useMemo(
    () => (editingId ? (dbRows.find((t) => t.id === editingId) ?? null) : null),
    [editingId, dbRows],
  );

  const categories = useMemo(() => Object.keys(taxonomy), [taxonomy]);
  // Filter pills are only useful for categories represented by current trades.
  const categoryPills = useMemo(
    () =>
      categories
        .map((name) => ({ name, count: rows.filter((r) => r.category === name).length }))
        .filter(({ name, count }) => name.trim().length > 1 && count > 0),
    [categories, rows],
  );
  useEffect(() => {
    if (activeCategory !== "ALL" && !rows.some((r) => r.category === activeCategory)) {
      setActiveCategory("ALL");
    }
  }, [activeCategory, rows]);
  const categoryUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const trade of dbRows) {
      for (const category of trade.categories ?? []) {
        const key = category.trim();
        if (!key) continue;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [dbRows]);

  const accountRows = useMemo(
    () => (accountFilter === "ALL" ? rows : rows.filter((r) => r.accountId === accountFilter)),
    [accountFilter, rows],
  );
  const accountHasAnyTrades = useMemo(
    () =>
      accountFilter !== "ALL" &&
      allDbRows.some((trade) => {
        const isOpen = (trade as DbTrade & { status?: string }).status === "open";
        return !isOpen && trade.account_id === accountFilter;
      }),
    [accountFilter, allDbRows],
  );
  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return accountRows.filter(
      (r) =>
        (filter === "ALL" || r.res === filter) &&
        (activeCategory === "ALL" || r.category === activeCategory) &&
        (query === "" ||
          r.sym.toLowerCase().includes(query) ||
          r.date.toLowerCase().includes(query) ||
          r.rawDate.toLowerCase().includes(query) ||
          r.subcategory.toLowerCase().includes(query) ||
          r.category.toLowerCase().includes(query)),
    );
  }, [q, filter, activeCategory, accountRows]);
  const visibleRows = visible.slice(0, visibleCount);
  const hasMoreRows = visible.length > visibleRows.length;
  // Header and body rows share this exact template — one column definition,
  // date/number/RR columns stay compact, instrument takes the flexible space.
  const tradeGridClass =
    "grid min-w-[920px] grid-cols-[minmax(160px,1.1fr)_minmax(96px,0.8fr)_minmax(210px,1.4fr)_minmax(132px,1fr)_minmax(132px,1fr)_minmax(150px,1.1fr)] items-center";

  useEffect(() => {
    setVisibleCount(10);
  }, [q, filter, activeCategory, accountFilter]);

  const removeM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["account-stats"] });
      setDetail(null);
      toast.success("Trade deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCategoryM = useMutation({
    mutationFn: async (category: string) => {
      const affected = dbRows.filter((trade) => (trade.categories ?? []).includes(category));
      await Promise.all(
        affected.map((trade) =>
          update({
            data: {
              id: trade.id,
              patch: {
                categories: (trade.categories ?? []).filter((item) => item !== category),
              },
            },
          }),
        ),
      );
      return { category, count: affected.length };
    },
    onSuccess: ({ category, count }) => {
      setExtraTaxonomy((current) => {
        if (!(category in current)) return current;
        const next = { ...current };
        delete next[category];
        return next;
      });
      if (activeCategory === category) setActiveCategory("ALL");
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["trade"] });
      qc.invalidateQueries({ queryKey: ["account-stats"] });
      toast.success(
        count > 0
          ? `Category removed from ${count} trade${count === 1 ? "" : "s"}`
          : "Category removed",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell>
      <PageHeader
        icon={LineChart}
        eyebrow="Journal"
        title="My Trades"
        description="Browse, filter, and review your trading journal."
        actions={
          <>
            <button
              onClick={() => setCatManagerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground hover:ring-white/[0.1]"
            >
              <FolderPlus className="h-4 w-4" /> Manage categories
            </button>
            <button
              onClick={() => setNewOpen(true)}
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:shadow-[var(--shadow-glow-lg)] hover:brightness-110"
            >
              <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />{" "}
              New trade
            </button>
          </>
        }
      />

      {/* Category pills — only categories that actually match trades are useful as filters */}
      {categoryPills.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {categoryPills.map(({ name, count }) => (
            <button
              key={name}
              onClick={() => setActiveCategory(activeCategory === name ? "ALL" : name)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ring-1 ring-white/[0.06]",
                activeCategory === name
                  ? "bg-primary/10 text-primary ring-primary/20"
                  : "bg-white/[0.03] text-muted-foreground hover:text-foreground hover:ring-white/[0.1]",
              )}
            >
              {name}
              <span className="ml-1.5 text-[10px] text-muted-foreground/60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="glow-card mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-3 lg:flex-nowrap">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search date, setup, or instrument"
            aria-label="Search trades"
            className="w-full rounded-xl bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <ShadcnSelect value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger
            aria-label="Filter by account"
            className="min-w-[140px] max-w-[200px] rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground focus:ring-2 focus:ring-primary/40 h-auto"
          >
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All accounts</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadcnSelect>
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          {(["ALL", "WIN", "LOSS", "BE"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wider transition-all duration-200",
                filter === f
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Trades journal list */}
      <div className="glow-card mt-4 overflow-hidden rounded-2xl">
        {visible.length === 0 && accountFilter !== "ALL" && !accountHasAnyTrades ? (
          <div className="m-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.02] px-5 py-12 text-center ring-1 ring-white/[0.04]">
            <p className="text-sm font-medium text-foreground">No trades for this account yet.</p>
          </div>
        ) : visible.length === 0 && rows.length === 0 ? (
          <PremiumEmptyState
            icon={LineChart}
            title="No trades logged yet"
            description="Log your first trade, then complete the review when you are ready."
            className="m-4 py-16"
            action={
              <button
                onClick={() => setNewOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110"
              >
                <Plus className="h-4 w-4" /> Log first trade
              </button>
            }
          />
        ) : visible.length === 0 ? (
          <div className="m-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.02] px-5 py-12 text-center ring-1 ring-white/[0.04]">
            <p className="text-sm font-medium text-foreground">No trades match your filters.</p>
            <button
              onClick={() => {
                setQ("");
                setFilter("ALL");
                setActiveCategory("ALL");
                setAccountFilter("ALL");
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div role="table" className="w-full text-left">
                <div
                  role="row"
                  className={cn(
                    tradeGridClass,
                    "border-b border-white/[0.06] bg-white/[0.012] text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                  )}
                >
                  <div role="columnheader" className="px-4 py-3">
                    Date
                  </div>
                  <div role="columnheader" className="px-3 py-3 text-center">
                    Trade #
                  </div>
                  <div role="columnheader" className="px-4 py-3">
                    Instrument
                  </div>
                  <div role="columnheader" className="px-3 py-3 text-center">
                    Planned R:R
                  </div>
                  <div role="columnheader" className="px-3 py-3 text-center">
                    Achieved R
                  </div>
                  <div role="columnheader" className="px-3 py-3 text-center">
                    Review
                  </div>
                </div>
                <div role="rowgroup" className="divide-y divide-white/[0.04]">
                  {visibleRows.map((r, i) => {
                    const positive = r.hasRR && r.rr > 0;
                    const negative = r.hasRR && r.rr < 0;
                    const breakeven = r.hasRR && r.rr === 0;
                    return (
                      <motion.button
                        key={r.id}
                        type="button"
                        role="row"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.015 * i, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() => setDetail(r)}
                        className={cn(
                          tradeGridClass,
                          "w-full cursor-pointer bg-transparent text-left outline-none ring-1 ring-transparent transition-all duration-200 hover:bg-white/[0.025] hover:ring-white/[0.06] focus-visible:bg-white/[0.035] focus-visible:ring-primary/25",
                        )}
                      >
                        <div
                          role="cell"
                          className="px-4 py-4 text-xs leading-5 text-muted-foreground tabular-nums"
                        >
                          {r.date || "—"}
                        </div>
                        <div
                          role="cell"
                          className="px-3 py-4 text-center text-xs font-mono text-muted-foreground tabular-nums"
                        >
                          #{r.num}
                        </div>
                        <div role="cell" className="px-4 py-4">
                          <span className="block truncate text-sm font-bold text-foreground">
                            {r.sym || "—"}
                          </span>
                        </div>
                        <div
                          role="cell"
                          className="px-3 py-4 text-center text-sm font-semibold tabular-nums text-foreground"
                        >
                          {r.plannedRR || "—"}
                        </div>
                        <div
                          role="cell"
                          className={cn(
                            "px-3 py-4 text-center text-sm font-bold tabular-nums",
                            positive && "text-success",
                            negative && "text-destructive",
                            (!r.hasRR || breakeven) && "text-muted-foreground",
                          )}
                        >
                          {r.hasRR ? `${positive ? "+" : ""}${r.rr.toFixed(2)}R` : "—"}
                        </div>
                        <div role="cell" className="px-3 py-4 text-center">
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1",
                              REVIEW_STATUS_BADGE[r.status],
                            )}
                          >
                            {REVIEW_STATUS_LABEL[r.status]}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
            {hasMoreRows && (
              <div className="border-t border-white/[0.04] px-4 py-4 text-center">
                <button
                  onClick={() => setVisibleCount((count) => count + 10)}
                  className="rounded-xl bg-white/[0.04] px-4 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground hover:ring-white/[0.1]"
                >
                  Show more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {newOpen && (
          <TradeFormModal
            key="new-trade"
            taxonomy={taxonomy}
            nextNum={rows.length + 1}
            onClose={() => setNewOpen(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["trades"] });
            }}
            onReviewNow={(savedId) => {
              setDetail({ id: savedId, num: rows.length + 1 });
            }}
          />
        )}
        {catManagerOpen && (
          <CategoryManager
            key="cat-manager"
            taxonomy={taxonomy}
            onClose={() => setCatManagerOpen(false)}
            onChange={setExtraTaxonomy}
            base={extraTaxonomy}
            usage={categoryUsage}
            onRemoveCategory={(category) => removeCategoryM.mutate(category)}
            removing={removeM.isPending}
          />
        )}
        {detail && (
          <TradeReviewModal
            key={detail.id}
            tradeId={detail.id}
            number={detail.num}
            onClose={() => setDetail(null)}
            onDelete={() => setConfirmDelete(detail)}
            isDeleting={removeM.isPending}
            escapePaused={editingId !== null || confirmDelete !== null}
            onEdit={() => setEditingId(detail.id)}
          />
        )}
        {/* Rendered after the review modal so quick-capture edits stack above it;
            the review stays mounted underneath and regains focus on close. */}
        {editingDb && (
          <TradeFormModal
            key={`edit-${editingDb.id}`}
            taxonomy={taxonomy}
            nextNum={dbRows.length - dbRows.findIndex((t) => t.id === editingDb.id)}
            editing={editingDb}
            onClose={() => setEditingId(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["trades"] });
              qc.invalidateQueries({ queryKey: ["trade", editingDb.id] });
            }}
          />
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={confirmDelete ? `Delete trade #${confirmDelete.num}?` : "Delete trade?"}
        description="This trade and its screenshots will be permanently removed. This action cannot be undone."
        confirmLabel="Delete trade"
        destructive
        loading={removeM.isPending}
        onConfirm={() => {
          if (confirmDelete) {
            removeM.mutate(confirmDelete.id);
            setConfirmDelete(null);
          }
        }}
      />
    </PageShell>
  );
}

function CategoryManager({
  taxonomy,
  base,
  usage,
  onClose,
  onChange,
  onRemoveCategory,
  removing,
}: {
  taxonomy: Taxonomy;
  base: Taxonomy;
  usage: Record<string, number>;
  onClose: () => void;
  onChange: (t: Taxonomy) => void;
  onRemoveCategory: (category: string) => void;
  removing: boolean;
}) {
  const [newCat, setNewCat] = useState("");
  const [confirmCategory, setConfirmCategory] = useState<string | null>(null);

  const addCategory = () => {
    const n = newCat.trim();
    if (!n || taxonomy[n]) return;
    onChange({ ...base, [n]: base[n] ?? [] });
    setNewCat("");
  };
  const removeCategory = (category: string) => {
    if ((usage[category] ?? 0) > 0) {
      onRemoveCategory(category);
    } else if (category in base) {
      const next = { ...base };
      delete next[category];
      onChange(next);
    }
    setConfirmCategory(null);
  };

  const inputClass =
    "flex-1 rounded-lg bg-white/[0.04] px-2.5 py-2 text-xs ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 6 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="glow-card w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Manage categories</h2>
          <button
            onClick={onClose}
            aria-label="Close category manager"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex gap-2">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            placeholder="New category name"
            className={inputClass}
          />
          <button
            onClick={addCategory}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110"
          >
            Add
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {Object.keys(taxonomy).length === 0 && (
            <div className="rounded-xl bg-white/[0.03] p-4 text-center text-sm text-muted-foreground ring-1 ring-white/[0.04]">
              No categories yet. Create your first one above.
            </div>
          )}
          {Object.keys(taxonomy).map((c) => {
            const usedBy = usage[c] ?? 0;
            return (
              <div key={c} className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c}</div>
                    {usedBy > 0 && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Used by {usedBy} trade{usedBy === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmCategory(c)}
                    disabled={removing}
                    title="Remove category"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-muted-foreground ring-1 ring-white/[0.06] transition hover:bg-destructive/[0.055] hover:text-destructive/80 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/[0.04] disabled:hover:text-muted-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <ConfirmDialog
          open={confirmCategory !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmCategory(null);
          }}
          title="Remove category?"
          description={
            confirmCategory && (usage[confirmCategory] ?? 0) > 0
              ? "This removes the category from your category list and clears it from trades that used it. Your trades and reviews will not be deleted."
              : "This removes the category from your category list. Your trades and reviews will not be deleted."
          }
          confirmLabel="Remove category"
          destructive
          loading={removing}
          onConfirm={() => {
            if (confirmCategory) removeCategory(confirmCategory);
          }}
        />
      </motion.div>
    </motion.div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Search, Plus, X, FolderPlus, LineChart, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listTrades, deleteTrade } from "@/lib/trades.functions";
import { rrNum, formatTradeWhen, type DbTrade } from "@/lib/trade-mappers";
import {
  TradeFormModal,
  GRADES,
  type Grade,
  type Taxonomy,
} from "@/components/trades/trade-form-modal";
import { TradeReviewModal } from "@/components/trades/trade-review-modal";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";

export const Route = createFileRoute("/_authenticated/trades")({
  head: () => ({
    meta: [
      { title: "My Trades — EdgeScope" },
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
  reviewed: boolean;
};

const TRADE_JOURNAL_GRID = "grid-cols-[128px_72px_minmax(170px,1fr)_104px_104px_148px]";

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
    date: formatTradeWhen(t.trade_date, t.trade_time),
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
    reviewed: hasMeaningfulReview(t),
  };
}

function hasText(value: string | null | undefined): boolean {
  return !!value?.trim();
}

function hasItems(value: string[] | null | undefined): boolean {
  return Array.isArray(value) && value.some((item) => item.trim().length > 0);
}

function hasMeaningfulReview(t: DbTrade): boolean {
  return (
    hasText(t.reasoning) ||
    hasText(t.lessons_learned) ||
    hasText(t.notes) ||
    hasText(t.grade) ||
    hasText(t.killzone) ||
    hasText(t.emotion_before) ||
    hasText(t.emotion_during) ||
    hasText(t.emotion_after) ||
    hasItems(t.categories) ||
    hasItems(t.subcategories) ||
    hasItems(t.mistake_tags) ||
    hasItems(t.emotion_tags) ||
    t.in_killzone === true ||
    (t.trade_screenshots?.length ?? 0) > 0
  );
}

function TradesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTrades);
  const del = useServerFn(deleteTrade);

  const [paperFilter, setPaperFilter] = useState<"ALL" | "LIVE" | "PAPER">("ALL");
  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => list() });
  const allDbRows = useMemo(() => (data ?? []) as DbTrade[], [data]);
  const dbRows = useMemo(
    () =>
      allDbRows.filter((t) => {
        const isPaper = (t as DbTrade & { is_paper?: boolean; status?: string }).is_paper === true;
        const isOpen = (t as DbTrade & { status?: string }).status === "open";
        if (isOpen) return false; // hide live open positions; they live on /paper
        if (paperFilter === "PAPER") return isPaper;
        if (paperFilter === "LIVE") return !isPaper;
        return true;
      }),
    [allDbRows, paperFilter],
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

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === "ALL" || r.res === filter) &&
          (activeCategory === "ALL" || r.category === activeCategory) &&
          (q === "" ||
            r.sym.toLowerCase().includes(q.toLowerCase()) ||
            r.subcategory.toLowerCase().includes(q.toLowerCase()) ||
            r.category.toLowerCase().includes(q.toLowerCase())),
      ),
    [q, filter, activeCategory, rows],
  );
  const visibleRows = visible.slice(0, visibleCount);
  const hasMoreRows = visible.length > visibleRows.length;

  useEffect(() => {
    setVisibleCount(10);
  }, [q, filter, activeCategory, paperFilter]);

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

  return (
    <PageShell>
      <PageHeader
        icon={LineChart}
        eyebrow="Journal"
        title="My Trades"
        description="Browse, filter, and review your logged trades without losing table clarity."
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

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(activeCategory === c ? "ALL" : c)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ring-1 ring-white/[0.06]",
                activeCategory === c
                  ? "bg-primary/10 text-primary ring-primary/20"
                  : "bg-white/[0.03] text-muted-foreground hover:text-foreground hover:ring-white/[0.1]",
              )}
            >
              {c}
              <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                {rows.filter((r) => r.category === c).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="glow-card mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search instrument, category…"
            aria-label="Search trades"
            className="w-full rounded-xl bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
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
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          {(["ALL", "LIVE", "PAPER"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setPaperFilter(f)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wider transition-all duration-200",
                paperFilter === f
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
        <div className="overflow-x-auto">
          <div className="w-full min-w-[760px]">
            <div
              className={cn(
                "grid items-center border-b border-white/[0.06] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                TRADE_JOURNAL_GRID,
              )}
            >
              <div className="min-w-0">DATE</div>
              <div className="min-w-0 text-center">TRADE #</div>
              <div className="min-w-0 pl-2">INSTRUMENT</div>
              <div className="min-w-0 text-center">PLANNED RR</div>
              <div className="min-w-0 text-center">ACHIEVED R</div>
              <div className="min-w-0 text-right">REVIEW</div>
            </div>
            {visibleRows.map((r, i) => {
              const positive = r.hasRR && r.rr > 0;
              const negative = r.hasRR && r.rr < 0;
              const breakeven = r.hasRR && r.rr === 0;
              return (
                <motion.button
                  key={r.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.02 * i, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => setDetail(r)}
                  className={cn(
                    "grid w-full items-center border-b border-white/[0.04] px-4 py-3 text-left transition-colors duration-200 hover:bg-white/[0.025] focus:outline-none focus-visible:bg-white/[0.035] last:border-b-0",
                    TRADE_JOURNAL_GRID,
                  )}
                >
                  <div className="min-w-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {r.date || "—"}
                  </div>
                  <div className="min-w-0 text-center text-xs font-mono text-muted-foreground tabular-nums">
                    #{r.num}
                  </div>
                  <div className="min-w-0 truncate pl-2 text-sm font-bold">{r.sym || "—"}</div>
                  <div className="min-w-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                    {r.plannedRR || "—"}
                  </div>
                  <div
                    className={cn(
                      "min-w-0 text-center text-sm font-bold tabular-nums whitespace-nowrap",
                      positive && "text-success",
                      negative && "text-destructive",
                      (!r.hasRR || breakeven) && "text-muted-foreground",
                    )}
                  >
                    {r.hasRR ? `${positive ? "+" : ""}${Math.abs(r.rr).toFixed(2)}R` : "—"}
                  </div>
                  <div className="flex min-w-0 justify-end">
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1",
                        r.reviewed
                          ? "bg-primary/12 text-primary ring-primary/25"
                          : "bg-warning/10 text-warning ring-warning/25",
                      )}
                    >
                      {r.reviewed ? "Reviewed" : "Review incomplete"}
                    </span>
                  </div>
                </motion.button>
              );
            })}

            {visible.length === 0 && rows.length === 0 && (
              <PremiumEmptyState
                icon={LineChart}
                title="No trades logged yet"
                description="Start with a quick capture. You can complete the deeper review afterward."
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
            )}
            {visible.length === 0 && rows.length > 0 && (
              <div className="m-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.02] px-5 py-12 text-center ring-1 ring-white/[0.04]">
                <p className="text-sm font-medium text-foreground">No trades match your filters.</p>
                <button
                  onClick={() => {
                    setQ("");
                    setFilter("ALL");
                    setActiveCategory("ALL");
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}
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
          </div>
        </div>
      </div>

      <AnimatePresence>
        {newOpen && (
          <TradeFormModal
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
        {editingDb && (
          <TradeFormModal
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
        {catManagerOpen && (
          <CategoryManager
            taxonomy={taxonomy}
            onClose={() => setCatManagerOpen(false)}
            onChange={setExtraTaxonomy}
            base={extraTaxonomy}
          />
        )}
        {detail && (
          <TradeReviewModal
            tradeId={detail.id}
            number={detail.num}
            onClose={() => setDetail(null)}
            onDelete={() => setConfirmDelete(detail)}
            isDeleting={removeM.isPending}
            onEdit={() => {
              setEditingId(detail.id);
              setDetail(null);
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
  onClose,
  onChange,
}: {
  taxonomy: Taxonomy;
  base: Taxonomy;
  onClose: () => void;
  onChange: (t: Taxonomy) => void;
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
    if (!(category in base)) return;
    const next = { ...base };
    delete next[category];
    onChange(next);
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
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
          {Object.keys(taxonomy).map((c) => (
            <div key={c} className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c}</div>
                  {!(c in base) && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      In use — edit trades to remove it
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmCategory(c)}
                  disabled={!(c in base)}
                  title={c in base ? "Remove category" : "Category is used by existing trades"}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-muted-foreground ring-1 ring-white/[0.06] transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/[0.04] disabled:hover:text-muted-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <ConfirmDialog
          open={confirmCategory !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmCategory(null);
          }}
          title="Delete category?"
          description="This will remove the category from your category list. Existing trades using this category may lose this tag."
          confirmLabel="Delete category"
          destructive
          onConfirm={() => {
            if (confirmCategory) removeCategory(confirmCategory);
          }}
        />
      </motion.div>
    </motion.div>
  );
}

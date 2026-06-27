import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import {
  Search, Plus, X, FolderPlus, LineChart,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listTrades, deleteTrade,
} from "@/lib/trades.functions";
import { rrNum, formatTradeWhen, type DbTrade } from "@/lib/trade-mappers";
import { TradeFormModal, GRADES, type Grade, type Taxonomy } from "@/components/trades/trade-form-modal";
import { TradeReviewModal } from "@/components/trades/trade-review-modal";


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
};

function dbToRow(t: DbTrade, num: number): Row {
  const res = t.result === "win" ? "WIN" : t.result === "loss" ? "LOSS" : t.result === "breakeven" ? "BE" : "BE";
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
    grade: ((GRADES as readonly string[]).includes(t.grade ?? "") ? (t.grade as Grade) : "B"),
    emotionBefore: t.emotion_before ?? "",
    emotionDuring: t.emotion_during ?? "",
    emotionAfter: t.emotion_after ?? "",
  };
}

function TradesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTrades);
  const del = useServerFn(deleteTrade);

  const [paperFilter, setPaperFilter] = useState<"ALL" | "LIVE" | "PAPER">("ALL");
  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => list() });
  const allDbRows = (data ?? []) as DbTrade[];
  const dbRows = useMemo(() => allDbRows.filter((t) => {
    const isPaper = (t as DbTrade & { is_paper?: boolean; status?: string }).is_paper === true;
    const isOpen = (t as DbTrade & { status?: string }).status === "open";
    if (isOpen) return false; // hide live open positions; they live on /paper
    if (paperFilter === "PAPER") return isPaper;
    if (paperFilter === "LIVE") return !isPaper;
    return true;
  }), [allDbRows, paperFilter]);
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
  const [detail, setDetail] = useState<Row | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const editingDb = useMemo(
    () => (editingId ? dbRows.find((t) => t.id === editingId) ?? null : null),
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

  const removeM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trades"] }); qc.invalidateQueries({ queryKey: ["account-stats"] }); setDetail(null); toast.success("Trade deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="text-3xl font-bold tracking-tight md:text-4xl">
            My Trades
          </motion.h1>
          
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatManagerOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground hover:ring-white/[0.1]">
            <FolderPlus className="h-4 w-4" /> Manage categories
          </button>
          <button onClick={() => setNewOpen(true)} className="group inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-300 hover:shadow-[var(--shadow-glow-lg)] hover:brightness-110">
            <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" /> New trade
          </button>
        </div>
      </div>

      {/* Category pills */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button onClick={() => setActiveCategory("ALL")} className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ring-1 ring-white/[0.06]", activeCategory === "ALL" ? "bg-primary/10 text-primary ring-primary/20" : "bg-white/[0.03] text-muted-foreground hover:text-foreground hover:ring-white/[0.1]")}>
          All categories
        </button>
        {categories.map((c) => (
          <button key={c} onClick={() => setActiveCategory(c)} className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ring-1 ring-white/[0.06]", activeCategory === c ? "bg-primary/10 text-primary ring-primary/20" : "bg-white/[0.03] text-muted-foreground hover:text-foreground hover:ring-white/[0.1]")}>
            {c}
            <span className="ml-1.5 text-[10px] text-muted-foreground/60">{rows.filter((r) => r.category === c).length}</span>
          </button>
        ))}
        <button onClick={() => setCatManagerOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.06] ring-dashed transition-all duration-200 hover:text-foreground hover:ring-white/[0.1]">
          <FolderPlus className="h-3.5 w-3.5" /> New category
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="glow-card mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search instrument, category…" aria-label="Search trades" className="w-full rounded-xl bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          {(["ALL", "WIN", "LOSS", "BE"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wider transition-all duration-200", filter === f ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground")}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          {(["ALL", "LIVE", "PAPER"] as const).map((f) => (
            <button key={f} onClick={() => setPaperFilter(f)} className={cn("rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wider transition-all duration-200", paperFilter === f ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground")}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Trades table */}
      <div className="glow-card mt-4 overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[170px_96px_minmax(180px,1fr)_132px_132px] items-center border-b border-white/[0.06] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div className="min-w-0">DATE</div>
              <div className="min-w-0 text-center">TRADE #</div>
              <div className="min-w-0 px-4">INSTRUMENT</div>
              <div className="min-w-0 px-4 text-right">PLANNED RR</div>
              <div className="min-w-0 text-right">ACHIEVED R</div>
            </div>
            {visible.map((r, i) => {
              const positive = r.hasRR && r.rr > 0;
              const negative = r.hasRR && r.rr < 0;
              const breakeven = r.hasRR && r.rr === 0;
              return (
                <motion.button key={r.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.02 * i, duration: 0.3, ease: [0.16, 1, 0.3, 1] }} onClick={() => setDetail(r)} className="grid w-full grid-cols-[170px_96px_minmax(180px,1fr)_132px_132px] items-center border-b border-white/[0.04] px-6 py-4 text-left transition-all duration-200 hover:row-glow focus:outline-none focus-visible:bg-white/[0.03] last:border-b-0">
                  <div className="min-w-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums">{r.date || "—"}</div>
                  <div className="min-w-0 text-center text-xs font-mono text-muted-foreground tabular-nums">#{r.num}</div>
                  <div className="min-w-0 truncate px-4 text-sm font-semibold">{r.sym || "—"}</div>
                  <div className="min-w-0 px-4 text-right text-xs font-semibold tabular-nums text-muted-foreground">{r.plannedRR || "—"}</div>
                  <div className={cn("min-w-0 text-right text-sm font-bold tabular-nums whitespace-nowrap", positive && "text-success", negative && "text-destructive", (!r.hasRR || breakeven) && "text-muted-foreground")}>
                    {r.hasRR ? `${positive ? "+" : ""}${Math.abs(r.rr).toFixed(2)}R` : "—"}
                  </div>
                </motion.button>
              );
            })}

            {visible.length === 0 && rows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-5 px-5 py-20 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                  <LineChart className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-base font-semibold">No trades logged yet</h3>
                <button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110">
                  <Plus className="h-4 w-4" /> Log First Trade
                </button>
              </div>
            )}
            {visible.length === 0 && rows.length > 0 && (
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
                <p className="text-sm text-muted-foreground">No trades match your filters.</p>
                <button onClick={() => { setQ(""); setFilter("ALL"); setActiveCategory("ALL"); }} className="text-xs font-medium text-primary hover:underline">Clear filters</button>
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
          />
        )}
        {editingDb && (
          <TradeFormModal
            taxonomy={taxonomy}
            nextNum={dbRows.length - dbRows.findIndex((t) => t.id === editingDb.id)}
            editing={editingDb}
            onClose={() => setEditingId(null)}
            onSaved={() => { qc.invalidateQueries({ queryKey: ["trades"] }); qc.invalidateQueries({ queryKey: ["trade", editingDb.id] }); }}
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
            onEdit={() => { setEditingId(detail.id); setDetail(null); }}
          />
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={confirmDelete ? `Delete trade #${confirmDelete.num}?` : "Delete trade?"}
        description="This trade and its screenshots will be permanently removed. This action cannot be undone."
        confirmLabel="Delete trade"
        destructive
        loading={removeM.isPending}
        onConfirm={() => { if (confirmDelete) { removeM.mutate(confirmDelete.id); setConfirmDelete(null); } }}
      />
    </div>
  );
}

function CategoryManager({
  taxonomy, base, onClose, onChange,
}: {
  taxonomy: Taxonomy; base: Taxonomy; onClose: () => void; onChange: (t: Taxonomy) => void;
}) {
  const [newCat, setNewCat] = useState("");
  const [newSub, setNewSub] = useState<Record<string, string>>({});

  const addCategory = () => {
    const n = newCat.trim();
    if (!n || taxonomy[n]) return;
    onChange({ ...base, [n]: base[n] ?? [] });
    setNewCat("");
  };
  const addSub = (cat: string) => {
    const n = (newSub[cat] ?? "").trim();
    if (!n) return;
    const subs = new Set(base[cat] ?? []);
    subs.add(n);
    onChange({ ...base, [cat]: Array.from(subs) });
    setNewSub({ ...newSub, [cat]: "" });
  };

  const inputClass = "flex-1 rounded-lg bg-white/[0.04] px-2.5 py-2 text-xs ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} onClick={(e: MouseEvent) => e.stopPropagation()} className="glow-card w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Manage categories</h2>
          <button onClick={onClose} aria-label="Close category manager" className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"><X className="h-4 w-4" /></button>

        </div>
        <p className="mt-2 text-xs text-muted-foreground">Categories shown here include those derived from your existing trades plus any new ones you add for use when logging.</p>

        <div className="mt-5 flex gap-2">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="New category name" className={inputClass} />
          <button onClick={addCategory} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110">Add</button>
        </div>

        <div className="mt-5 space-y-4">
          {Object.keys(taxonomy).length === 0 && (
            <div className="rounded-xl bg-white/[0.03] p-4 text-center text-sm text-muted-foreground ring-1 ring-white/[0.04]">No categories yet. Create your first one above.</div>
          )}
          {Object.keys(taxonomy).map((c) => (
            <div key={c} className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.04]">
              <div className="flex items-center gap-2">
                <div className="flex-1 text-sm font-semibold text-primary">{c}</div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {(taxonomy[c] ?? []).map((s) => (
                  <div key={s} className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] ring-1 ring-white/[0.06]">
                    <span className="text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex gap-2">
                <input value={newSub[c] ?? ""} onChange={(e) => setNewSub({ ...newSub, [c]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addSub(c)} placeholder="New sub-category" className={inputClass} />
                <button onClick={() => addSub(c)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground">Add</button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground/60">Tip: removing categories isn't supported here — the list mirrors what's used by your trades plus any you add. Edit a trade's categories to remove unused ones.</p>
      </motion.div>
    </motion.div>
  );
}

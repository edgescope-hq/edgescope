import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Plus, X, FolderPlus, LineChart, Trash2, Funnel } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AccountFilterSelect } from "@/components/account-filter-select";
import { useActiveAccount } from "@/components/active-account-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listTrades, deleteTrade } from "@/lib/trades.functions";
import { listTradingAccounts } from "@/lib/trading-accounts.functions";
import {
  archiveTradeCategory,
  createTradeCategory,
  listTradeCategories,
} from "@/lib/trade-categories.functions";
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
import { getTradingPreferences } from "@/lib/trading-preferences.functions";
import {
  journalTrackingFromPreferences,
  tradeCompletenessRequirementsFromPreferences,
  type TradeCompletenessRequirements,
} from "@/lib/journal-tracking";
import {
  formatTradeDateKey,
  matchesTradeSearch,
  tradeSearchSuggestions,
} from "@/lib/trade-search";
import { SearchInput } from "@/components/ui/search-input";

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

const ALL_REVIEW_STATUSES: ReviewStatus[] = ["incomplete", "needs_review", "reviewed"];

function OverflowInstrument({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setTruncated(node.scrollWidth > node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, truncated]);

  const text = (
    <span
      ref={ref}
      className={cn(
        "block truncate text-sm font-bold",
        value ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {value || "—"}
    </span>
  );
  if (!truncated || !value) return text;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          ref={ref}
          role="button"
          tabIndex={0}
          aria-label={`Show full instrument name: ${value}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              setOpen((current) => !current);
            }
          }}
          className="block truncate text-sm font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {value}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        onClick={(event) => event.stopPropagation()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-auto max-w-xs rounded-lg border-white/[0.08] bg-popover px-3 py-2 text-xs font-semibold break-words"
      >
        {value}
      </PopoverContent>
    </Popover>
  );
}

function formatTradeDateOnly(date: string): string {
  return formatTradeDateKey(date);
}

function dbToRow(
  t: DbTrade,
  num: number,
  rPerformanceEnabled: boolean,
  tradeCompletenessRequirements: TradeCompletenessRequirements,
): Row {
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
    status: getReviewStatus({
      ...t,
      r_performance_enabled: rPerformanceEnabled,
      trade_completeness_requirements: tradeCompletenessRequirements,
    }),
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
  const listCategories = useServerFn(listTradeCategories);
  const getPreferencesFn = useServerFn(getTradingPreferences);

  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => list() });
  const { data: accounts = [] } = useSuspenseQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => listAccounts(),
  });
  const { data: categoryData = [] } = useSuspenseQuery({
    queryKey: ["trade-categories"],
    queryFn: () => listCategories(),
  });
  const { data: preferences } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => getPreferencesFn(),
  });
  const rPerformanceEnabled =
    journalTrackingFromPreferences(preferences?.journal_tracking).r_performance !== "hidden";
  const tradeCompletenessRequirements = tradeCompletenessRequirementsFromPreferences(
    preferences?.journal_tracking,
  );
  const categoryRegistry = categoryData as {
    id: string;
    name: string;
    normalized_name: string;
    archived_at: string | null;
  }[];
  const { activeAccountId: accountFilter, setActiveAccountId } = useActiveAccount();
  const accountFromSearch = useMemo(() => {
    const account = new URLSearchParams(location.searchStr).get("account");
    return account || null;
  }, [location.searchStr]);
  const reviewFiltersFromSearch = useMemo<ReviewStatus[]>(() => {
    const requested = new URLSearchParams(location.searchStr).get("review")?.split(",") ?? [];
    const selected = requested.filter(
      (status): status is ReviewStatus =>
        status === "incomplete" || status === "needs_review" || status === "reviewed",
    );
    return requested.length === 0 ? ALL_REVIEW_STATUSES : selected;
  }, [location.searchStr]);
  const setAccountFilter = (next: string) => {
    setActiveAccountId(next);
    navigate({
      to: "/trades",
      search: (current) => ({
        ...current,
        account: next === "ALL" ? undefined : next,
      }),
      replace: true,
    });
  };
  useEffect(() => {
    if (!accountFromSearch) return;
    setActiveAccountId(accountFromSearch);
  }, [accountFromSearch, setActiveAccountId]);
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
    return dbRows.map((t, i) =>
      dbToRow(t, total - i, rPerformanceEnabled, tradeCompletenessRequirements),
    );
  }, [dbRows, rPerformanceEnabled, tradeCompletenessRequirements]);

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
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "WIN" | "LOSS" | "BE">("ALL");
  const [newOpen, setNewOpen] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [categoryFilterSearch, setCategoryFilterSearch] = useState("");
  const [reviewFilters, setReviewFilters] = useState<ReviewStatus[]>(reviewFiltersFromSearch);
  const [detail, setDetail] = useState<Pick<Row, "id" | "num"> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Pick<Row, "id" | "num"> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const editingDb = useMemo(
    () => (editingId ? (dbRows.find((t) => t.id === editingId) ?? null) : null),
    [editingId, dbRows],
  );

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
    return accountRows.filter(
      (r) =>
        (filter === "ALL" || r.res === filter) &&
        reviewFilters.includes(r.status) &&
        (activeCategories.length === 0 || activeCategories.includes(r.category)) &&
        matchesTradeSearch(
          {
            num: r.num,
            instrument: r.sym,
            category: r.category,
            tradeDate: r.rawDate,
          },
          q,
        ),
    );
  }, [q, filter, reviewFilters, activeCategories, accountRows]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSuggestionQuery(q), 160);
    return () => window.clearTimeout(timer);
  }, [q]);
  const searchSuggestions = useMemo(
    () =>
      tradeSearchSuggestions(
        accountRows.map((row) => ({
          num: row.num,
          instrument: row.sym,
          category: row.category,
          tradeDate: row.rawDate,
        })),
        suggestionQuery,
      ),
    [accountRows, suggestionQuery],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / 10));
  const pageButtons = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
    return Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter(
      (number) => number >= 1 && number <= totalPages,
    );
  }, [page, totalPages]);
  const visibleRows = visible.slice((page - 1) * 10, page * 10);
  const activeFilterCount =
    ALL_REVIEW_STATUSES.length -
    reviewFilters.length +
    activeCategories.length +
    (filter === "ALL" ? 0 : 1) +
    (accountFilter === "ALL" ? 0 : 1);
  // Header and body rows share this exact template — one column definition,
  // date/number/RR columns stay compact, instrument takes the flexible space.
  const tradeGridClass =
    "grid min-w-[920px] grid-cols-[minmax(160px,1.1fr)_minmax(96px,0.8fr)_minmax(210px,1.4fr)_minmax(132px,1fr)_minmax(132px,1fr)_minmax(150px,1.1fr)] items-center";

  useEffect(() => {
    setPage(1);
  }, [q, filter, reviewFilters, activeCategories, accountFilter]);

  useEffect(() => {
    setReviewFilters(reviewFiltersFromSearch);
  }, [reviewFiltersFromSearch]);

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
      const count = dbRows.filter((trade) => (trade.categories ?? []).includes(category)).length;
      return { category, count };
    },
    onSuccess: ({ category, count }) => {
      setExtraTaxonomy((current) => {
        if (!(category in current)) return current;
        const next = { ...current };
        delete next[category];
        return next;
      });
      toast.success(
        count > 0
          ? `Category archived. ${count} historical trade${count === 1 ? " keeps" : "s keep"} it.`
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
              type="button"
              onClick={() => setCatManagerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground hover:ring-white/[0.1]"
            >
              <FolderPlus className="h-4 w-4" /> Manage categories
            </button>
            <button
              type="button"
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
      {/* Search + filter bar */}
      <div className="glow-card mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-3 lg:flex-nowrap">
        <div className="relative min-w-[240px] flex-1">
          <SearchInput
            value={q}
            onValueChange={setQ}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
            placeholder="Search date, #trade, instrument, or setup"
            aria-label="Search trades"
          />
          {searchFocused && searchSuggestions.length > 0 && (
            <div className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-popover p-1 shadow-[var(--shadow-elevated)] ring-1 ring-white/[0.09]">
              {searchSuggestions.map((suggestion) => (
                <button
                  key={`${suggestion.detail}:${suggestion.value}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setQ(suggestion.value);
                    setSearchFocused(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.06]"
                >
                  <span className="min-w-0 truncate text-sm text-foreground">{suggestion.label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {suggestion.detail}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <AccountFilterSelect
          accounts={accounts.filter((account) => account.status !== "archived")}
          value={accountFilter}
          onValueChange={setAccountFilter}
        />
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white/[0.04] px-3 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground"
            >
              <Funnel className="h-4 w-4" /> Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 rounded-xl border-white/[0.08] bg-popover p-3"
          >
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">
                  REVIEW STATE
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-xs">
                  {ALL_REVIEW_STATUSES.map((status) => (
                    <label
                      key={status}
                      className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-muted-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={reviewFilters.includes(status)}
                        onChange={() =>
                          setReviewFilters((current) =>
                            current.includes(status)
                              ? current.filter((item) => item !== status)
                              : [...current, status],
                          )
                        }
                        className="accent-primary"
                      />
                      {REVIEW_STATUS_LABEL[status]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">
                  CATEGORY / SETUP
                </label>
                <div
                  role="combobox"
                  aria-expanded="true"
                  aria-label="Filter by categories"
                  className="mt-1.5 overflow-hidden rounded-xl bg-white/[0.035] ring-1 ring-white/[0.07]"
                >
                  <SearchInput
                    value={categoryFilterSearch}
                    onValueChange={setCategoryFilterSearch}
                    placeholder={
                      activeCategories.length
                        ? `${activeCategories.length} selected`
                        : "Search categories"
                    }
                    aria-label="Search category filters"
                    className="rounded-none bg-transparent py-2 text-xs ring-0 focus:ring-0"
                  />
                  <div className="max-h-40 overflow-y-auto border-t border-white/[0.06] p-1">
                    <button
                      type="button"
                      onClick={() => setActiveCategories([])}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-white/[0.05]"
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={activeCategories.length === 0}
                        className="accent-primary"
                      />
                      All categories
                    </button>
                    {categoryRegistry
                      .filter((item) => !item.archived_at)
                      .filter((item) =>
                        item.name
                          .toLocaleLowerCase()
                          .split(/\s+/)
                          .some((word) =>
                            word.startsWith(categoryFilterSearch.trim().toLocaleLowerCase()),
                          ),
                      )
                      .sort(
                        (a, b) =>
                          (categoryUsage[b.name] ?? 0) - (categoryUsage[a.name] ?? 0) ||
                          a.name.localeCompare(b.name),
                      )
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            setActiveCategories((current) =>
                              current.includes(item.name)
                                ? current.filter((name) => name !== item.name)
                                : [...current, item.name],
                            )
                          }
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-white/[0.05]"
                        >
                          <input
                            type="checkbox"
                            readOnly
                            checked={activeCategories.includes(item.name)}
                            className="accent-primary"
                          />
                          <span className="min-w-0 truncate">{item.name}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          {(["ALL", "WIN", "LOSS", "BE"] as const).map((f) => (
            <button
              type="button"
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
        {reviewFilters.length === 0 ? (
          <div className="m-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.02] px-5 py-12 text-center ring-1 ring-white/[0.04]">
            <p className="text-sm font-medium text-foreground">No review states selected.</p>
            <p className="text-xs text-muted-foreground">Choose at least one status in Filters.</p>
          </div>
        ) : visible.length === 0 && accountFilter !== "ALL" && !accountHasAnyTrades ? (
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
                type="button"
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
                          <OverflowInstrument value={r.sym} />
                        </div>
                        <div
                          role="cell"
                          className={cn(
                            "px-3 py-4 text-center text-sm font-semibold tabular-nums",
                            r.plannedRR ? "text-foreground" : "text-muted-foreground",
                          )}
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
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.04] px-4 py-3 text-xs text-muted-foreground">
                <span>
                  Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, visible.length)} of{" "}
                  {visible.length} trades
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}
                    className="rounded-lg px-2 py-1.5 hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    Previous
                  </button>
                  {pageButtons.map((number) => (
                    <button
                      type="button"
                      key={number}
                      onClick={() => setPage(number)}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5",
                        page === number
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-white/[0.05]",
                      )}
                    >
                      {number}
                    </button>
                  ))}
                  {totalPages > 7 && (
                    <label className="ml-1 inline-flex items-center gap-1 whitespace-nowrap">
                      Page{" "}
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        defaultValue={page}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            const requested = Number(event.currentTarget.value);
                            setPage(Math.min(totalPages, Math.max(1, Math.floor(requested) || 1)));
                          }
                        }}
                        className="w-12 rounded-md bg-white/[0.05] px-1.5 py-1 text-center outline-none ring-1 ring-white/[0.08] focus:ring-primary/40"
                      />{" "}
                      of {totalPages}
                    </label>
                  )}
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-lg px-2 py-1.5 hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
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
            registry={categoryRegistry}
            onRemoveCategory={(category) => removeCategoryM.mutate(category)}
            removing={removeCategoryM.isPending}
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
        title="Delete trade?"
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
  registry,
}: {
  taxonomy: Taxonomy;
  base: Taxonomy;
  usage: Record<string, number>;
  onClose: () => void;
  onChange: (t: Taxonomy) => void;
  onRemoveCategory: (category: string) => void;
  removing: boolean;
  registry: { id: string; name: string; archived_at: string | null; normalized_name: string }[];
}) {
  const [newCat, setNewCat] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [confirmCategory, setConfirmCategory] = useState<string | null>(null);
  const qc = useQueryClient();
  const createCategory = useServerFn(createTradeCategory);
  const archiveCategory = useServerFn(archiveTradeCategory);

  const addCategory = async () => {
    const n = newCat.trim();
    if (!n) return;
    try {
      await createCategory({ data: n });
      await qc.invalidateQueries({ queryKey: ["trade-categories"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create category");
      return;
    }
    setNewCat("");
  };
  const removeCategory = async (category: string) => {
    const item = registry.find((row) => row.name === category);
    if (item) {
      await archiveCategory({ data: { id: item.id } });
      await qc.invalidateQueries({ queryKey: ["trade-categories"] });
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
            type="button"
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
            type="button"
            onClick={addCategory}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110"
          >
            Add
          </button>
        </div>

        {registry.filter((item) => !item.archived_at).length > 4 && (
          <SearchInput
            value={categorySearch}
            onValueChange={setCategorySearch}
            placeholder="Search categories"
            wrapperClassName="mt-4"
            className="py-2 text-xs"
          />
        )}
        <div className="mt-5 max-h-[15rem] space-y-1 overflow-y-auto pr-1">
          {registry.filter((item) => !item.archived_at).length === 0 && (
            <div className="rounded-xl bg-white/[0.03] p-4 text-center text-sm text-muted-foreground ring-1 ring-white/[0.04]">
              No categories yet. Create your first one above.
            </div>
          )}
          {registry
            .filter((item) => !item.archived_at)
            .filter((item) =>
              item.name
                .toLocaleLowerCase()
                .split(/\s+/)
                .some((word) => word.startsWith(categorySearch.trim().toLocaleLowerCase())),
            )
            .map(({ name: c }) => {
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
              ? "This archives the category for future selection. Existing trades and reviews keep their historical category."
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

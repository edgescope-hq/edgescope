import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ListChecks,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Star,
  TrendingUp,
  Trash2,
  Trophy,
  WalletCards,
  Pencil,
  Bell,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import appLogo from "@/assets/edgescope-logo.png.asset.json";
import {
  createTradingAccount,
  deleteTradingAccount,
  listTradingAccounts,
  setActiveTradingAccount,
  updateTradingAccount,
  type TradingAccount,
} from "@/lib/trading-accounts.functions";
import {
  getGuardrails,
  upsertGuardrails,
  type AccountGuardrails,
} from "@/lib/guardrails.functions";
import { listTrades } from "@/lib/trades.functions";
import type { Database } from "@/integrations/supabase/types";
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts - EdgeScope" },
      {
        name: "description",
        content: "Manage your trading account workspaces, risk rules, and guardrails.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountsPage,
});

type TradeRow = Database["public"]["Tables"]["trades"]["Row"] & {
  trade_screenshots?: { id: string }[] | null;
};

function Field({
  label,
  value,
  type = "text",
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-1.5 w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
      />
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
}: {
  label: string;
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <ShadcnSelect value={value || undefined} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="mt-1.5 h-auto w-full rounded-xl border-0 bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-white/[0.08] bg-popover text-popover-foreground">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="cursor-pointer rounded-lg text-sm">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadcnSelect>
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.05]">
      <div className="min-w-0">
        <div className="text-xs font-semibold">{label}</div>
        {description && (
          <div className="mt-1 text-[11px] leading-normal text-muted-foreground">{description}</div>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function numOrNull(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function fmtPct(n: number, d = 1) {
  return `${n.toFixed(d)}%`;
}

function labelForType(t: TradingAccount["account_type"]) {
  switch (t) {
    case "funded":
      return "Funded";
    case "demo":
      return "Demo";
    case "live":
      return "Live";
    case "challenge":
      return "Challenge";
    case "backtest":
      return "Backtest";
    default:
      return "Personal";
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatR(value: number | null) {
  if (value == null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}R`;
}

function isReviewedTrade(trade: TradeRow) {
  return Boolean(
    trade.grade ||
    trade.reasoning ||
    trade.lessons_learned ||
    trade.mistakes_made ||
    (trade.mistake_tags?.length ?? 0) > 0 ||
    (trade.trade_screenshots?.length ?? 0) > 0,
  );
}

function buildTradeMetrics(trades: TradeRow[]) {
  const total = trades.length;
  const decided = trades.filter((trade) => trade.result === "win" || trade.result === "loss");
  const wins = decided.filter((trade) => trade.result === "win").length;
  const rTrades = trades.filter((trade) => trade.achieved_rr != null);
  const netR = rTrades.length
    ? rTrades.reduce((sum, trade) => sum + Number(trade.achieved_rr ?? 0), 0)
    : null;
  const avgR = rTrades.length && netR != null ? netR / rTrades.length : null;

  return {
    total,
    winRate: decided.length ? (wins / decided.length) * 100 : null,
    netR,
    avgR,
    reviewed: trades.filter(isReviewedTrade).length,
    lastTradeDate: trades[0]?.trade_date ?? null,
  };
}

const BG_COLORS = [
  "bg-primary/20 text-primary ring-primary/30",
  "bg-blue-500/20 text-blue-400 ring-blue-500/30",
  "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30",
  "bg-amber-500/20 text-amber-400 ring-amber-500/30",
];

function AccountsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTradingAccounts);
  const listTradesFn = useServerFn(listTrades);
  const setActiveFn = useServerFn(setActiveTradingAccount);
  const createFn = useServerFn(createTradingAccount);
  const updateFn = useServerFn(updateTradingAccount);
  const deleteFn = useServerFn(deleteTradingAccount);
  const getGuardrailsFn = useServerFn(getGuardrails);
  const saveGuardrailsFn = useServerFn(upsertGuardrails);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => listFn(),
  });
  const { data: tradesData = [] } = useQuery({
    queryKey: ["trades"],
    queryFn: () => listTradesFn(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Modal control states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState({
    name: "",
    account_type: "personal" as TradingAccount["account_type"],
    broker: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    account_type: "personal" as TradingAccount["account_type"],
    broker: "",
  });

  const [rulesForm, setRulesForm] = useState({
    max_risk_per_trade_pct: "",
    daily_loss_limit_pct: "",
    daily_loss_reminder: true,
  });

  useEffect(() => {
    if (!selectedId && accounts.length > 0) {
      const active = accounts.find((a) => a.is_active);
      setSelectedId(active?.id ?? accounts[0].id);
    }
  }, [accounts, selectedId]);

  const selected = useMemo(
    () => accounts.find((a) => a.id === selectedId) ?? null,
    [accounts, selectedId],
  );

  const allTrades = useMemo(() => (tradesData ?? []) as TradeRow[], [tradesData]);
  const selectedTrades = useMemo(
    () => (selected ? allTrades.filter((trade) => trade.account_id === selected.id) : []),
    [allTrades, selected],
  );

  // Fetch guardrails for selected account
  const { data: guardrailsData } = useQuery({
    queryKey: ["guardrails", selectedId],
    queryFn: () => (selectedId ? getGuardrailsFn({ data: { account_id: selectedId } }) : null),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (selected) {
      setEditForm({
        name: selected.name,
        account_type: selected.account_type,
        broker: selected.broker ?? "",
      });
      setRulesForm({
        max_risk_per_trade_pct:
          selected.max_risk_per_trade_pct != null ? String(selected.max_risk_per_trade_pct) : "",
        daily_loss_limit_pct:
          selected.daily_loss_limit_pct != null ? String(selected.daily_loss_limit_pct) : "",
        daily_loss_reminder: guardrailsData?.daily_loss_reminder ?? true,
      });
    }
  }, [selected, guardrailsData]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["trading-accounts"] });
    qc.invalidateQueries({ queryKey: ["trades"] });
    if (selectedId) {
      qc.invalidateQueries({ queryKey: ["guardrails", selectedId] });
    }
  };

  const setActiveM = useMutation({
    mutationFn: (id: string) => setActiveFn({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success("Active account switched");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createAccountM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: createForm.name.trim(),
          account_type: createForm.account_type,
          starting_balance: 0,
          broker: createForm.broker.trim() || null,
        },
      }),
    onSuccess: (row) => {
      toast.success("Workspace created successfully");
      setShowCreateModal(false);
      setCreateForm({ name: "", account_type: "personal", broker: "" });
      setSelectedId(row.id);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAccountM = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: selected!.id,
          patch: {
            name: editForm.name.trim(),
            account_type: editForm.account_type,
            broker: editForm.broker.trim() || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Workspace updated");
      setShowEditModal(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRulesM = useMutation({
    mutationFn: async () => {
      await updateFn({
        data: {
          id: selected!.id,
          patch: {
            max_risk_per_trade_pct: numOrNull(rulesForm.max_risk_per_trade_pct),
            daily_loss_limit_pct: numOrNull(rulesForm.daily_loss_limit_pct),
          },
        },
      });
      await saveGuardrailsFn({
        data: {
          account_id: selected!.id,
          patch: { daily_loss_reminder: rulesForm.daily_loss_reminder },
        },
      });
    },
    onSuccess: () => {
      toast.success("Risk rules and guardrails updated");
      setShowRulesModal(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: () => deleteFn({ data: { id: selected!.id } }),
    onSuccess: () => {
      toast.success("Trading workspace deleted");
      setShowDeleteConfirm(false);
      setSelectedId(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canDelete = selectedTrades.length === 0;
  const metrics = buildTradeMetrics(selectedTrades);

  return (
    <PageShell>
      <PageHeader
        icon={WalletCards}
        title="Accounts"
        description="Manage trading workspaces, risk rules, and review context."
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left Column - Workspaces List */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                Your workspaces
              </span>
              <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary ring-1 ring-primary/20">
                {accounts.length}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {isLoading && <div className="p-4 text-center text-xs text-muted-foreground">Loading workspaces...</div>}
            {!isLoading && accounts.length === 0 && (
              <PremiumEmptyState
                icon={WalletCards}
                title="No workspaces yet"
                description="Add a trading workspace to separate live, demo, funded, or backtest work."
                compact
              />
            )}
            {accounts.map((a, idx) => {
              const isSel = selectedId === a.id;
              const acctTrades = allTrades.filter((t) => t.account_id === a.id);
              const acctMetrics = buildTradeMetrics(acctTrades);
              const initial = a.name.charAt(0).toUpperCase();
              const avatarColor = BG_COLORS[a.name.charCodeAt(0) % BG_COLORS.length];

              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition-all duration-200",
                    isSel
                      ? "bg-primary/[0.08] ring-1 ring-primary/30 text-foreground shadow-[var(--shadow-glow)]"
                      : "bg-white/[0.02] ring-1 ring-white/[0.05] text-muted-foreground/80 hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ring-1", avatarColor)}>
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">{a.name}</span>
                        {a.is_active && (
                          <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-success" title="Active Workspace" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                        <span>{labelForType(a.account_type)}</span>
                        <span>·</span>
                        <span>{acctMetrics.total} trades</span>
                        {acctMetrics.netR != null && (
                          <>
                            <span>·</span>
                            <span className={acctMetrics.netR >= 0 ? "text-success font-medium" : "text-destructive font-medium"}>
                              {formatR(acctMetrics.netR)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.02] py-2.5 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] hover:bg-white/[0.04] hover:text-foreground transition-all duration-200"
          >
            <Plus className="h-3.5 w-3.5" /> Add workspace
          </button>
        </div>

        {/* Right Column - Workspace Detail */}
        <div className="glow-card min-w-0 rounded-2xl p-6 bg-white/[0.01]">
          {selected ? (
            <div className="space-y-6">
              {/* Workspace Detail Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.04] pb-5">
                <div className="flex items-center gap-3">
                  <div className={cn("grid h-10 w-10 place-items-center rounded-xl text-sm font-bold ring-1", BG_COLORS[selected.name.charCodeAt(0) % BG_COLORS.length])}>
                    {selected.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-foreground">{selected.name}</h3>
                      {selected.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={() => setActiveM.mutate(selected.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground hover:bg-primary/15 transition-colors"
                        >
                          Set Active
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {labelForType(selected.account_type)}
                      {selected.broker ? ` · ${selected.broker}` : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground ring-1 ring-white/[0.06] transition"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit details
                  </button>
                  <Link
                    to="/trades"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Log trade
                  </Link>
                </div>
              </div>

              {/* A. Account Snapshot Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                  Account Snapshot
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <InfoCard
                    icon={ClipboardList}
                    label="Total Trades"
                    value={metrics.total || "—"}
                    sub={metrics.total === 0 ? "No trades yet" : "Logged trading volume"}
                  />
                  <InfoCard
                    icon={TrendingUp}
                    label="Net R"
                    value={formatR(metrics.netR)}
                    sub={metrics.total === 0 ? "No trades yet" : "Net profit factor in R"}
                    highlight={metrics.netR != null}
                    positive={metrics.netR != null && metrics.netR >= 0}
                  />
                  <InfoCard
                    icon={Trophy}
                    label="Win Rate"
                    value={metrics.winRate == null ? "—" : fmtPct(metrics.winRate)}
                    sub={metrics.total === 0 ? "No trades yet" : "Profitable trades ratio"}
                  />
                  <InfoCard
                    icon={ClipboardCheck}
                    label="Reviewed Trades"
                    value={metrics.total ? `${metrics.reviewed}/${metrics.total}` : "—"}
                    sub={metrics.total === 0 ? "No trades yet" : "Journal checklist coverage"}
                  />
                  <InfoCard
                    icon={BarChart3}
                    label="Avg R"
                    value={formatR(metrics.avgR)}
                    sub={metrics.total === 0 ? "No trades yet" : "Average return per trade"}
                  />
                  <InfoCard
                    icon={CalendarDays}
                    label="Last Trade Date"
                    value={formatDate(metrics.lastTradeDate)}
                    sub={metrics.total === 0 ? "No trades yet" : "Most recent journal activity"}
                  />
                </div>
              </div>

              {/* B. Risk & Guardrails Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Risk & Guardrails
                  </h4>
                  <button
                    onClick={() => setShowRulesModal(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
                  >
                    <Pencil className="h-3 w-3" /> Edit rules
                  </button>
                </div>
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4 space-y-4">
                  <div className="text-[11px] leading-relaxed text-muted-foreground">
                    Rules and guardrails are review reminders. They do not connect to brokers or block trades.
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20">
                        <ShieldAlert className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/75">
                          Max Risk Per Trade
                        </div>
                        <div className="text-xs font-bold text-foreground mt-0.5">
                          {selected.max_risk_per_trade_pct != null ? `${selected.max_risk_per_trade_pct}%` : "Not set"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/75">
                          Daily Loss Limit
                        </div>
                        <div className="text-xs font-bold text-foreground mt-0.5">
                          {selected.daily_loss_limit_pct != null ? `${selected.daily_loss_limit_pct}%` : "Not set"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/75">
                          Journal Reminders
                        </div>
                        <div className="text-xs font-bold text-foreground mt-0.5">
                          {guardrailsData?.daily_loss_reminder ?? true ? "On" : "Off"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Cards: Recent Trades (Left) & Workspace Actions (Right) */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 pt-2">
                {/* C. Recent Trades */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Recent Trades
                  </h4>
                  {selectedTrades.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-6 text-center">
                      <p className="text-xs text-muted-foreground">No trades in this account yet.</p>
                      <Link
                        to="/trades"
                        className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 transition"
                      >
                        <Plus className="h-3.5 w-3.5" /> Log a trade
                      </Link>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.01]">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-white/[0.02] border-b border-white/[0.04] text-[9px] font-bold uppercase tracking-wider text-muted-foreground/75">
                            <tr>
                              <th className="px-3 py-2.5">Trade</th>
                              <th className="px-3 py-2.5">Date</th>
                              <th className="px-3 py-2.5">Result</th>
                              <th className="px-3 py-2.5">R</th>
                              <th className="px-3 py-2.5">Review</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {selectedTrades.slice(0, 5).map((trade) => (
                              <tr key={trade.id} className="hover:bg-white/[0.01] transition-colors">
                                <td className="px-3 py-2.5 font-semibold text-foreground/90">{trade.instrument}</td>
                                <td className="px-3 py-2.5 text-muted-foreground">{formatDate(trade.trade_date)}</td>
                                <td className="px-3 py-2.5 capitalize">{trade.result ?? "—"}</td>
                                <td className="px-3 py-2.5 font-medium tabular-nums">{formatR(trade.achieved_rr)}</td>
                                <td className="px-3 py-2.5">
                                  <span
                                    className={cn(
                                      "inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide",
                                      isReviewedTrade(trade)
                                        ? "bg-success/15 text-success"
                                        : "bg-white/[0.04] text-muted-foreground",
                                    )}
                                  >
                                    {isReviewedTrade(trade) ? "Reviewed" : "Needs review"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {selectedTrades.length > 5 && (
                        <div className="border-t border-white/[0.04] bg-white/[0.01] px-3 py-2 flex justify-between items-center">
                          <span className="text-[10px] text-muted-foreground/70">
                            Showing latest 5 of {selectedTrades.length} trades
                          </span>
                          <Link to="/trades" className="text-[10px] font-semibold text-primary hover:underline">
                            View all in My Trades →
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* D. Account Actions / Settings */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Account Actions
                  </h4>
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4 space-y-3">
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="flex w-full items-center gap-3 rounded-lg bg-white/[0.02] p-2.5 text-left border border-white/[0.04] transition hover:bg-white/[0.05]"
                    >
                      <div className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.05] text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">Rename workspace</div>
                        <div className="text-[10px] text-muted-foreground">Update workspace name or broker details.</div>
                      </div>
                    </button>

                    <button
                      onClick={() => setShowRulesModal(true)}
                      className="flex w-full items-center gap-3 rounded-lg bg-white/[0.02] p-2.5 text-left border border-white/[0.04] transition hover:bg-white/[0.05]"
                    >
                      <div className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.05] text-foreground">
                        <SettingsIcon className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">Manage risk rules</div>
                        <div className="text-[10px] text-muted-foreground">Modify risk parameters and reminder triggers.</div>
                      </div>
                    </button>

                    <button
                      onClick={() => canDelete && setShowDeleteConfirm(true)}
                      disabled={!canDelete}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg p-2.5 text-left border transition",
                        canDelete
                          ? "bg-destructive/5 border-destructive/15 text-destructive hover:bg-destructive/10 cursor-pointer"
                          : "opacity-40 border-white/[0.04] bg-white/[0.01] cursor-not-allowed",
                      )}
                    >
                      <div className={cn("grid h-7 w-7 place-items-center rounded-md", canDelete ? "bg-destructive/10 text-destructive" : "bg-white/[0.05] text-muted-foreground")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">Delete trading account</div>
                        <div className="text-[10px]">Deletes this trading account workspace.</div>
                      </div>
                    </button>

                    {!canDelete && (
                      <p className="text-[10px] text-muted-foreground/60 leading-normal pl-1.5">
                        * Deletion is blocked because this account has logged trades.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Confirmation and Action Dialog Modals */}

              {/* 1. Create Workspace Dialog */}
              <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-md p-6">
                  <DialogHeader>
                    <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                      <Plus className="h-4 w-4 text-primary" /> Create trading workspace
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Use trading accounts to separate live, demo, funded, or backtest work.
                  </p>
                  <div className="mt-4 space-y-4">
                    <Field
                      label="Workspace name"
                      value={createForm.name}
                      onChange={(v) => setCreateForm((f) => ({ ...f, name: v }))}
                    />
                    <Select
                      label="Workspace type"
                      value={createForm.account_type}
                      onChange={(v) =>
                        setCreateForm((f) => ({
                          ...f,
                          account_type: (v || "personal") as TradingAccount["account_type"],
                        }))
                      }
                      options={[
                        { value: "personal", label: "Personal" },
                        { value: "live", label: "Live" },
                        { value: "demo", label: "Demo" },
                        { value: "challenge", label: "Challenge" },
                        { value: "funded", label: "Funded" },
                        { value: "backtest", label: "Backtest" },
                      ]}
                    />
                    <Field
                      label="Broker (optional)"
                      value={createForm.broker}
                      placeholder="Exness, Binance, Tradovate"
                      onChange={(v) => setCreateForm((f) => ({ ...f, broker: v }))}
                    />
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      onClick={() => setShowCreateModal(false)}
                      className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-white/[0.06]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => createAccountM.mutate()}
                      disabled={createAccountM.isPending || !createForm.name.trim()}
                      className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
                    >
                      {createAccountM.isPending ? "Creating..." : "Create workspace"}
                    </button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* 2. Edit Workspace Dialog */}
              <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-md p-6">
                  <DialogHeader>
                    <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                      <Pencil className="h-4 w-4 text-primary" /> Edit details
                    </DialogTitle>
                  </DialogHeader>
                  <div className="mt-4 space-y-4">
                    <Field
                      label="Workspace name"
                      value={editForm.name}
                      onChange={(v) => setEditForm((f) => ({ ...f, name: v }))}
                    />
                    <Select
                      label="Workspace type"
                      value={editForm.account_type}
                      onChange={(v) =>
                        setEditForm((f) => ({
                          ...f,
                          account_type: (v || "personal") as TradingAccount["account_type"],
                        }))
                      }
                      options={[
                        { value: "personal", label: "Personal" },
                        { value: "live", label: "Live" },
                        { value: "demo", label: "Demo" },
                        { value: "challenge", label: "Challenge" },
                        { value: "funded", label: "Funded" },
                        { value: "backtest", label: "Backtest" },
                      ]}
                    />
                    <Field
                      label="Broker (optional)"
                      value={editForm.broker}
                      placeholder="Exness, Binance, Tradovate"
                      onChange={(v) => setEditForm((f) => ({ ...f, broker: v }))}
                    />
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      onClick={() => setShowEditModal(false)}
                      className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-white/[0.06]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => updateAccountM.mutate()}
                      disabled={updateAccountM.isPending || !editForm.name.trim()}
                      className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
                    >
                      {updateAccountM.isPending ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* 3. Edit Risk Rules & Guardrails Dialog */}
              <Dialog open={showRulesModal} onOpenChange={setShowRulesModal}>
                <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-md p-6">
                  <DialogHeader>
                    <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                      <SettingsIcon className="h-4 w-4 text-primary" /> Risk rules & guardrails
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Rules and guardrails are review reminders. They do not connect to brokers or block trades.
                  </p>
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="Max risk per trade (%)"
                        type="number"
                        value={rulesForm.max_risk_per_trade_pct}
                        placeholder="e.g. 1"
                        onChange={(v) => setRulesForm((f) => ({ ...f, max_risk_per_trade_pct: v }))}
                      />
                      <Field
                        label="Daily loss limit (%)"
                        type="number"
                        value={rulesForm.daily_loss_limit_pct}
                        placeholder="e.g. 3"
                        onChange={(v) => setRulesForm((f) => ({ ...f, daily_loss_limit_pct: v }))}
                      />
                    </div>
                    <div className="pt-2">
                      <ToggleRow
                        label="Remind after daily loss limit hit"
                        description="Show a reminder when a logged trade exceeds your daily loss limit setting."
                        checked={rulesForm.daily_loss_reminder}
                        onChange={(checked) => setRulesForm((f) => ({ ...f, daily_loss_reminder: checked }))}
                      />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      onClick={() => setShowRulesModal(false)}
                      className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-white/[0.06]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => updateRulesM.mutate()}
                      disabled={updateRulesM.isPending}
                      className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
                    >
                      {updateRulesM.isPending ? "Saving..." : "Save rules"}
                    </button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* 4. Delete Confirm Modal */}
              <ConfirmDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                title={`Delete "${selected.name}"?`}
                description="Deletes only this trading account workspace. Your EdgeScope login, profile, and other accounts stay active."
                confirmLabel="Delete trading account"
                destructive
                loading={deleteM.isPending}
                onConfirm={() => deleteM.mutate()}
              />
            </div>
          ) : (
            <div className="grid place-items-center p-12 text-center text-sm text-muted-foreground h-full min-h-[400px]">
              <div>
                <img
                  src={appLogo.url}
                  alt=""
                  className="mx-auto h-16 w-16 object-contain opacity-70"
                />
                <p className="mt-4">Select a workspace or add a new one.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  sub,
  highlight = false,
  positive = true,
}: {
  icon?: typeof WalletCards;
  label: string;
  value: ReactNode;
  sub?: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 flex flex-col justify-between min-h-[100px] hover:border-white/[0.08] transition-all">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary/75" />}
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
          {label}
        </span>
      </div>
      <div className="mt-3">
        <div
          className={cn(
            "text-xl font-bold tracking-tight",
            highlight
              ? positive
                ? "text-success"
                : "text-destructive"
              : "text-foreground",
          )}
        >
          {value}
        </div>
        {sub && <div className="mt-1 text-[10px] text-muted-foreground/50 leading-normal">{sub}</div>}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Calculator,
  Check,
  CheckCircle2,
  ChevronRight,
  ListChecks,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Trash2,
  Pencil,
  Bell,
  Archive,
  RotateCcw,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  createTradingAccount,
  archiveTradingAccount,
  deleteTradingAccount,
  listTradingAccounts,
  setDefaultTradingAccount,
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
import { isPaperTrade } from "@/lib/trade-mappers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { accountTypePreservesEvidencePopulation } from "@/lib/evidence-population";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts - EdgeScope" },
      {
        name: "description",
        content: "Manage your trading accounts, risk rules, and guardrails.",
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
  error,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string | false;
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
        className={cn(
          "mt-1.5 w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground ring-1 transition-all duration-200 focus:outline-none focus:ring-2 disabled:opacity-50",
          error
            ? "ring-destructive/25 focus:ring-destructive/30"
            : "ring-white/[0.06] focus:ring-primary/40",
        )}
      />
      {error && <span className="mt-1.5 block text-[11px] text-destructive/85">{error}</span>}
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

function intOrNull(v: string): number | null {
  const n = numOrNull(v);
  return n == null ? null : Math.max(0, Math.trunc(n));
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
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
  const createFn = useServerFn(createTradingAccount);
  const archiveFn = useServerFn(archiveTradingAccount);
  const updateFn = useServerFn(updateTradingAccount);
  const deleteFn = useServerFn(deleteTradingAccount);
  const setDefaultFn = useServerFn(setDefaultTradingAccount);
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
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [discardEditor, setDiscardEditor] = useState<"create" | "edit" | "rules" | null>(null);
  // Form states
  const [createForm, setCreateForm] = useState({
    name: "",
    account_type: "personal" as TradingAccount["account_type"],
    broker: "",
    starting_balance: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    account_type: "personal" as TradingAccount["account_type"],
    broker: "",
  });

  const [rulesForm, setRulesForm] = useState({
    max_risk_per_trade_pct: "",
    daily_loss_limit_pct: "",
    max_trades_per_day: "",
    daily_loss_reminder: true,
    starting_balance: "",
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
  const editAccountTypeOptions = useMemo(() => {
    if (!selected) return [];
    const options: { value: TradingAccount["account_type"]; label: string }[] = [
      { value: "personal", label: "Personal" },
      { value: "demo", label: "Demo · Practice" },
      { value: "live", label: "Live" },
      { value: "funded", label: "Funded" },
      ...(selected.account_type === "challenge"
        ? ([{ value: "challenge", label: "Challenge" }] as const)
        : []),
      { value: "backtest", label: "Backtest · Research" },
    ];
    return options.filter((option) =>
      accountTypePreservesEvidencePopulation(selected.account_type, option.value),
    );
  }, [selected]);
  const createNameDuplicate = useMemo(() => {
    const nextName = normalizeName(createForm.name);
    return nextName ? accounts.some((account) => normalizeName(account.name) === nextName) : false;
  }, [accounts, createForm.name]);
  const editNameDuplicate = useMemo(() => {
    const nextName = normalizeName(editForm.name);
    return nextName
      ? accounts.some(
          (account) => account.id !== selected?.id && normalizeName(account.name) === nextName,
        )
      : false;
  }, [accounts, editForm.name, selected?.id]);

  const allTrades = useMemo(() => (tradesData ?? []) as TradeRow[], [tradesData]);
  const realTrades = useMemo(() => allTrades.filter((trade) => !isPaperTrade(trade)), [allTrades]);
  const selectedTrades = useMemo(
    () => (selected ? realTrades.filter((trade) => trade.account_id === selected.id) : []),
    [realTrades, selected],
  );
  const selectedTradesForDeletion = useMemo(
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
      if (!showEditModal) {
        setEditForm({
          name: selected.name,
          account_type: selected.account_type,
          broker: selected.broker ?? "",
        });
      }
      if (!showRulesModal) {
        setRulesForm({
          max_risk_per_trade_pct:
            selected.max_risk_per_trade_pct != null ? String(selected.max_risk_per_trade_pct) : "",
          daily_loss_limit_pct:
            selected.daily_loss_limit_pct != null ? String(selected.daily_loss_limit_pct) : "",
          max_trades_per_day:
            selected.max_trades_per_day != null ? String(selected.max_trades_per_day) : "",
          daily_loss_reminder: guardrailsData?.daily_loss_reminder ?? true,
          starting_balance:
            selected.starting_balance != null ? String(selected.starting_balance) : "",
        });
      }
    }
  }, [guardrailsData, selected, showEditModal, showRulesModal]);

  const createDirty =
    createForm.name !== "" ||
    createForm.account_type !== "personal" ||
    createForm.broker !== "" ||
    createForm.starting_balance !== "";
  const editDirty = Boolean(
    selected &&
    (editForm.name !== selected.name ||
      editForm.account_type !== selected.account_type ||
      editForm.broker !== (selected.broker ?? "")),
  );
  const rulesDirty = Boolean(
    selected &&
    (rulesForm.max_risk_per_trade_pct !==
      (selected.max_risk_per_trade_pct != null ? String(selected.max_risk_per_trade_pct) : "") ||
      rulesForm.daily_loss_limit_pct !==
        (selected.daily_loss_limit_pct != null ? String(selected.daily_loss_limit_pct) : "") ||
      rulesForm.max_trades_per_day !==
        (selected.max_trades_per_day != null ? String(selected.max_trades_per_day) : "") ||
      rulesForm.daily_loss_reminder !== (guardrailsData?.daily_loss_reminder ?? true) ||
      rulesForm.starting_balance !==
        (selected.starting_balance != null ? String(selected.starting_balance) : "")),
  );
  useUnsavedChanges(
    (showCreateModal && createDirty) ||
      (showEditModal && editDirty) ||
      (showRulesModal && rulesDirty),
  );

  const closeEditor = (kind: "create" | "edit" | "rules") => {
    if (kind === "create") {
      setShowCreateModal(false);
      setCreateForm({ name: "", account_type: "personal", broker: "", starting_balance: "" });
    } else if (kind === "edit") {
      setShowEditModal(false);
    } else {
      setShowRulesModal(false);
    }
  };

  const requestEditorClose = (kind: "create" | "edit" | "rules") => {
    const isDirty = kind === "create" ? createDirty : kind === "edit" ? editDirty : rulesDirty;
    if (isDirty) {
      setDiscardEditor(kind);
      return;
    }
    closeEditor(kind);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["trading-accounts"] });
    qc.invalidateQueries({ queryKey: ["trades"] });
    if (selectedId) {
      qc.invalidateQueries({ queryKey: ["guardrails", selectedId] });
    }
  };

  const createAccountM = useMutation({
    mutationFn: () => {
      if (createNameDuplicate) {
        throw new Error("You already have a trading account with this name.");
      }
      return createFn({
        data: {
          name: createForm.name.trim(),
          account_type: createForm.account_type,
          starting_balance: createForm.starting_balance ? Number(createForm.starting_balance) : 0,
          broker: createForm.broker.trim() || null,
        },
      });
    },
    onSuccess: (row) => {
      toast.success("Trading account created");
      setShowCreateModal(false);
      setCreateForm({ name: "", account_type: "personal", broker: "", starting_balance: "" });
      setSelectedId(row.id);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefaultM = useMutation({
    mutationFn: (id: string) => setDefaultFn({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success("Default Trade Account updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAccountM = useMutation({
    mutationFn: () => {
      if (editNameDuplicate) {
        throw new Error("You already have a trading account with this name.");
      }
      return updateFn({
        data: {
          id: selected!.id,
          patch: {
            name: editForm.name.trim(),
            account_type: editForm.account_type,
            broker: editForm.broker.trim() || null,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Trading account updated");
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
            max_trades_per_day: intOrNull(rulesForm.max_trades_per_day),
            starting_balance: numOrNull(rulesForm.starting_balance) ?? 0,
          },
        },
      });
      try {
        await saveGuardrailsFn({
          data: {
            account_id: selected!.id,
            patch: { daily_loss_reminder: rulesForm.daily_loss_reminder },
          },
        });
        return { guardrailError: null as string | null };
      } catch (error) {
        return {
          guardrailError:
            error instanceof Error ? error.message : "The journal reminder could not be saved.",
        };
      }
    },
    onSuccess: (result) => {
      refresh();
      if (result.guardrailError) {
        toast.error(
          `Account risk rules were saved, but the journal reminder failed: ${result.guardrailError} Your selection remains open to retry.`,
        );
        return;
      }
      toast.success("Risk rules and guardrails updated");
      setShowRulesModal(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveM = useMutation({
    mutationFn: (status: "active" | "archived") =>
      archiveFn({ data: { id: selected!.id, status } }),
    onSuccess: (_result, status) => {
      setShowArchiveConfirm(false);
      refresh();
      toast.success(
        status === "archived" ? "Trading account archived" : "Trading account restored",
      );
    },
    onError: (e: Error) => {
      refresh();
      toast.error(e.message);
    },
  });

  const deleteM = useMutation({
    mutationFn: () => deleteFn({ data: { id: selected!.id } }),
    onSuccess: () => {
      toast.success("Trading account deleted");
      setShowDeleteConfirm(false);
      setSelectedId(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canDelete = selectedTradesForDeletion.length === 0;
  const createAccountDialog = (
    <Dialog
      open={showCreateModal}
      onOpenChange={(open) => {
        if (!open) requestEditorClose("create");
      }}
    >
      <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <BriefcaseBusiness className="h-4 w-4 text-primary" /> Create trading account
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Create separate journals for actual trading, Demo practice, or Backtest research. Practice
          and research evidence stay outside default live measurement.
        </p>
        <div className="mt-4 space-y-4">
          <Field
            label="Trading account name"
            value={createForm.name}
            onChange={(v) => setCreateForm((f) => ({ ...f, name: v }))}
            error={createNameDuplicate && "You already have a trading account with this name."}
          />
          <Select
            label="Trading account type"
            value={createForm.account_type}
            onChange={(v) =>
              setCreateForm((f) => ({
                ...f,
                account_type: (v || "personal") as TradingAccount["account_type"],
              }))
            }
            options={[
              { value: "personal", label: "Personal" },
              { value: "demo", label: "Demo · Practice" },
              { value: "live", label: "Live" },
              { value: "funded", label: "Funded" },
              ...(editForm.account_type === "challenge"
                ? [{ value: "challenge", label: "Challenge" }]
                : []),
              { value: "backtest", label: "Backtest · Research" },
            ]}
          />
          <Field
            label="Broker (optional)"
            value={createForm.broker}
            placeholder="Exness, Binance, Tradovate"
            onChange={(v) => setCreateForm((f) => ({ ...f, broker: v }))}
          />
          <Field
            label="Reference balance (optional)"
            type="number"
            value={createForm.starting_balance}
            placeholder="e.g. 10000"
            onChange={(v) => setCreateForm((f) => ({ ...f, starting_balance: v }))}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => requestEditorClose("create")}
            className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-white/[0.06]"
          >
            Cancel
          </button>
          <button
            onClick={() => createAccountM.mutate()}
            disabled={createAccountM.isPending || !createForm.name.trim() || createNameDuplicate}
            className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
          >
            {createAccountM.isPending ? "Creating..." : "Create trading account"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <PageShell>
      <PageHeader
        icon={BriefcaseBusiness}
        title="Accounts"
        description="Manage trading accounts, risk rules, and review context."
        actions={
          <>
            {selected && (
              <button
                onClick={() => setShowEditModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.08] transition hover:bg-white/[0.06] hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit account
              </button>
            )}
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" /> Add trading account
            </button>
          </>
        }
      />

      <div className="mt-5 space-y-5">
        {accounts.length === 0 ? (
          <div className="flex flex-col">
            <div className="flex flex-col items-start px-1 gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                YOUR TRADING ACCOUNTS - 0
              </span>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.07]">
                <Check className="h-3.5 w-3.5 text-success/75" />
                Accounts organize your journal only. EdgeScope does not connect to brokers or place
                trades.
              </div>
            </div>

            <div className="mt-5 grid min-h-[300px] place-items-center p-8 text-center rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.06]">
              <div className="max-w-md">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-foreground">
                  No trading accounts yet
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create one to keep actual, practice, and backtest evidence distinct.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110"
                >
                  <Plus className="h-3.5 w-3.5" /> Add trading account
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Left Column - Workspaces List */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Your trading accounts
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary ring-1 ring-primary/20">
                    {accounts.length}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2">
                {isLoading && (
                  <div className="w-[250px] shrink-0 rounded-2xl bg-white/[0.02] p-4 text-center text-xs text-muted-foreground ring-1 ring-white/[0.05]">
                    Loading trading accounts...
                  </div>
                )}
                {accounts.map((a) => {
                  const isSel = selectedId === a.id;
                  const initial = a.name.charAt(0).toUpperCase();
                  const avatarColor = BG_COLORS[a.name.charCodeAt(0) % BG_COLORS.length];

                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={cn(
                        "flex min-h-[116px] w-[270px] shrink-0 items-start gap-4 rounded-2xl p-5 text-left transition-all duration-200",
                        isSel
                          ? "bg-gradient-to-br from-primary/[0.1] to-primary/[0.03] ring-1 ring-primary/30 text-foreground shadow-[var(--shadow-glow)]"
                          : "bg-white/[0.025] ring-1 ring-white/[0.06] text-muted-foreground/80 hover:bg-white/[0.04] hover:text-foreground hover:ring-white/[0.1]",
                        a.status === "archived" && "opacity-70",
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-4">
                        <div
                          className={cn(
                            "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-base font-bold ring-1",
                            avatarColor,
                          )}
                        >
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-base font-bold leading-snug text-foreground">
                              {a.name}
                            </span>
                            {a.is_active && (
                              <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                                Default
                              </span>
                            )}
                            {a.status === "archived" && (
                              <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground ring-1 ring-white/[0.08]">
                                Archived
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/70">
                            <span>{labelForType(a.account_type)}</span>
                            {isSel && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/20">
                                Selected
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column - Workspace Detail */}
            <div className="section-card min-w-0 rounded-2xl p-5 xl:p-6">
              {selected ? (
                <div className="space-y-6">
                  <div className="space-y-3">
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
                    <div className="rounded-2xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]">
                      <div className="rounded-xl bg-white/[0.035] px-4 py-3 text-xs leading-5 text-muted-foreground/85 ring-1 ring-white/[0.06]">
                        Journal reminders only. EdgeScope does not place, block, or manage broker
                        trades.
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="flex items-center gap-3 rounded-xl glow-card px-5 py-5">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-300/85 ring-1 ring-emerald-500/15">
                            <Calculator className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Reference Balance
                            </div>
                            <div className="mt-1.5 text-lg font-bold tracking-tight text-foreground">
                              {selected.starting_balance > 0
                                ? `$${selected.starting_balance.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                                : "Not set"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl glow-card px-5 py-5">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 text-yellow-300/85 ring-1 ring-yellow-500/15">
                            <ShieldAlert className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Max Risk Per Trade
                            </div>
                            <div className="mt-1.5 text-lg font-bold tracking-tight text-foreground">
                              {selected.max_risk_per_trade_pct != null
                                ? `${selected.max_risk_per_trade_pct}%`
                                : "Not set"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl glow-card px-5 py-5">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-red-500/20 to-red-500/5 text-red-300/85 ring-1 ring-red-500/15">
                            <AlertTriangle className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Daily Loss Limit
                            </div>
                            <div className="mt-1.5 text-lg font-bold tracking-tight text-foreground">
                              {selected.daily_loss_limit_pct != null
                                ? `${selected.daily_loss_limit_pct}%`
                                : "Not set"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl glow-card px-5 py-5">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-300/85 ring-1 ring-blue-500/15">
                            <ListChecks className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Max Trades Per Day
                            </div>
                            <div className="mt-1.5 text-lg font-bold tracking-tight text-foreground">
                              {selected.max_trades_per_day != null
                                ? selected.max_trades_per_day
                                : "Not set"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl glow-card px-5 py-5">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary/85 ring-1 ring-primary/15">
                            <Bell className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Journal Reminders
                            </div>
                            <div className="mt-1.5 text-lg font-bold tracking-tight text-foreground">
                              {(guardrailsData?.daily_loss_reminder ?? true) ? "On" : "Off"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                      Account Actions
                    </h4>
                    <div className="rounded-2xl bg-white/[0.025] p-4 sm:p-5 ring-1 ring-white/[0.06]">
                      <button
                        onClick={() =>
                          selected.status === "archived"
                            ? archiveM.mutate("active")
                            : setShowArchiveConfirm(true)
                        }
                        disabled={archiveM.isPending}
                        className="mb-3 flex w-full items-center gap-4 rounded-xl bg-white/[0.025] px-4 py-3.5 text-left text-muted-foreground ring-1 ring-white/[0.06] transition hover:bg-white/[0.045] hover:text-foreground hover:ring-white/[0.1] disabled:opacity-50"
                      >
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.025] text-muted-foreground ring-1 ring-white/[0.08]">
                          {selected.status === "archived" ? (
                            <RotateCcw className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground/90">
                            {selected.status === "archived"
                              ? "Restore trading account"
                              : "Archive trading account"}
                          </div>
                          <div className="mt-0.5 text-[11px] leading-5">
                            {selected.status === "archived"
                              ? "Return this account to capture and selection lists."
                              : "Retire this account from new-trade use while preserving all history."}
                          </div>
                        </div>
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-current opacity-50" />
                      </button>

                      <button
                        onClick={() => canDelete && setShowDeleteConfirm(true)}
                        disabled={!canDelete}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition",
                          canDelete
                            ? "cursor-pointer bg-destructive/[0.03] text-destructive/75 ring-1 ring-destructive/[0.08] hover:bg-destructive/[0.05] hover:text-destructive/85 hover:ring-destructive/[0.15]"
                            : "cursor-not-allowed bg-white/[0.02] text-muted-foreground/72 ring-1 ring-white/[0.06]",
                        )}
                      >
                        <div
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1",
                            canDelete
                              ? "from-destructive/20 to-destructive/5 text-destructive/70 ring-destructive/[0.12]"
                              : "from-white/[0.05] to-white/[0.02] text-muted-foreground/75 ring-white/[0.06]",
                          )}
                        >
                          <Trash2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div
                            className={cn(
                              "text-sm font-semibold",
                              canDelete ? "text-destructive/82" : "text-muted-foreground/88",
                            )}
                          >
                            Delete trading account
                          </div>
                          <div className="mt-0.5 text-[11px] leading-5">
                            {canDelete
                              ? "Delete this empty trading account workspace."
                              : "Only empty trading accounts can be deleted."}
                          </div>
                        </div>
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-current opacity-50" />
                      </button>

                      {!canDelete && (
                        <p className="pl-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                          Trading accounts with logged trades cannot be deleted. Your trade history
                          stays preserved.
                        </p>
                      )}
                    </div>
                  </div>

                  <Dialog
                    open={showEditModal}
                    onOpenChange={(open) => {
                      if (!open) requestEditorClose("edit");
                    }}
                  >
                    <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-md p-6">
                      <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                          <Pencil className="h-4 w-4 text-primary" /> Edit details
                        </DialogTitle>
                      </DialogHeader>
                      <div className="mt-4 space-y-4">
                        <Field
                          label="Trading account name"
                          value={editForm.name}
                          onChange={(v) => setEditForm((f) => ({ ...f, name: v }))}
                          error={
                            editNameDuplicate &&
                            "You already have a trading account with this name."
                          }
                        />
                        <Select
                          label="Trading account type"
                          value={editForm.account_type}
                          onChange={(v) =>
                            setEditForm((f) => ({
                              ...f,
                              account_type: (typeof v === "string"
                                ? v
                                : "personal") as TradingAccount["account_type"],
                            }))
                          }
                          options={editAccountTypeOptions}
                        />
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Evidence type stays fixed so existing history is never reclassified.
                          Create a separate account to move between actual, practice, and research.
                        </p>
                        <Field
                          label="Broker (optional)"
                          value={editForm.broker}
                          placeholder="Exness, Binance, Tradovate"
                          onChange={(v) => setEditForm((f) => ({ ...f, broker: v }))}
                        />
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                          <button
                            type="button"
                            onClick={() =>
                              !selected.is_active &&
                              selected.status === "active" &&
                              setDefaultM.mutate(selected.id)
                            }
                            disabled={
                              selected.is_active ||
                              selected.status === "archived" ||
                              setDefaultM.isPending
                            }
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition",
                              selected.is_active
                                ? "cursor-default bg-white/[0.025] text-foreground ring-1 ring-white/[0.06]"
                                : "bg-white/[0.03] text-foreground ring-1 ring-white/[0.06] hover:bg-primary/10 hover:text-primary hover:ring-primary/20",
                              setDefaultM.isPending && "opacity-60",
                            )}
                          >
                            <span className="inline-flex items-center gap-2">
                              <CheckCircle2
                                className={cn(
                                  "h-4 w-4",
                                  selected.is_active
                                    ? "text-primary/80"
                                    : "text-muted-foreground/70",
                                )}
                              />
                              {selected.status === "archived"
                                ? "Restore before making default"
                                : selected.is_active
                                  ? "Default Trade Account"
                                  : "Set as Default Trade Account"}
                            </span>
                            {selected.is_active && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/15">
                                Default
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end gap-2">
                        <button
                          onClick={() => requestEditorClose("edit")}
                          className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-white/[0.06]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => updateAccountM.mutate()}
                          disabled={
                            updateAccountM.isPending || !editForm.name.trim() || editNameDuplicate
                          }
                          className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
                        >
                          {updateAccountM.isPending ? "Saving..." : "Save changes"}
                        </button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog
                    open={showRulesModal}
                    onOpenChange={(open) => {
                      if (!open) requestEditorClose("rules");
                    }}
                  >
                    <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-md p-6">
                      <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                          <SettingsIcon className="h-4 w-4 text-primary" /> Risk rules & guardrails
                        </DialogTitle>
                      </DialogHeader>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Journal reminders only. EdgeScope does not place, block, or manage broker
                        trades.
                      </p>
                      <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <Field
                            label="Reference balance ($)"
                            type="number"
                            value={rulesForm.starting_balance}
                            placeholder="e.g. 10000"
                            onChange={(v) => setRulesForm((f) => ({ ...f, starting_balance: v }))}
                          />
                          <Field
                            label="Max risk per trade (%)"
                            type="number"
                            value={rulesForm.max_risk_per_trade_pct}
                            placeholder="e.g. 1"
                            onChange={(v) =>
                              setRulesForm((f) => ({ ...f, max_risk_per_trade_pct: v }))
                            }
                          />
                          <Field
                            label="Daily loss limit (%)"
                            type="number"
                            value={rulesForm.daily_loss_limit_pct}
                            placeholder="e.g. 3"
                            onChange={(v) =>
                              setRulesForm((f) => ({ ...f, daily_loss_limit_pct: v }))
                            }
                          />
                          <Field
                            label="Max trades per day"
                            type="number"
                            value={rulesForm.max_trades_per_day}
                            placeholder="e.g. 3"
                            onChange={(v) => setRulesForm((f) => ({ ...f, max_trades_per_day: v }))}
                          />
                        </div>
                        <div className="pt-2">
                          <ToggleRow
                            label="Journal reminder toggle"
                            description="Check to show a reminder when a logged trade exceeds your daily loss limit setting."
                            checked={rulesForm.daily_loss_reminder}
                            onChange={(checked) =>
                              setRulesForm((f) => ({ ...f, daily_loss_reminder: checked }))
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end gap-2">
                        <button
                          onClick={() => requestEditorClose("rules")}
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

                  <ConfirmDialog
                    open={showArchiveConfirm}
                    onOpenChange={setShowArchiveConfirm}
                    title={`Archive "${selected.name}"?`}
                    description="This removes the account from new-trade use and preserves every attached trade and rule. You can restore it later."
                    confirmLabel="Archive trading account"
                    loading={archiveM.isPending}
                    onConfirm={() => archiveM.mutate("archived")}
                  />

                  <ConfirmDialog
                    open={showDeleteConfirm}
                    onOpenChange={setShowDeleteConfirm}
                    title={`Delete "${selected.name}"?`}
                    description="This deletes only the trading account/workspace, not your EdgeScope user account."
                    confirmLabel="Delete trading account"
                    destructive
                    loading={deleteM.isPending}
                    onConfirm={() => deleteM.mutate()}
                  />
                </div>
              ) : (
                <div className="grid h-full min-h-[400px] place-items-center p-8 text-center">
                  <div className="max-w-sm rounded-2xl bg-white/[0.025] px-6 py-8 ring-1 ring-white/[0.05]">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                      <BriefcaseBusiness className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-foreground">Select an account</h3>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {createAccountDialog}
      <ConfirmDialog
        open={discardEditor !== null}
        onOpenChange={(open) => {
          if (!open) setDiscardEditor(null);
        }}
        title="Discard unsaved account changes?"
        description="Your edits in this account form have not been saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          const editor = discardEditor;
          setDiscardEditor(null);
          if (editor) closeEditor(editor);
        }}
      />
    </PageShell>
  );
}

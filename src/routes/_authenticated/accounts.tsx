import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Archive, Star, AlertTriangle, TrendingUp,
  Settings as SettingsIcon, Sparkles, ShieldCheck, User,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import appLogo from "@/assets/edgescope-logo.png.asset.json";
import {
  listTradingAccounts, createTradingAccount, updateTradingAccount,
  archiveTradingAccount, setActiveTradingAccount, deleteTradingAccount,
  type TradingAccount,
} from "@/lib/trading-accounts.functions";
import {
  getGuardrails, upsertGuardrails, type AccountGuardrails,
} from "@/lib/guardrails.functions";
import { getAccountStats } from "@/lib/account-stats.functions";
import {
  Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — EdgeScope" },
      { name: "description", content: "Manage your trading accounts, risk rules and guardrails." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountsPage,
});

/* ---------- shared inputs ---------- */
function Field({ label, value, type = "text", onChange, disabled, placeholder }: {
  label: string; value: string; type?: string; onChange?: (v: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <input
        type={type} value={value} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-1.5 w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-primary/40 focus:ring-2 disabled:opacity-50"
      />
    </label>
  );
}

function Select<T extends string>({ label, value, onChange, options, placeholder = "Select…" }: {
  label: string; value: T | ""; onChange: (v: T | "") => void; options: { value: T; label: string }[]; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <ShadcnSelect value={value || undefined} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="mt-1.5 w-full rounded-xl border-0 bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40 h-auto">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-white/[0.08] bg-popover text-popover-foreground">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="rounded-lg text-sm cursor-pointer">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadcnSelect>
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.05]">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function numOrNull(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v); return isFinite(n) ? n : null;
}
function intOrNull(v: string): number | null {
  const n = numOrNull(v); return n == null ? null : Math.trunc(n);
}
void intOrNull;
function fmtPct(n: number, d = 1) { return `${n.toFixed(d)}%`; }
function labelForType(t: TradingAccount["account_type"]) {
  switch (t) {
    case "funded": return "Funded";
    case "demo": return "Demo";
    case "live": return "Live";
    case "challenge": return "Challenge";
    case "backtest": return "Backtest";
    default: return "Personal";
  }
}

/* ---------- page ---------- */
type AccountTab = "overview" | "performance" | "risk" | "guardrails" | "edit";

function AccountsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTradingAccounts);
  const setActiveFn = useServerFn(setActiveTradingAccount);
  const archiveFn = useServerFn(archiveTradingAccount);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["trading-accounts"], queryFn: () => listFn(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<AccountTab>("overview");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!selectedId && accounts.length > 0) {
      const active = accounts.find((a) => a.is_active);
      setSelectedId(active?.id ?? accounts[0].id);
    }
  }, [accounts, selectedId]);

  const selected = useMemo(() => accounts.find((a) => a.id === selectedId) ?? null, [accounts, selectedId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["trading-accounts"] });
    qc.invalidateQueries({ queryKey: ["trades"] });
  };

  const setActiveM = useMutation({
    mutationFn: (id: string) => setActiveFn({ data: { id } }),
    onSuccess: () => { refresh(); toast.success("Active account switched"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const archiveM = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "archived" }) => archiveFn({ data: vars }),
    onSuccess: () => { refresh(); toast.success("Account updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell>
      <PageHeader
        icon={User}
        eyebrow="Account discipline"
        title="Accounts"
        description="Manage trading accounts, risk rules, and lightweight guardrail reminders."
      />

      <div className="mt-6 flex items-center justify-end">
        <button
          onClick={() => { setShowNew(true); setSelectedId(null); }}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
        <div className="rounded-2xl bg-white/[0.02] p-1 ring-1 ring-white/[0.05]">
          {isLoading && <div className="px-2.5 py-3 text-xs text-muted-foreground">Loading…</div>}
          {!isLoading && accounts.length === 0 && !showNew && (
            <PremiumEmptyState
              icon={User}
              title="No accounts yet"
              description="Add an account to connect trades with risk rules and performance context."
              compact
            />
          )}
          {accounts.map((a) => {
            const isSel = selectedId === a.id && !showNew;
            return (
              <button
                key={a.id}
                onClick={() => { setShowNew(false); setSelectedId(a.id); setTab("overview"); }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all duration-200",
                  isSel ? "bg-primary/10 text-foreground" : "text-muted-foreground/80 hover:bg-white/[0.04] hover:text-foreground",
                  a.status === "archived" && "opacity-60",
                )}
              >
                <span className="truncate">{a.name}</span>
                <span className="flex items-center gap-1">
                  {a.is_active && <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success" title="Active" />}
                  {a.status === "archived" && <Archive className="h-3 w-3" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="min-w-0 glow-card rounded-2xl p-6">
          {showNew ? (
            <AccountEditor mode="create"
              onSaved={(id) => { setShowNew(false); setSelectedId(id); setTab("overview"); refresh(); }}
              onCancel={() => setShowNew(false)}
            />
          ) : selected ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold">{selected.name}</h3>
                    {selected.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" /> Active
                      </span>
                    ) : selected.status === "archived" ? (
                      <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Archived</span>
                    ) : (
                      <button onClick={() => setActiveM.mutate(selected.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-primary/15"
                      >
                        <Star className="h-3 w-3" /> Set Active
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {labelForType(selected.account_type)}
                    {selected.broker ? ` · ${selected.broker}` : ""}
                  </div>
                </div>
              </div>

              <div className="mt-4 inline-flex flex-wrap items-center gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.05]">
                {([
                  { id: "overview", label: "Overview", icon: SettingsIcon },
                  { id: "performance", label: "Performance", icon: TrendingUp },
                  { id: "risk", label: "Risk Rules", icon: AlertTriangle },
                  { id: "guardrails", label: "Guardrails", icon: ShieldCheck },
                  { id: "edit", label: "Edit Details", icon: Sparkles },
                ] as { id: AccountTab; label: string; icon: typeof User }[]).map((t) => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                        tab === t.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                {tab === "overview" && <AccountOverview account={selected}
                  onArchive={() => archiveM.mutate({ id: selected.id, status: selected.status === "archived" ? "active" : "archived" })}
                  onDeleted={() => { setSelectedId(null); refresh(); }}
                />}
                {tab === "performance" && <AccountPerformance account={selected} />}
                {tab === "risk" && <AccountRiskRules account={selected} onSaved={refresh} />}
                {tab === "guardrails" && <AccountGuardrailsPanel account={selected} />}
                {tab === "edit" && <AccountEditor mode="edit" account={selected} onSaved={() => { refresh(); setTab("overview"); }} />}
              </div>
            </div>
          ) : (
            <div className="grid place-items-center p-12 text-center text-sm text-muted-foreground">
              <div>
                <img src={appLogo.url} alt="" className="mx-auto h-16 w-16 object-contain opacity-70" />
                <p className="mt-4">Select an account or add a new one.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function AccountOverview({ account, onArchive, onDeleted }: { account: TradingAccount; onArchive: () => void; onDeleted: () => void }) {
  const deleteFn = useServerFn(deleteTradingAccount);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteM = useMutation({
    mutationFn: () => deleteFn({ data: { id: account.id } }),
    onSuccess: () => { toast.success("Account deleted"); onDeleted(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <InfoCard label="Type" value={labelForType(account.account_type)} />
      <InfoCard label="Broker" value={account.broker || "—"} />
      <InfoCard label="Status" value={account.status === "archived" ? "Archived" : account.is_active ? "Active" : "Inactive"} />
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button onClick={() => setConfirmArchive(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition-all hover:bg-white/[0.07] hover:text-foreground"
        >
          <Archive className="h-3.5 w-3.5" />
          {account.status === "archived" ? "Restore account" : "Archive account"}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={deleteM.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-2 text-xs font-semibold text-destructive ring-1 ring-destructive/20 transition-all hover:bg-destructive/15 disabled:opacity-50"
        >
          {deleteM.isPending ? "Deleting…" : "Delete account"}
        </button>
      </div>
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={account.status === "archived" ? `Restore "${account.name}"?` : `Archive "${account.name}"?`}
        description={account.status === "archived"
          ? "The account will become available again."
          : "The account will be hidden from active views. Its trades stay intact and you can restore later."}
        confirmLabel={account.status === "archived" ? "Restore" : "Archive"}
        onConfirm={() => { onArchive(); setConfirmArchive(false); }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${account.name}"?`}
        description="This permanently deletes the account. Trades on this account will be unlinked but not deleted. This action cannot be undone."
        confirmLabel="Delete account"
        destructive
        loading={deleteM.isPending}
        onConfirm={() => deleteM.mutate()}
      />
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.05]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function AccountPerformance({ account }: { account: TradingAccount }) {
  const getStatsFn = useServerFn(getAccountStats);
  const { data, isLoading } = useQuery({
    queryKey: ["account-stats", account.id],
    queryFn: () => getStatsFn({ data: { account_id: account.id } }),
  });
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading statistics…</div>;

  const row1 = [
    { label: "Win rate", value: fmtPct(data.win_rate) },
    { label: "Avg R multiple", value: data.avg_r_multiple == null ? "—" : `${data.avg_r_multiple.toFixed(2)}R` },
    { label: "Profit factor", value: data.profit_factor == null ? "∞" : data.profit_factor.toFixed(2) },
  ];
  const row2 = [
    { label: "Total trades", value: String(data.total_trades) },
    { label: "Days traded", value: String(data.days_traded) },
  ];
  function MetricCard({ label, value }: { label: string; value: string }) {
    return (
      <div className="rounded-xl bg-white/[0.03] px-5 py-4 ring-1 ring-white/[0.05]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="mt-1.5 text-xl font-bold tabular-nums">{value}</div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {row1.map((s) => <MetricCard key={s.label} {...s} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {row2.map((s) => <MetricCard key={s.label} {...s} />)}
      </div>
    </div>
  );
}

function AccountRiskRules({ account, onSaved }: { account: TradingAccount; onSaved: () => void }) {
  const updateFn = useServerFn(updateTradingAccount);
  const [form, setForm] = useState({
    max_risk_per_trade_pct: account.max_risk_per_trade_pct != null ? String(account.max_risk_per_trade_pct) : "",
    daily_loss_limit_pct: account.daily_loss_limit_pct != null ? String(account.daily_loss_limit_pct) : "",
  });

  const save = useMutation({
    mutationFn: () => updateFn({
      data: {
        id: account.id,
        patch: {
          max_risk_per_trade_pct: numOrNull(form.max_risk_per_trade_pct),
          daily_loss_limit_pct: numOrNull(form.daily_loss_limit_pct),
        },
      },
    }),
    onSuccess: () => { toast.success("Risk rules saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Max risk per trade (%)" type="number" value={form.max_risk_per_trade_pct} placeholder="e.g. 1" onChange={(v) => setForm((f) => ({ ...f, max_risk_per_trade_pct: v }))} />
        <Field label="Daily loss limit (%)" type="number" value={form.daily_loss_limit_pct} placeholder="e.g. 3" onChange={(v) => setForm((f) => ({ ...f, daily_loss_limit_pct: v }))} />
      </div>
      <div className="mt-6 flex justify-end">
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save risk rules"}
        </button>
      </div>
    </div>
  );
}

function AccountGuardrailsPanel({ account }: { account: TradingAccount }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getGuardrails);
  const saveFn = useServerFn(upsertGuardrails);
  const { data, isLoading } = useQuery({
    queryKey: ["guardrails", account.id],
    queryFn: () => getFn({ data: { account_id: account.id } }),
  });

  const [dailyLossReminder, setDailyLossReminder] = useState(true);

  useEffect(() => {
    setDailyLossReminder(data?.daily_loss_reminder ?? true);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      await saveFn({
        data: {
          account_id: account.id,
          patch: { daily_loss_reminder: dailyLossReminder },
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardrails", account.id] });
      toast.success("Guardrails saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  void (data as AccountGuardrails | null);

  return (
    <div>
      <div className="space-y-3">
        <ToggleRow
          label="Remind after daily loss limit hit"
          description="Show a reminder when a logged trade exceeds your daily loss limit setting."
          checked={dailyLossReminder}
          onChange={setDailyLossReminder}
        />
      </div>
      <div className="mt-6 flex justify-end">
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save guardrails"}
        </button>
      </div>
    </div>
  );
}

type EditorForm = {
  name: string;
  account_type: TradingAccount["account_type"];
  broker: string;
};

function AccountEditor({ mode, account, onSaved, onCancel }: {
  mode: "create" | "edit"; account?: TradingAccount;
  onSaved: (id: string) => void; onCancel?: () => void;
}) {
  const createFn = useServerFn(createTradingAccount);
  const updateFn = useServerFn(updateTradingAccount);

  const [form, setForm] = useState<EditorForm>({
    name: account?.name ?? "",
    account_type: account?.account_type ?? "personal",
    broker: account?.broker ?? "",
  });

  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        name: form.name.trim(),
        account_type: form.account_type,
        starting_balance: 0,
        broker: form.broker.trim() || null,
      },
    }),
    onSuccess: (row) => { toast.success("Account created"); onSaved(row.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: () => updateFn({
      data: {
        id: account!.id,
        patch: {
          name: form.name.trim(),
          account_type: form.account_type,
          broker: form.broker.trim() || null,
        },
      },
    }),
    onSuccess: () => { toast.success("Account updated"); onSaved(account!.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = create.isPending || update.isPending;
  const canSave = form.name.trim().length > 0;

  return (
    <div>
      <h3 className="text-base font-bold">{mode === "create" ? "Add Account" : "Edit Details"}</h3>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
        <Select label="Account type" value={form.account_type}
          onChange={(v) => setForm((f) => ({ ...f, account_type: (v || "personal") as EditorForm["account_type"] }))}
          options={[
            { value: "personal", label: "Personal" },
            { value: "live", label: "Live" },
            { value: "demo", label: "Demo" },
            { value: "challenge", label: "Challenge" },
            { value: "funded", label: "Funded" },
            { value: "backtest", label: "Backtest" },
          ]}
        />
        <Field label="Broker (optional)" value={form.broker} onChange={(v) => setForm((f) => ({ ...f, broker: v }))} />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        {mode === "create" && onCancel && (
          <button onClick={onCancel} className="rounded-xl bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
        <button onClick={() => (mode === "create" ? create.mutate() : update.mutate())}
          disabled={pending || !canSave}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Saving…" : mode === "create" ? "Create account" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

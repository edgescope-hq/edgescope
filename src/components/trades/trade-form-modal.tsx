import { motion } from "framer-motion";
import { useState } from "react";
import type { MouseEvent } from "react";
import { X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createTrade, updateTrade, listTrades } from "@/lib/trades.functions";
import { SESSIONS } from "@/lib/trade-constants";
import { localDateKey, localTimeKey, type DbTrade } from "@/lib/trade-mappers";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { listTradingAccounts, createTradingAccount } from "@/lib/trading-accounts.functions";
import { parsePlannedRR } from "@/lib/planned-rr";
import { getGuardrails } from "@/lib/guardrails.functions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EMOTIONS } from "@/lib/emotions";
import type { Taxonomy } from "@/lib/trade-constants";

const modalTransition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
const modalPanelMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.98 },
};

function formatRewardForResult(value: string, result: "WIN" | "LOSS" | "BE"): string {
  const trimmed = value.trim();
  if (!trimmed) return result === "BE" ? "0" : value;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return value;
  if (result === "BE") return "0";
  const signed = result === "LOSS" ? -Math.abs(numeric) : Math.abs(numeric);
  return String(signed);
}

function validatePlannedRRInput(
  val: string,
  isFocused = false,
): { isValid: boolean; parsedValue: number | null } {
  const trimmed = val.trim();
  if (trimmed === "") {
    return { isValid: true, parsedValue: null };
  }
  if (/^\d+(?:\.\d*)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (isFocused) {
      return { isValid: true, parsedValue: Number.isFinite(n) && n > 0 ? n : null };
    } else {
      if (Number.isFinite(n) && n > 0 && !trimmed.endsWith(".")) {
        return { isValid: true, parsedValue: n };
      }
    }
  }
  return { isValid: false, parsedValue: null };
}

function validateRiskAmount(val: string): { isValid: boolean; parsedValue: number | null } {
  const trimmed = val.trim();
  if (trimmed === "") {
    return { isValid: true, parsedValue: null };
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) {
      return { isValid: true, parsedValue: n };
    }
  }
  return { isValid: false, parsedValue: null };
}

function validateProfitLoss(val: string): { isValid: boolean; parsedValue: number | null } {
  const trimmed = val.trim();
  if (trimmed === "") {
    return { isValid: true, parsedValue: null };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      return { isValid: true, parsedValue: n };
    }
  }
  return { isValid: false, parsedValue: null };
}

/**
 * Quick-capture trade form.
 * Goal: log a trade in under 30 seconds. Only the minimum fields are here.
 * Emotion tags are captured here; deeper review fields (reasoning, grade,
 * mistakes, killzone, extra screenshots) live in the trade detail/review screen.
 */
export function TradeFormModal({
  taxonomy = {},
  nextNum,
  onClose,
  onSaved,
  onReviewNow,
  editing,
}: {
  taxonomy?: Taxonomy;
  nextNum: number;
  onClose: () => void;
  onSaved: (savedId?: string) => void;
  onReviewNow?: (savedId: string) => void;
  editing?: DbTrade;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createTrade);
  const update = useServerFn(updateTrade);
  void taxonomy;

  const initSide: "LONG" | "SHORT" = editing?.direction === "short" ? "SHORT" : "LONG";
  const initRes: "WIN" | "LOSS" | "BE" =
    editing?.result === "win"
      ? "WIN"
      : editing?.result === "loss"
        ? "LOSS"
        : editing?.result === "breakeven"
          ? "BE"
          : "WIN";

  const editingExt = editing as DbTrade & {
    risk_amount?: number | string | null;
    reward_amount?: number | string | null;
  };

  const [sym, setSym] = useState(editing?.instrument ?? "");
  const [side, setSide] = useState<"LONG" | "SHORT">(initSide);
  const [res, setRes] = useState<"WIN" | "LOSS" | "BE">(initRes);
  const [riskAmount, setRiskAmount] = useState<string>(
    editingExt?.risk_amount != null ? String(editingExt.risk_amount) : "",
  );
  const [rewardAmount, setRewardAmount] = useState<string>(
    editingExt?.reward_amount != null ? String(editingExt.reward_amount) : "",
  );
  const [plannedRR, setPlannedRR] = useState<string>(
    editing?.planned_rr ? String(editing.planned_rr).replace(/R$/i, "") : "",
  );
  const [isPlannedRRFocused, setIsPlannedRRFocused] = useState(false);
  const initSession = (SESSIONS as readonly { v: string; l: string }[]).some(
    (s) => s.v === editing?.session,
  )
    ? (editing!.session as string)
    : "";
  const [session, setSession] = useState<string>(initSession);
  const [emotionTags, setEmotionTags] = useState<string[]>(editing?.emotion_tags ?? []);
  const toggleEmotion = (key: string) => {
    markDirty();
    setEmotionTags((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [savedTradeId, setSavedTradeId] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  useUnsavedChanges(dirty && !editing);
  const markDirty = () => {
    if (!dirty) setDirty(true);
  };
  const updateResult = (next: "WIN" | "LOSS" | "BE") => {
    markDirty();
    setRes(next);
    setRewardAmount((current) => formatRewardForResult(current, next));
  };

  const createAccountFn = useServerFn(createTradingAccount);

  const riskVal = validateRiskAmount(riskAmount);
  const rewardVal = validateProfitLoss(rewardAmount);
  const plannedVal = validatePlannedRRInput(plannedRR, isPlannedRRFocused);

  const showRiskError = !riskVal.isValid;
  const showRewardError = !rewardVal.isValid;
  const showPlannedError = !plannedVal.isValid;

  const riskNum = riskVal.parsedValue ?? NaN;
  const rawReward = rewardVal.parsedValue ?? NaN;
  const signedReward = Number.isFinite(rawReward)
    ? res === "LOSS"
      ? -Math.abs(rawReward)
      : res === "BE"
        ? 0
        : Math.abs(rawReward)
    : NaN;
  const achievedR =
    Number.isFinite(riskNum) && riskNum > 0 && Number.isFinite(signedReward)
      ? signedReward / riskNum
      : NaN;
  const plannedRRNum = plannedVal.parsedValue ?? NaN;

  // Only instrument is strictly required. Detailed review fields stay in the review screen.
  const errors: string[] = [];
  if (!sym.trim()) errors.push("Instrument is required.");

  const canSubmit = !saving;

  const handleClose = () => {
    if (dirty && !editing) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  };

  const saveM = useMutation({
    mutationFn: async () => {
      const resultDb = res === "WIN" ? "win" : res === "LOSS" ? "loss" : "breakeven";

      if (!editing) {
        // Fallback account creation
        const currentAccounts = await listAccountsFn();
        if (currentAccounts.length === 0) {
          try {
            await createAccountFn({
              data: {
                name: "Personal",
                account_type: "personal",
                starting_balance: 0,
              },
            });
            toast.success("Personal trading account created");
            await qc.invalidateQueries({ queryKey: ["trading-accounts"] });
          } catch (err) {
            console.error("Failed to create default trading account:", err);
          }
        }
      }

      const payload = {
        // Preserve existing values when editing so we don't blank reviewed fields.
        market: (editing?.market ?? "other") as "other",
        instrument: sym.trim(),
        trade_date: editing?.trade_date ?? localDateKey(),
        trade_time: editing?.trade_time ?? localTimeKey(),
        direction: (side === "LONG" ? "long" : "short") as "long" | "short",
        achieved_rr: Number.isFinite(achievedR) ? achievedR : null,
        planned_rr: Number.isFinite(plannedRRNum) ? plannedRRNum.toFixed(2) : null,
        risk_amount: Number.isFinite(riskNum) ? riskNum : null,
        reward_amount: Number.isFinite(signedReward) ? signedReward : null,
        session: session || null,
        result: resultDb as "win" | "loss" | "breakeven",
        // Preserve all deep-review fields verbatim when editing; null on create.
        grade: editing?.grade ?? null,
        reasoning: editing?.reasoning ?? null,
        lessons_learned: editing?.lessons_learned ?? null,
        emotion_before: editing?.emotion_before ?? null,
        emotion_during: editing?.emotion_during ?? null,
        emotion_after: editing?.emotion_after ?? null,
        emotion_tags: emotionTags,
        in_killzone: editing?.in_killzone ?? null,
        categories: editing?.categories ?? [],
        subcategories: editing?.subcategories ?? [],
        mistake_tags: editing?.mistake_tags ?? [],
      };

      const trade = editing
        ? await update({ data: { id: editing.id, patch: payload } })
        : await create({ data: payload });

      return trade;
    },
    onSuccess: (trade) => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["account-stats"] });
      qc.invalidateQueries({ queryKey: ["trading-accounts"] });
      if (editing?.id) qc.invalidateQueries({ queryKey: ["trade", editing.id] });
      setDirty(false);
      const savedId = (trade as { id?: string } | null | undefined)?.id;
      if (editing) {
        toast.success("Trade updated");
        onSaved();
        onClose();
        return;
      }
      toast.success("Trade logged successfully.");
      setSavedTradeId(savedId ?? null);
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "Failed to save trade");
    },
    onSettled: () => setSaving(false),
  });

  // Guardrail check: warn when risk amount exceeds account's Max Risk Per Trade %.
  const listAccountsFn = useServerFn(listTradingAccounts);
  const listTradesFn = useServerFn(listTrades);
  const getGuardrailsFn = useServerFn(getGuardrails);
  const { data: accountList = [] } = useQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => listAccountsFn(),
  });
  const activeAccount = accountList.find((a) => a.is_active) ?? null;
  const { data: guardrails = null } = useQuery({
    queryKey: ["guardrails", activeAccount?.id],
    queryFn: () =>
      activeAccount
        ? getGuardrailsFn({ data: { account_id: activeAccount.id } })
        : Promise.resolve(null),
    enabled: !!activeAccount?.id,
  });
  const { data: tradesForGuardrails = [] } = useQuery({
    queryKey: ["trades"],
    queryFn: () => listTradesFn(),
  });
  const maxRiskPct = activeAccount?.max_risk_per_trade_pct ?? null;
  const dailyLossPct = activeAccount?.daily_loss_limit_pct ?? null;
  const startBal = activeAccount?.starting_balance ?? null;
  const riskPctAttempted =
    Number.isFinite(riskNum) && startBal && startBal > 0 ? (riskNum / startBal) * 100 : null;
  const exceedsMaxRisk =
    maxRiskPct != null && riskPctAttempted != null && riskPctAttempted > maxRiskPct;
  const todayKey = localDateKey();
  const todaysAccountNet = tradesForGuardrails.reduce((sum, t) => {
    if (
      !activeAccount ||
      t.account_id !== activeAccount.id ||
      t.trade_date !== todayKey ||
      t.id === editing?.id ||
      t.is_paper
    )
      return sum;
    const moneyTrade = t as DbTrade & {
      reward_amount?: number | string | null;
      risk_amount?: number | string | null;
    };
    const reward = moneyTrade.reward_amount == null ? NaN : Number(moneyTrade.reward_amount);
    if (Number.isFinite(reward)) return sum + reward;
    const risk = moneyTrade.risk_amount == null ? NaN : Number(moneyTrade.risk_amount);
    const rr = t.achieved_rr == null ? NaN : Number(t.achieved_rr);
    return Number.isFinite(risk) && Number.isFinite(rr) ? sum + risk * rr : sum;
  }, 0);
  const attemptedReward = Number.isFinite(signedReward) ? signedReward : 0;
  const dailyLossAmount =
    dailyLossPct != null && startBal && startBal > 0 ? (startBal * dailyLossPct) / 100 : null;
  const dailyLossReminderOn = guardrails?.daily_loss_reminder ?? true;
  const exceedsDailyLoss =
    !editing &&
    dailyLossReminderOn &&
    dailyLossAmount != null &&
    (todaysAccountNet <= -dailyLossAmount ||
      todaysAccountNet + attemptedReward <= -dailyLossAmount);
  const guardrailMessages = [
    ...(exceedsMaxRisk && maxRiskPct != null && riskPctAttempted != null
      ? [
          `This trade is above your max risk per trade setting (${riskPctAttempted.toFixed(2)}% vs ${maxRiskPct}%).`,
        ]
      : []),
    ...(exceedsDailyLoss && dailyLossAmount != null && dailyLossPct != null
      ? [
          `Your account is at or beyond today's daily loss reminder (${dailyLossPct}% / ${dailyLossAmount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}).`,
        ]
      : []),
  ];
  const shouldShowGuardrailReminder = guardrailMessages.length > 0;
  const [guardrailConfirmOpen, setGuardrailConfirmOpen] = useState(false);

  const onSubmit = () => {
    const cleanedPlanned = plannedRR.trim().replace(/\.$/, "");
    if (cleanedPlanned !== plannedRR) {
      setPlannedRR(cleanedPlanned);
    }
    const finalPlannedVal = validatePlannedRRInput(cleanedPlanned, false);
    if (errors.length > 0 || showRiskError || showRewardError || !finalPlannedVal.isValid) {
      setAttemptedSubmit(true);
      return;
    }
    if (shouldShowGuardrailReminder && !guardrailConfirmOpen) {
      setGuardrailConfirmOpen(true);
      return;
    }
    setSaving(true);
    saveM.mutate();
  };

  const inputClass =
    "mt-1.5 w-full rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/[0.06] transition-all duration-200 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40";
  const labelClass = "text-[10px] font-semibold tracking-[0.16em] text-muted-foreground";

  if (!editing && savedTradeId !== null) {
    const closeSuccess = () => {
      onSaved(savedTradeId);
      onClose();
    };
    const reviewNow = () => {
      if (!savedTradeId) return;
      onSaved(savedTradeId);
      onReviewNow?.(savedTradeId);
      onClose();
    };

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={modalTransition}
        onClick={closeSuccess}
        className="fixed inset-0 z-50 grid place-items-center bg-black/25 backdrop-blur-[2px] p-4"
      >
        <motion.div
          {...modalPanelMotion}
          transition={modalTransition}
          onClick={(e: MouseEvent) => e.stopPropagation()}
          className="glow-card w-full max-w-md rounded-2xl p-6"
        >
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">Trade logged successfully.</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Complete the review now to record your reasoning, mistakes, grade, and chart
                screenshot.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={closeSuccess}
              className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground hover:ring-white/[0.1]"
            >
              Later
            </button>
            <button
              disabled={!savedTradeId}
              onClick={reviewNow}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110 disabled:opacity-40"
            >
              Review now
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={modalTransition}
      onClick={handleClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4"
    >
      <motion.div
        {...modalPanelMotion}
        transition={modalTransition}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="glow-card w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] text-primary">
              QUICK CAPTURE
            </div>
            <h2 className="mt-0.5 text-lg font-bold">
              {editing ? `Edit trade #${nextNum}` : `Log trade #${nextNum}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">
              Capture the essentials now. Review and reflect later.
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className={labelClass}>INSTRUMENT</label>
            <input
              value={sym}
              onChange={(e) => {
                markDirty();
                setSym(e.target.value);
              }}
              placeholder="e.g. BTCUSD"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>SESSION</label>
            {/* Themed listbox instead of a native select — native option rows
                render with the OS default (white) background and can't be styled reliably. */}
            <Select
              value={session || "none"}
              onValueChange={(v) => {
                markDirty();
                setSession(v === "none" ? "" : v);
              }}
            >
              <SelectTrigger
                className={cn(
                  inputClass,
                  "h-auto justify-between border-0 shadow-none data-[placeholder]:text-muted-foreground/50",
                )}
              >
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-white/[0.08] bg-popover">
                <SelectItem value="none">Select session</SelectItem>
                {SESSIONS.map((s) => (
                  <SelectItem key={s.v} value={s.v}>
                    {s.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>SIDE</label>
              <div className="mt-1.5 flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
                {(["LONG", "SHORT"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      markDirty();
                      setSide(s);
                    }}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-xs font-bold tracking-wider transition-all duration-200",
                      side === s
                        ? s === "LONG"
                          ? "bg-success/15 text-success ring-1 ring-success/30"
                          : "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>RESULT</label>
              <div className="mt-1.5 flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
                {(["WIN", "LOSS", "BE"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => updateResult(r)}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-[11px] font-bold tracking-wider transition-all duration-200",
                      res === r
                        ? r === "WIN"
                          ? "bg-success/15 text-success ring-1 ring-success/30"
                          : r === "LOSS"
                            ? "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                            : "bg-info/15 text-info ring-1 ring-info/30"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>RISK AMOUNT</label>
              <input
                value={riskAmount}
                onChange={(e) => {
                  markDirty();
                  setRiskAmount(e.target.value);
                }}
                className={inputClass}
              />
              {showRiskError && (
                <p className="mt-1 text-[11px] text-warning">Enter a valid risk amount.</p>
              )}
            </div>
            <div>
              <label className={labelClass}>PROFIT / LOSS</label>
              <input
                value={rewardAmount}
                onChange={(e) => {
                  markDirty();
                  setRewardAmount(e.target.value);
                }}
                onBlur={() => setRewardAmount((current) => formatRewardForResult(current, res))}
                placeholder={res === "LOSS" ? "e.g. -10" : res === "BE" ? "0" : "e.g. 25"}
                className={inputClass}
              />
              {showRewardError && (
                <p className="mt-1 text-[11px] text-warning">Enter a valid profit/loss amount.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>PLANNED R:R</label>
              <input
                value={plannedRR}
                onChange={(e) => {
                  markDirty();
                  setPlannedRR(e.target.value);
                }}
                onFocus={() => setIsPlannedRRFocused(true)}
                onBlur={() => {
                  setIsPlannedRRFocused(false);
                  setPlannedRR((current) => current.trim().replace(/\.$/, ""));
                }}
                placeholder="e.g. 2.5"
                className={inputClass}
              />
              {showPlannedError && (
                <p className="mt-1 text-[11px] text-warning">
                  Use a positive number, like 0.5, 2, or 2.5.
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>ACHIEVED R</label>
              <div
                className={cn(inputClass, "flex items-center bg-white/[0.02] text-sm tabular-nums")}
              >
                {Number.isFinite(achievedR) ? (
                  <span
                    className={cn(
                      "font-semibold",
                      achievedR > 0 && "text-success",
                      achievedR < 0 && "text-destructive",
                    )}
                  >
                    {achievedR > 0 ? "+" : ""}
                    {achievedR.toFixed(2)}R
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <label className={labelClass}>EMOTIONS</label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Select how you felt during the trade.
                </p>
              </div>
              {emotionTags.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                  {emotionTags.length} selected
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EMOTIONS.map((e) => {
                const active = emotionTags.includes(e.key);
                return (
                  <button
                    key={e.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleEmotion(e.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium ring-1 transition-all duration-200",
                      active
                        ? "bg-primary/20 text-foreground shadow-[0_0_18px_hsl(var(--primary)/0.18)] ring-primary/50"
                        : "bg-white/[0.03] text-muted-foreground ring-white/[0.06] hover:text-foreground hover:ring-white/[0.12]",
                    )}
                  >
                    <span className="text-sm leading-none">{e.emoji}</span>
                    <span>{e.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {errors.length > 0 && attemptedSubmit && (
            <div className="rounded-lg bg-warning/[0.06] px-3 py-2 ring-1 ring-warning/20 space-y-1">
              {errors.map((w) => (
                <div key={w} className="flex items-start gap-2 text-[11px] text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground hover:ring-white/[0.1]"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={onSubmit}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110 disabled:opacity-40"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Log trade"}
          </button>
        </div>
      </motion.div>
      <ConfirmDialog
        open={guardrailConfirmOpen}
        onOpenChange={setGuardrailConfirmOpen}
        title="Risk Rule Reminder"
        description={
          <span className="space-y-2">
            {guardrailMessages.map((message) => (
              <span key={message} className="block">
                {message}
              </span>
            ))}
            <span className="block">
              EdgeScope is reminding you so you can make a conscious decision, not blocking the
              trade.
            </span>
          </span>
        }
        confirmLabel="Continue Logging"
        cancelLabel="Review Trade"
        onConfirm={() => {
          setGuardrailConfirmOpen(false);
          setSaving(true);
          saveM.mutate();
        }}
      />
      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="Discard unsaved trade?"
        description="Your unsaved Quick Capture changes will be lost."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          setDirty(false);
          setDiscardConfirmOpen(false);
          onClose();
        }}
      />
    </motion.div>
  );
}

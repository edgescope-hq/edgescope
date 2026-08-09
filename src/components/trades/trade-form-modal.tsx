import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { X, AlertTriangle, Check } from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  addScreenshot,
  createTrade,
  deleteScreenshot,
  getTrade,
  replaceScreenshot,
  updateTrade,
  listTrades,
} from "@/lib/trades.functions";
import { supabase } from "@/integrations/supabase/client";
import { validateScreenshotFile } from "@/lib/file-validation";
import { localDateKey, localTimeKey, type DbTrade } from "@/lib/trade-mappers";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { listTradingAccounts, createTradingAccount } from "@/lib/trading-accounts.functions";
import { parsePlannedRR } from "@/lib/planned-rr";
import { getGuardrails } from "@/lib/guardrails.functions";
import { getTradingPreferences } from "@/lib/trading-preferences.functions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { QUICK_CAPTURE_EMOTIONS } from "@/lib/emotions";
import type { Taxonomy } from "@/lib/trade-constants";
import { createTradeCategory, listTradeCategories } from "@/lib/trade-categories.functions";
import { getTradeShares, listMyGroups, shareTradeToGroups } from "@/lib/groups.functions";
import {
  appearsInPlacement,
  journalTrackingFromPreferences,
  screenshotSlotsFromPreferences,
  SCREENSHOT_TIMEFRAMES,
  type ScreenshotTimeframe,
  ENTRY_TIMEFRAMES,
  MARKET_CONDITIONS,
  NEWS_INVOLVEMENT,
  EXIT_REASONS,
  TRADE_MANAGEMENT_ACTIONS,
  normalizeTags,
  normalizeTradeManagement,
  toggleTradeManagement,
} from "@/lib/journal-tracking";
import { TradeDatePicker } from "@/components/trades/trade-date-picker";
import { ScreenshotViewer } from "@/components/trades/screenshot-viewer";
import { ScreenshotSlot } from "@/components/trades/screenshot-slot";
import { SessionSelect } from "@/components/trades/session-select";
import { CreatableCombobox, DarkSelect, TagInput } from "@/components/trades/trade-field-controls";
import { ClearTextButton } from "@/components/ui/search-input";

const DEFAULT_MISTAKE_TAGS = [
  "FOMO",
  "Revenge trade",
  "Early entry",
  "Late entry",
  "Moved SL",
  "No confirmation",
  "Overtrading",
  "Exited early",
  "Risk too high",
  "Wrong session",
  "Broke plan",
] as const;

const modalTransition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
const modalPanelMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.98 },
};

const gradeTone = (g: string) => {
  if (g === "A+") return "bg-success/20 text-success ring-success/40";
  if (g === "A") return "bg-success/15 text-success ring-success/30";
  if (g === "B") return "bg-info/15 text-info ring-info/30";
  if (g === "C") return "bg-warning/15 text-warning ring-warning/30";
  if (g === "D") return "bg-destructive/15 text-destructive ring-destructive/30";
  return "";
};

function formatRewardForResult(value: string, result: "WIN" | "LOSS" | "BE" | null): string {
  const trimmed = value.trim();
  if (!trimmed || result == null) return value;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return value;
  if (result === "BE") return "0";
  return String(Math.abs(numeric));
}

function validatePlannedRRInput(
  val: string,
  isFocused = false,
): { isValid: boolean; parsedValue: number | null } {
  const trimmed = val.trim();
  if (trimmed === "") {
    return { isValid: true, parsedValue: null };
  }
  if (isFocused && (/^\d+(?:\.\d*)?$/.test(trimmed) || /^1:\d*(?:\.\d*)?$/.test(trimmed))) {
    return { isValid: true, parsedValue: parsePlannedRR(trimmed) };
  }
  return { isValid: parsePlannedRR(trimmed) !== null, parsedValue: parsePlannedRR(trimmed) };
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
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
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
  editing,
}: {
  taxonomy?: Taxonomy;
  nextNum: number;
  onClose: () => void;
  onSaved: (savedId?: string) => void;
  editing?: DbTrade;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createTrade);
  const update = useServerFn(updateTrade);
  const getTradeFn = useServerFn(getTrade);
  void taxonomy;

  const initSide: "LONG" | "SHORT" | null =
    editing?.direction === "short" ? "SHORT" : editing?.direction === "long" ? "LONG" : null;
  const initRes: "WIN" | "LOSS" | "BE" | null =
    editing?.result === "win"
      ? "WIN"
      : editing?.result === "loss"
        ? "LOSS"
        : editing?.result === "breakeven"
          ? "BE"
          : null;

  const editingExt = editing as DbTrade & {
    risk_amount?: number | string | null;
    reward_amount?: number | string | null;
    pnl_amount?: number | string | null;
  };

  const [sym, setSym] = useState(editing?.instrument ?? "");
  const instrumentInputRef = useRef<HTMLInputElement>(null);
  const instrumentWrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent | globalThis.TouchEvent) => {
      if (instrumentWrapperRef.current && !instrumentWrapperRef.current.contains(event.target as Node)) {
        setInstrumentOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);
  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const [instrumentIndex, setInstrumentIndex] = useState(0);
  const [side, setSide] = useState<"LONG" | "SHORT" | null>(initSide);
  const [res, setRes] = useState<"WIN" | "LOSS" | "BE" | null>(initRes);
  const [riskAmount, setRiskAmount] = useState<string>(
    editingExt?.risk_amount != null ? String(editingExt.risk_amount) : "",
  );
  const [rewardAmount, setRewardAmount] = useState<string>(
    editingExt?.pnl_amount != null || editingExt?.reward_amount != null
      ? String(Math.abs(Number(editingExt.pnl_amount ?? editingExt.reward_amount)))
      : "",
  );
  const [beAutoZero, setBeAutoZero] = useState(initRes === "BE");
  const [plannedRR, setPlannedRR] = useState<string>(
    editing?.planned_rr ? String(editing.planned_rr).replace(/R$/i, "") : "",
  );
  const [isPlannedRRFocused, setIsPlannedRRFocused] = useState(false);
  const [tradeDate, setTradeDate] = useState(editing?.trade_date ?? localDateKey());
  const [session, setSession] = useState<string>(editing?.session ?? "");
  const [emotionTags, setEmotionTags] = useState<string[]>(editing?.emotion_tags ?? []);
  const [entryModel, setEntryModel] = useState(editing?.entry_model ?? "");
  const [marketCondition, setMarketCondition] = useState(editing?.market_condition ?? "");
  const [entryTimeframe, setEntryTimeframe] = useState(editing?.entry_timeframe ?? "");
  const [newsInvolvement, setNewsInvolvement] = useState(editing?.news_involvement ?? "");
  const [customTags, setCustomTags] = useState<string[]>(editing?.custom_tags ?? []);
  const [category, setCategory] = useState((editing?.categories ?? [])[0] ?? "");
  const [reasoning, setReasoning] = useState(editing?.reasoning ?? "");
  const [grade, setGrade] = useState(editing?.grade ?? "");
  const [inKillzone, setInKillzone] = useState<boolean | null>(editing?.in_killzone ?? null);
  const [exitReason, setExitReason] = useState(editing?.exit_reason ?? "");
  const [tradeManagement, setTradeManagement] = useState<string[]>(editing?.trade_management ?? []);
  const [mistakeTags, setMistakeTags] = useState<string[]>(editing?.mistake_tags ?? []);
  const [sharedGroupIds, setSharedGroupIds] = useState<string[]>([]);
  const [rewardFocused, setRewardFocused] = useState(false);
  const [quickScreenshotFiles, setQuickScreenshotFiles] = useState<
    Partial<Record<ScreenshotTimeframe, File>>
  >({});
  const [removedScreenshotIds, setRemovedScreenshotIds] = useState<string[]>([]);
  const [previewScreenshot, setPreviewScreenshot] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const toggleEmotion = (key: string) => {
    markDirty();
    setEmotionTags((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  useUnsavedChanges(dirty);
  const markDirty = () => {
    if (!dirty) setDirty(true);
  };
  const updateResult = (next: "WIN" | "LOSS" | "BE") => {
    markDirty();
    const leavingAutomaticBreakeven = res === "BE" && beAutoZero;
    if (res === next) {
      setRes(null);
      setBeAutoZero(false);
      setRewardAmount((current) => (leavingAutomaticBreakeven ? "" : current));
      return;
    }
    setRes(next);
    if (next === "BE") {
      setBeAutoZero(true);
      setRewardAmount("0");
      return;
    }
    setBeAutoZero(false);
    setRewardAmount((current) =>
      leavingAutomaticBreakeven ? "" : formatRewardForResult(current, next),
    );
  };

  const createAccountFn = useServerFn(createTradingAccount);
  const createCategoryFn = useServerFn(createTradeCategory);
  const listCategoriesFn = useServerFn(listTradeCategories);
  const listGroupsFn = useServerFn(listMyGroups);
  const getSharesFn = useServerFn(getTradeShares);
  const shareTradeFn = useServerFn(shareTradeToGroups);
  const addScreenshotFn = useServerFn(addScreenshot);
  const deleteScreenshotFn = useServerFn(deleteScreenshot);
  const replaceScreenshotFn = useServerFn(replaceScreenshot);
  const { data: categoryRows = [] } = useQuery({
    queryKey: ["trade-categories"],
    queryFn: () => listCategoriesFn(),
  });
  const { data: myGroups = [] } = useQuery({
    queryKey: ["my-groups"],
    queryFn: () => listGroupsFn(),
  });
  const { data: initialShares } = useQuery({
    queryKey: ["trade-shares", editing?.id],
    queryFn: () => getSharesFn({ data: { tradeId: editing!.id } }),
    enabled: Boolean(editing?.id),
  });
  const { data: editingTradeData } = useQuery({
    queryKey: ["trade", editing?.id],
    queryFn: () => getTradeFn({ data: { id: editing!.id } }),
    enabled: Boolean(editing?.id),
  });
  const existingScreenshots = useMemo(
    () =>
      (editingTradeData?.screenshots ?? []) as {
        id: string;
        caption: string | null;
        url: string | null;
      }[],
    [editingTradeData?.screenshots],
  );
  const existingScreenshotByTimeframe = useMemo(
    () =>
      new Map(
        existingScreenshots
          .filter(
            (screenshot) =>
              screenshot.caption &&
              SCREENSHOT_TIMEFRAMES.includes(screenshot.caption as ScreenshotTimeframe) &&
              !removedScreenshotIds.includes(screenshot.id),
          )
          .map((screenshot) => [screenshot.caption as ScreenshotTimeframe, screenshot]),
      ),
    [existingScreenshots, removedScreenshotIds],
  );
  const quickScreenshotPreviewUrls = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(quickScreenshotFiles).map(([timeframe, file]) => [
          timeframe,
          URL.createObjectURL(file),
        ]),
      ) as Partial<Record<ScreenshotTimeframe, string>>,
    [quickScreenshotFiles],
  );
  useEffect(
    () => () => {
      Object.values(quickScreenshotPreviewUrls).forEach((url) => URL.revokeObjectURL(url));
    },
    [quickScreenshotPreviewUrls],
  );
  useEffect(() => {
    if (editing?.id && initialShares) setSharedGroupIds(initialShares.groupIds);
  }, [editing?.id, initialShares]);
  const { data: sharedTradesCount = 0 } = useQuery({
    queryKey: ["shared-trades-count"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return 0;
      const { data, error } = await supabase
        .from("community_trade_shares")
        .select("trade_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.trade_id)).size;
    },
  });

  const riskVal = validateRiskAmount(riskAmount);
  const rewardVal = validateProfitLoss(rewardAmount);
  const plannedVal = validatePlannedRRInput(plannedRR, isPlannedRRFocused);

  const showRiskError = !riskVal.isValid;
  const showRewardError = !rewardVal.isValid;
  const showPlannedError = !plannedVal.isValid;

  const riskNum = riskVal.parsedValue ?? NaN;
  const rawReward = rewardVal.parsedValue ?? NaN;
  const signedReward =
    Number.isFinite(rawReward) && res != null
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

  const errors: string[] = [];
  const canSubmit = !saving && sym.trim().length > 0 && side !== null && res !== null && (!editing || dirty);

  const handleClose = useCallback(
    (_initiator?: HTMLElement | null) => {
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleClose(document.activeElement as HTMLElement | null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const saveM = useMutation({
    mutationFn: async () => {
      const resultDb =
        res === "WIN" ? "win" : res === "LOSS" ? "loss" : res === "BE" ? "breakeven" : null;

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
        instrument: sym.trim().toUpperCase() || null,
        trade_date: tradeDate,
        trade_time: editing?.trade_time ?? localTimeKey(),
        direction: side === "LONG" ? "long" : side === "SHORT" ? "short" : null,
        achieved_rr:
          appearsInPlacement(tracking, "r_performance", "quick_capture") &&
          Number.isFinite(achievedR)
            ? achievedR
            : (editing?.achieved_rr ?? null),
        planned_rr: appearsInPlacement(tracking, "planned_rr", "quick_capture")
          ? Number.isFinite(plannedRRNum)
            ? plannedRRNum.toFixed(2)
            : null
          : (editing?.planned_rr ?? null),
        risk_amount: appearsInPlacement(tracking, "r_performance", "quick_capture")
          ? Number.isFinite(riskNum)
            ? riskNum
            : null
          : (editing?.risk_amount ?? null),
        reward_amount: appearsInPlacement(tracking, "r_performance", "quick_capture")
          ? Number.isFinite(signedReward)
            ? signedReward
            : null
          : (editing?.reward_amount ?? null),
        pnl_amount: appearsInPlacement(tracking, "r_performance", "quick_capture")
          ? Number.isFinite(signedReward)
            ? signedReward
            : null
          : (editing?.pnl_amount ?? null),
        session: appearsInPlacement(tracking, "session", "quick_capture")
          ? session || null
          : (editing?.session ?? null),
        result: resultDb as "win" | "loss" | "breakeven" | null,
        // Preserve all deep-review fields verbatim when editing; null on create.
        grade: appearsInPlacement(tracking, "grade", "quick_capture")
          ? grade || null
          : (editing?.grade ?? null),
        reasoning: appearsInPlacement(tracking, "reasoning", "quick_capture")
          ? reasoning.trim() || null
          : (editing?.reasoning ?? null),
        lessons_learned: editing?.lessons_learned ?? null,
        emotion_before: editing?.emotion_before ?? null,
        emotion_during: editing?.emotion_during ?? null,
        emotion_after: editing?.emotion_after ?? null,
        emotion_tags: appearsInPlacement(tracking, "emotions", "quick_capture")
          ? emotionTags
          : (editing?.emotion_tags ?? []),
        in_killzone: appearsInPlacement(tracking, "killzone", "quick_capture")
          ? inKillzone
          : (editing?.in_killzone ?? null),
        categories: appearsInPlacement(tracking, "category", "quick_capture")
          ? category.trim()
            ? [category.trim()]
            : []
          : (editing?.categories ?? []),
        subcategories: editing?.subcategories ?? [],
        mistake_tags: appearsInPlacement(tracking, "mistakes", "quick_capture")
          ? mistakeTags
          : (editing?.mistake_tags ?? []),
        entry_model: appearsInPlacement(tracking, "entry_model", "quick_capture")
          ? entryModel
          : (editing?.entry_model ?? null),
        market_condition: appearsInPlacement(tracking, "market_condition", "quick_capture")
          ? marketCondition
          : (editing?.market_condition ?? null),
        entry_timeframe: appearsInPlacement(tracking, "entry_timeframe", "quick_capture")
          ? entryTimeframe
          : (editing?.entry_timeframe ?? null),
        news_involvement: appearsInPlacement(tracking, "news_involvement", "quick_capture")
          ? newsInvolvement
          : (editing?.news_involvement ?? null),
        exit_reason: appearsInPlacement(tracking, "exit_reason", "quick_capture")
          ? exitReason
          : (editing?.exit_reason ?? null),
        trade_management: appearsInPlacement(tracking, "trade_management", "quick_capture")
          ? normalizeTradeManagement(tradeManagement)
          : (editing?.trade_management ?? []),
        custom_tags: appearsInPlacement(tracking, "custom_tags", "quick_capture")
          ? normalizeTags(customTags)
          : (editing?.custom_tags ?? []),
      };

      if (appearsInPlacement(tracking, "category", "quick_capture") && category.trim()) {
        await createCategoryFn({ data: category.trim() });
      }

      const trade = editing
        ? await update({ data: { id: editing.id, patch: payload } })
        : await create({ data: payload });
      const tradeId = (trade as { id?: string }).id;
      const screenshotEntries = Object.entries(quickScreenshotFiles) as [
        ScreenshotTimeframe,
        File,
      ][];
      let screenshotError: string | null = null;
      if (tradeId && (screenshotEntries.length || removedScreenshotIds.length)) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not signed in");
          for (const screenshotId of new Set(removedScreenshotIds)) {
            await deleteScreenshotFn({ data: { id: screenshotId } });
          }
          for (const [timeframe, file] of screenshotEntries) {
            const fileError = validateScreenshotFile(file);
            if (fileError) throw new Error(`${file.name}: ${fileError}`);
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `${user.id}/${tradeId}/${Date.now()}-${safeName}`;
            const { error: uploadError } = await supabase.storage
              .from("trade-screenshots")
              .upload(storagePath, file, { upsert: false });
            if (uploadError) throw new Error(uploadError.message);
            try {
              const existing = existingScreenshots.find(
                (screenshot) =>
                  screenshot.caption === timeframe && !removedScreenshotIds.includes(screenshot.id),
              );
              if (existing) {
                await replaceScreenshotFn({
                  data: {
                    id: existing.id,
                    storage_path: storagePath,
                    kind: "before",
                    caption: timeframe,
                  },
                });
              } else {
                await addScreenshotFn({
                  data: {
                    trade_id: tradeId,
                    storage_path: storagePath,
                    kind: "before",
                    caption: timeframe,
                  },
                });
              }
            } catch (error) {
              await supabase.storage.from("trade-screenshots").remove([storagePath]);
              throw error;
            }
          }
        } catch (error) {
          screenshotError = error instanceof Error ? error.message : "Screenshot upload failed";
        }
      }
      let shareError: string | null = null;
      if (
        tradeId &&
        appearsInPlacement(tracking, "community", "quick_capture") &&
        sharedGroupIds.length > 0
      ) {
        try {
          await shareTradeFn({
            data: { tradeId, groupIds: sharedGroupIds, includeReasoning: true },
          });
        } catch (error) {
          shareError = error instanceof Error ? error.message : "Community sharing failed";
        }
      }
      return { trade, screenshotError, shareError };
    },
    onSuccess: (result) => {
      const savedId = (result.trade as { id?: string } | null | undefined)?.id;
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["account-stats"] });
      qc.invalidateQueries({ queryKey: ["trading-accounts"] });
      qc.invalidateQueries({ queryKey: ["shared-trades-count"] });
      if (savedId) qc.invalidateQueries({ queryKey: ["trade-shares", savedId] });
      if (editing?.id) qc.invalidateQueries({ queryKey: ["trade", editing.id] });
      setDirty(false);
      if (result.screenshotError) {
        toast.error(`Trade saved. Screenshots were not uploaded: ${result.screenshotError}`);
      }
      if (result.shareError) {
        toast.error(`Trade saved privately. Sharing failed: ${result.shareError}`);
      }
      if (editing) {
        if (result.shareError) {
          setDirty(true);
          return;
        }
        toast.success("Trade updated");
        onSaved();
        onClose();
        return;
      }
      if (!result.shareError) toast.success("Trade logged successfully.");
      onSaved(savedId);
      onClose();
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
  const earliestTradeYear = useMemo(() => {
    const years = (tradesForGuardrails as DbTrade[])
      .map((trade) => Number(trade.trade_date?.slice(0, 4)))
      .filter(Number.isInteger);
    return years.length ? Math.min(...years) : new Date().getFullYear();
  }, [tradesForGuardrails]);
  const instrumentSuggestions = useMemo(() => {
    const needle = sym.trim().toLocaleUpperCase();
    const seen = new Map<string, { value: string; count: number; recent: string }>();
    for (const trade of tradesForGuardrails as DbTrade[]) {
      const value = trade.instrument?.trim().toLocaleUpperCase();
      if (!value) continue;
      const prior = seen.get(value);
      seen.set(value, {
        value,
        count: (prior?.count ?? 0) + 1,
        recent:
          [prior?.recent, trade.created_at ?? trade.trade_date ?? ""]
            .filter(Boolean)
            .sort()
            .at(-1) ?? "",
      });
    }
    return [...seen.values()]
      .filter(({ value }) => needle.length > 0 && value.includes(needle))
      .sort((a, b) => {
        const score = (item: typeof a) =>
          item.value === needle ? 3 : item.value.startsWith(needle) ? 2 : 1;
        return score(b) - score(a) || b.count - a.count || b.recent.localeCompare(a.recent);
      })
      .slice(0, 4);
  }, [sym, tradesForGuardrails]);
  const categorySuggestions = useMemo(
    () =>
      categoryRows
        .filter((row) => !row.archived_at)
        .map((row) => row.name)
        .filter(
          (name, index, values) =>
            values.findIndex((value) => value.toLowerCase() === name.toLowerCase()) === index,
        ),
    [categoryRows],
  );
  const entryModelSuggestions = useMemo(
    () => [
      ...new Set(
        (tradesForGuardrails as DbTrade[])
          .map((trade) => trade.entry_model?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    [tradesForGuardrails],
  );
  const customTagSuggestions = useMemo(
    () => [
      ...new Set((tradesForGuardrails as DbTrade[]).flatMap((trade) => trade.custom_tags ?? [])),
    ],
    [tradesForGuardrails],
  );
  const getPrefsFn = useServerFn(getTradingPreferences);
  const { data: prefsData = null } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => getPrefsFn(),
  });
  const tracking = journalTrackingFromPreferences(prefsData?.journal_tracking);
  const screenshotSlots = screenshotSlotsFromPreferences(prefsData?.journal_tracking);
  const hasEnabledScreenshotSlots = SCREENSHOT_TIMEFRAMES.some(
    (timeframe) => screenshotSlots[timeframe].enabled,
  );
  const recentSessionIds = useMemo(
    () =>
      [
        ...new Set(
          (tradesForGuardrails as DbTrade[]).map((trade) => trade.session).filter(Boolean),
        ),
      ].slice(0, 8) as string[],
    [tradesForGuardrails],
  );
  const maxRiskPct = activeAccount?.max_risk_per_trade_pct ?? null;
  const dailyLossPct = activeAccount?.daily_loss_limit_pct ?? null;
  const startBal = activeAccount?.starting_balance ?? null;
  const riskPctAttempted =
    Number.isFinite(riskNum) && startBal && startBal > 0 ? (riskNum / startBal) * 100 : null;
  const exceedsMaxRisk =
    maxRiskPct != null && riskPctAttempted != null && riskPctAttempted > maxRiskPct;
  const maxTradesPerDay = prefsData?.max_trades_per_day ?? null;
  const todayKey = localDateKey();
  const todayTradeCount = tradesForGuardrails.filter((t) => {
    if (t.is_paper) return false;
    if (activeAccount && t.account_id !== activeAccount.id) return false;
    if (t.id === editing?.id) return false;
    if (t.trade_date !== todayKey) return false;
    return true;
  }).length;
  const exceedsMaxTrades =
    maxTradesPerDay != null && !editing && todayTradeCount >= maxTradesPerDay;
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
  const balanceNotSet =
    (maxRiskPct != null || dailyLossPct != null) && (!startBal || startBal <= 0);
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
    ...(exceedsMaxTrades && maxTradesPerDay != null
      ? [
          `You have logged ${todayTradeCount} trade${todayTradeCount === 1 ? "" : "s"} today — at or above your max trades per day (${maxTradesPerDay}).`,
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={modalTransition}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose(event.currentTarget);
      }}
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
            <h2 className="mt-0.5 text-lg font-bold">{editing ? "Edit trade" : "Log trade"}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">
              Capture the essentials now. Review and reflect later.
            </p>
          </div>
          <button
            type="button"
            onClick={(event) => handleClose(event.currentTarget)}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="relative" ref={instrumentWrapperRef}>
            <label className={labelClass}>INSTRUMENT</label>
            <input
              ref={instrumentInputRef}
              value={sym}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={instrumentOpen && instrumentSuggestions.length > 0}
              aria-controls="instrument-suggestions"
              onFocus={() => setInstrumentOpen(true)}
              onChange={(e) => {
                markDirty();
                setSym(e.target.value);
                setInstrumentIndex(0);
                setInstrumentOpen(true);
              }}
              onKeyDown={(event) => {
                if (!instrumentSuggestions.length) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setInstrumentOpen(true);
                  setInstrumentIndex((index) =>
                    Math.min(index + 1, instrumentSuggestions.length - 1),
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setInstrumentIndex((index) => Math.max(index - 1, 0));
                }
                if (event.key === "Escape") setInstrumentOpen(false);
                if (event.key === "Enter" && instrumentOpen) {
                  event.preventDefault();
                  const match = instrumentSuggestions[instrumentIndex];
                  if (match) {
                    markDirty();
                    setSym(match.value);
                    setInstrumentOpen(false);
                  }
                }
              }}
              placeholder="e.g. BTCUSD"
              className={cn(inputClass, "pr-10")}
            />
            <ClearTextButton
              value={sym}
              onClear={() => {
                markDirty();
                setSym("");
                setInstrumentIndex(0);
                setInstrumentOpen(true);
              }}
              inputRef={instrumentInputRef}
              className="top-[calc(50%+0.45rem)]"
            />
            {instrumentOpen && sym.trim().length > 0 && instrumentSuggestions.length > 0 && (
              <div
                id="instrument-suggestions"
                role="listbox"
                className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl bg-popover p-1 shadow-[var(--shadow-elevated)] ring-1 ring-white/[0.09]"
              >
                {instrumentSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.value}
                    type="button"
                    role="option"
                    aria-selected={index === instrumentIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      markDirty();
                      setSym(suggestion.value);
                      setInstrumentOpen(false);
                    }}
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      index === instrumentIndex
                        ? "bg-white/[0.07] text-foreground ring-1 ring-white/[0.08]"
                        : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                    )}
                  >
                    {suggestion.value}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>SIDE</label>
              <div className="mt-1.5 flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
                {(["LONG", "SHORT"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={side === s}
                    onClick={() => {
                      markDirty();
                      setSide((current) => (current === s ? null : s));
                    }}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-xs font-bold tracking-wider transition-all duration-200",
                      side === s
                        ? "bg-primary/16 text-foreground ring-1 ring-primary/35"
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
                    aria-pressed={res === r}
                    onClick={() => updateResult(r)}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-[11px] font-bold tracking-wider transition-all duration-200",
                      res === r
                        ? r === "WIN"
                          ? "bg-success/10 text-success ring-1 ring-success/20"
                          : r === "LOSS"
                            ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
                            : "bg-info/10 text-info ring-1 ring-info/20"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>TRADE DATE</label>
            <TradeDatePicker
              value={tradeDate}
              earliestTradeYear={earliestTradeYear}
              onChange={(value) => {
                markDirty();
                setTradeDate(value);
              }}
              className="mt-1.5"
            />
          </div>

          {appearsInPlacement(tracking, "session", "quick_capture") && (
            <div>
              <label className={labelClass}>SESSION</label>
              <SessionSelect
                value={session}
                recentSessionIds={recentSessionIds}
                onValueChange={(value) => {
                  markDirty();
                  setSession(value);
                }}
                triggerClassName={cn(
                  inputClass,
                  "h-auto justify-between border-0 shadow-none",
                )}
              />
            </div>
          )}

          {appearsInPlacement(tracking, "category", "quick_capture") && (
            <label>
              <span className={labelClass}>CATEGORY / SETUP</span>
              <CreatableCombobox
                value={category}
                suggestions={categorySuggestions}
                placeholder="Select or add category"
                onValueChange={(value) => {
                  markDirty();
                  setCategory(value);
                }}
              />
            </label>
          )}

          {appearsInPlacement(tracking, "entry_model", "quick_capture") && (
            <label>
              <span className={labelClass}>ENTRY MODEL / TRIGGER</span>
              <CreatableCombobox
                value={entryModel}
                suggestions={entryModelSuggestions}
                placeholder="Select or add entry model"
                onValueChange={(value) => {
                  markDirty();
                  setEntryModel(value);
                }}
              />
            </label>
          )}

          {appearsInPlacement(tracking, "market_condition", "quick_capture") && (
            <label>
              <span className={labelClass}>MARKET CONDITION</span>
              <DarkSelect
                value={marketCondition}
                options={MARKET_CONDITIONS}
                placeholder="Select market condition"
                onValueChange={(value) => {
                  markDirty();
                  setMarketCondition(value);
                }}
              />
            </label>
          )}

          {appearsInPlacement(tracking, "entry_timeframe", "quick_capture") && (
            <label>
              <span className={labelClass}>ENTRY TIMEFRAME</span>
              <DarkSelect
                value={entryTimeframe}
                options={ENTRY_TIMEFRAMES}
                searchable
                placeholder="Select entry timeframe"
                onValueChange={(value) => {
                  markDirty();
                  setEntryTimeframe(value);
                }}
              />
            </label>
          )}

          {appearsInPlacement(tracking, "news_involvement", "quick_capture") && (
            <label>
              <span className={labelClass}>NEWS INVOLVEMENT</span>
              <DarkSelect
                value={newsInvolvement}
                options={NEWS_INVOLVEMENT}
                placeholder="Select news involvement"
                onValueChange={(value) => {
                  markDirty();
                  setNewsInvolvement(value);
                }}
              />
            </label>
          )}

          {appearsInPlacement(tracking, "custom_tags", "quick_capture") && (
            <div>
              <span className={labelClass}>CUSTOM TAGS</span>
              <TagInput
                values={customTags}
                suggestions={customTagSuggestions}
                onChange={(values) => {
                  markDirty();
                  setCustomTags(values);
                }}
              />
            </div>
          )}

          {appearsInPlacement(tracking, "r_performance", "quick_capture") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label className={labelClass}>RISK AMOUNT</label>
                <input
                  value={riskAmount}
                  onChange={(e) => {
                    markDirty();
                    setRiskAmount(e.target.value);
                  }}
                  placeholder="e.g. 10"
                  className={inputClass}
                />
                {showRiskError && (
                  <p className="mt-1 text-[11px] text-warning">
                    Enter a positive finite risk amount.
                  </p>
                )}
              </div>
              <div className="relative">
                <label className={labelClass}>
                  {res === "WIN"
                    ? "PROFIT AMOUNT"
                    : res === "LOSS"
                      ? "LOSS AMOUNT"
                      : "PROFIT / LOSS"}
                </label>
                <input
                  value={rewardAmount}
                  onChange={(e) => {
                    markDirty();
                    setRewardAmount(e.target.value);
                  }}
                  onFocus={() => setRewardFocused(true)}
                  onBlur={() => {
                    setRewardFocused(false);
                    setRewardAmount((current) => formatRewardForResult(current, res));
                  }}
                  placeholder="e.g. 10"
                  disabled={res === "BE"}
                  className={cn(inputClass, res === "BE" && "cursor-not-allowed opacity-55")}
                />
                {showRewardError && (
                  <p className="mt-1 text-[11px] text-warning">Enter a positive finite amount.</p>
                )}
                {rewardFocused &&
                  !rewardAmount.trim() &&
                  riskVal.isValid &&
                  riskVal.parsedValue != null &&
                  res === "LOSS" && (
                    <div className="absolute z-30 mt-1 w-full rounded-xl bg-popover p-1 shadow-[var(--shadow-elevated)] ring-1 ring-white/[0.09]">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          markDirty();
                          setRewardAmount(riskAmount);
                          setRewardFocused(false);
                        }}
                        className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:bg-white/[0.06] focus-visible:text-foreground focus-visible:outline-none"
                      >
                        {riskAmount}
                      </button>
                    </div>
                  )}
              </div>
            </div>
          )}

          {(appearsInPlacement(tracking, "planned_rr", "quick_capture") ||
            appearsInPlacement(tracking, "r_performance", "quick_capture")) && (
            <div className="grid grid-cols-2 gap-3">
              {appearsInPlacement(tracking, "r_performance", "quick_capture") && (
                <div className="order-2">
                  <label className={labelClass}>ACHIEVED R</label>
                  <div
                    className={cn(
                      inputClass,
                      "flex items-center bg-white/[0.02] text-sm tabular-nums",
                    )}
                  >
                    {Number.isFinite(achievedR) ? (
                      <span className={cn("font-semibold", achievedR > 0 ? "text-success" : achievedR < 0 ? "text-destructive" : "text-foreground")}>
                        {achievedR > 0 ? "+" : ""}
                        {achievedR.toFixed(2)}R
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </div>
                </div>
              )}
              {appearsInPlacement(tracking, "planned_rr", "quick_capture") && (
                <div className="order-1">
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
                    aria-describedby="planned-rr-guidance"
                    placeholder="e.g. 2 or 1:2"
                    className={inputClass}
                  />
                  <p
                    id="planned-rr-guidance"
                    className={cn(
                      "mt-1 whitespace-nowrap text-[11px]",
                      showPlannedError ? "text-warning" : "text-muted-foreground",
                    )}
                  >
                    {showPlannedError
                      ? "Use a positive value such as 2 or 1:2."
                      : "2 = a planned 1:2 risk-to-reward ratio."}
                  </p>
                </div>
              )}
            </div>
          )}

          {appearsInPlacement(tracking, "emotions", "quick_capture") && (
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
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {QUICK_CAPTURE_EMOTIONS.map((e) => {
                  const active = emotionTags.includes(e.key);
                  return (
                    <button
                      key={e.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleEmotion(e.key)}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ring-1 transition-all duration-200",
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
          )}

          {appearsInPlacement(tracking, "reasoning", "quick_capture") && (
            <label>
              <span className={labelClass}>TRADE REASONING</span>
              <textarea
                value={reasoning}
                onChange={(event) => {
                  markDirty();
                  setReasoning(event.target.value);
                }}
                className={cn(inputClass, "min-h-20 resize-y")}
                placeholder="Why did you take this trade?"
              />
            </label>
          )}

          {appearsInPlacement(tracking, "grade", "quick_capture") && (
            <div>
              <span className={labelClass}>TRADE GRADE</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {["A+", "A", "B", "C", "D"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={grade === value}
                    onClick={() => {
                      markDirty();
                      setGrade((current) => (current === value ? "" : value));
                    }}
                    className={cn(
                      "min-h-9 min-w-10 flex-1 rounded-lg px-3 text-xs font-semibold ring-1 transition-all duration-200",
                      grade === value
                        ? gradeTone(value)
                        : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          )}

          {appearsInPlacement(tracking, "killzone", "quick_capture") && (
            <div>
              <span className={labelClass}>KILLZONE</span>
              <div className="mt-1.5 flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
                {(
                  [
                    ["Yes", true],
                    ["No", false],
                  ] as const
                ).map(([label, value]) => (
                  <button
                    key={String(label)}
                    type="button"
                    aria-pressed={inKillzone === value}
                    onClick={() => {
                      markDirty();
                      setInKillzone((current) => (current === value ? null : value));
                    }}
                    className={cn(
                      "min-h-9 flex-1 rounded-lg text-xs font-semibold",
                      inKillzone === value
                        ? "bg-primary/10 text-foreground ring-1 ring-primary/25"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {appearsInPlacement(tracking, "exit_reason", "quick_capture") && (
            <label>
              <span className={labelClass}>EXIT REASON</span>
              <DarkSelect
                value={exitReason}
                options={EXIT_REASONS}
                placeholder="Select exit reason"
                onValueChange={(value) => {
                  markDirty();
                  setExitReason(value);
                }}
              />
            </label>
          )}

          {appearsInPlacement(tracking, "trade_management", "quick_capture") && (
            <div>
              <span className={labelClass}>TRADE MANAGEMENT</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TRADE_MANAGEMENT_ACTIONS.map((value) => {
                  const active = tradeManagement.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        markDirty();
                        setTradeManagement((current) => toggleTradeManagement(current, value));
                      }}
                      className={cn(
                        "min-h-9 rounded-full px-3 text-xs ring-1 transition-all duration-200",
                        active
                          ? "bg-primary/15 text-primary ring-primary/30"
                          : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:bg-white/[0.05] hover:text-foreground",
                      )}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {appearsInPlacement(tracking, "mistakes", "quick_capture") && (
            <div>
              <span className={labelClass}>EXECUTION ISSUES</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DEFAULT_MISTAKE_TAGS.map((value) => {
                  const active = mistakeTags.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        markDirty();
                        setMistakeTags((current) =>
                          active ? current.filter((item) => item !== value) : [...current, value],
                        );
                      }}
                      className={cn(
                        "min-h-9 rounded-full px-3 text-[11px] font-medium ring-1 transition-all duration-200",
                        active
                          ? "bg-warning/20 text-warning ring-warning/40 shadow-[0_0_0_3px_oklch(0.82_0.17_65/0.08)]"
                          : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground hover:bg-white/[0.05]",
                      )}
                    >
                      {active && <Check className="mr-1 inline h-3 w-3" />}
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {appearsInPlacement(tracking, "screenshots", "quick_capture") &&
            hasEnabledScreenshotSlots && (
              <div>
                <span className={labelClass}>Trade screenshot</span>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                  {SCREENSHOT_TIMEFRAMES.filter(
                    (timeframe) => screenshotSlots[timeframe].enabled,
                  ).map((timeframe) => {
                    const existing = existingScreenshotByTimeframe.get(timeframe);
                    const localPreview = quickScreenshotPreviewUrls[timeframe];
                    const preview = localPreview ?? existing?.url;
                    return (
                      <ScreenshotSlot
                        key={timeframe}
                        timeframe={timeframe}
                        label={screenshotSlots[timeframe].label}
                        previewUrl={preview ?? null}
                        fileName={quickScreenshotFiles[timeframe]?.name}
                        onPreview={() => {
                          if (preview) {
                            setPreviewScreenshot({
                              src: preview,
                              alt: `${screenshotSlots[timeframe].label} screenshot`,
                            });
                          }
                        }}
                        onUpload={(file) => {
                          markDirty();
                          setQuickScreenshotFiles((current) => ({
                            ...current,
                            [timeframe]: file,
                          }));
                        }}
                        onRemove={
                          preview
                            ? () => {
                                markDirty();
                                if (existing) {
                                  setRemovedScreenshotIds((current) => [
                                    ...new Set([...current, existing.id]),
                                  ]);
                                }
                                setQuickScreenshotFiles((current) => {
                                  const next = { ...current };
                                  delete next[timeframe];
                                  return next;
                                });
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}

          {appearsInPlacement(tracking, "community", "quick_capture") && (
            <div>
              <span className={labelClass}>COMMUNITY SHARING</span>
              {myGroups.length > 0 ? (
                <div className="mt-1.5 space-y-2">
                  {sharedTradesCount < 3 && (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Shares instrument, result, date, reasoning, and the LTF screenshot when added.
                    </p>
                  )}
                  <div className="grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {myGroups.map((group) => (
                      <label
                        key={group.id}
                        onClick={(event) => event.stopPropagation()}
                        className={cn(
                          "flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm ring-1",
                          sharedGroupIds.includes(group.id)
                            ? "bg-primary/[0.08] ring-primary/25"
                            : "bg-white/[0.025] ring-white/[0.06]",
                        )}
                      >
                        <span className="min-w-0 truncate">{group.name}</span>
                        <input
                          type="checkbox"
                          checked={sharedGroupIds.includes(group.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            markDirty();
                            setSharedGroupIds((current) =>
                              event.target.checked
                                ? [...current, group.id]
                                : current.filter((id) => id !== group.id),
                            );
                          }}
                          className="h-4 w-4 shrink-0 accent-primary"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Join or create a private group to share this trade.
                </p>
              )}
            </div>
          )}

          {balanceNotSet && !editing && (
            <div className="rounded-lg bg-info/[0.06] px-3 py-2 ring-1 ring-info/20">
              <div className="flex items-start gap-2 text-[11px] text-info">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Reference balance not set — set it in Accounts &gt; Risk rules to enable percentage
                guardrails.
              </div>
            </div>
          )}
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

        <div className="sticky -bottom-6 z-10 -mx-6 mt-6 flex justify-end gap-2 border-t border-white/[0.06] bg-background/95 px-6 py-4 backdrop-blur">
          <button
            type="button"
            onClick={(event) => handleClose(event.currentTarget)}
            className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground hover:ring-white/[0.1]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110 disabled:opacity-40"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Log trade"}
          </button>
        </div>
      </motion.div>
      <ScreenshotViewer
        open={Boolean(previewScreenshot)}
        src={previewScreenshot?.src}
        alt={previewScreenshot?.alt ?? "Trade screenshot"}
        onClose={() => setPreviewScreenshot(null)}
      />
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
    </motion.div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { motion } from "framer-motion";
import { X, Pencil, Trash2, Plus, Check, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  getTrade,
  saveDetailedReview,
  deleteScreenshot,
  addScreenshot,
  replaceScreenshot,
  listTrades,
  updateScreenshotTimeframe,
} from "@/lib/trades.functions";
import { listMyGroups, getTradeShares, shareTradeToGroups } from "@/lib/groups.functions";
import { validateScreenshotFile } from "@/lib/file-validation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
type AnnotationShape = unknown;
import { GRADES, type Grade } from "@/lib/trade-constants";
import { rrNum, type DbTrade } from "@/lib/trade-mappers";
import { sessionLabel } from "@/lib/trade-constants";
import { createTradeCategory, listTradeCategories } from "@/lib/trade-categories.functions";
import { parsePlannedRR } from "@/lib/planned-rr";
import { getTradingPreferences } from "@/lib/trading-preferences.functions";
import {
  appearsInPlacement,
  journalSessionsFromPreferences,
  journalTrackingFromPreferences,
  screenshotSlotsFromPreferences,
  SCREENSHOT_TIMEFRAMES,
  type ScreenshotTimeframe,
  ENTRY_TIMEFRAMES,
  EXIT_REASONS,
  MARKET_CONDITIONS,
  NEWS_INVOLVEMENT,
  TRADE_MANAGEMENT_ACTIONS,
  normalizeTags,
  normalizeTradeManagement,
  toggleTradeManagement,
} from "@/lib/journal-tracking";
import { SessionSelect } from "@/components/trades/session-select";
import { TradeDatePicker } from "@/components/trades/trade-date-picker";
import { ScreenshotViewer } from "@/components/trades/screenshot-viewer";
import { ScreenshotSlot } from "@/components/trades/screenshot-slot";
import { CreatableCombobox, DarkSelect, TagInput } from "@/components/trades/trade-field-controls";
import { QUICK_CAPTURE_EMOTIONS } from "@/lib/emotions";
import { parseDateKey } from "@/lib/trade-date-picker";

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
];

type Shot = {
  id: string;
  kind: string;
  url: string | null;
  caption?: string | null;
  annotations?: AnnotationShape[];
};
type Timeframe = ScreenshotTimeframe;
type CategoryRow = {
  id: string;
  name: string;
  normalized_name: string;
  archived_at: string | null;
};
const TIMEFRAMES: Timeframe[] = [...SCREENSHOT_TIMEFRAMES];

const modalTransition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
const modalPanelMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.98 },
};

function displayHeaderDate(value: string): string {
  const date = parseDateKey(value);
  return date
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : value;
}

const gradeTone = (g: string): string => {
  if (g === "A+" || g === "A") return "bg-success/15 text-success ring-success/30";
  if (g === "B+" || g === "B") return "bg-primary/15 text-primary ring-primary/30";
  if (g === "C") return "bg-warning/15 text-warning ring-warning/30";
  return "bg-destructive/15 text-destructive ring-destructive/30";
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.05]">
    {title && (
      <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
    )}
    <div className={title ? "mt-3" : undefined}>{children}</div>
  </div>
);

export function TradeReviewModal({
  tradeId,
  number,
  onClose,
  onEdit,
  onDelete,
  isDeleting,
  escapePaused,
}: {
  tradeId: string;
  number: number;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  /** True while another surface (quick-capture editor, confirm dialog) is stacked above. */
  escapePaused?: boolean;
}) {
  const qc = useQueryClient();
  const get = useServerFn(getTrade);
  const saveDetailedReviewFn = useServerFn(saveDetailedReview);
  const delShot = useServerFn(deleteScreenshot);
  const addShot = useServerFn(addScreenshot);
  const replaceShotFn = useServerFn(replaceScreenshot);
  const updateShotTimeframe = useServerFn(updateScreenshotTimeframe);
  const listFn = useServerFn(listTrades);
  const listCategoriesFn = useServerFn(listTradeCategories);
  const createCategoryFn = useServerFn(createTradeCategory);
  const getPreferencesFn = useServerFn(getTradingPreferences);

  const { data } = useQuery({
    queryKey: ["trade", tradeId],
    queryFn: () => get({ data: { id: tradeId } }),
  });

  const trade = data?.trade as DbTrade | undefined;
  const shots = (data?.screenshots ?? []) as unknown as Shot[];

  const listGroupsFn = useServerFn(listMyGroups);
  const getSharesFn = useServerFn(getTradeShares);
  const shareTradeFn = useServerFn(shareTradeToGroups);

  const { data: myGroups = [] } = useQuery({
    queryKey: ["my-groups"],
    queryFn: () => listGroupsFn(),
  });
  const { data: categoryData = [] } = useQuery({
    queryKey: ["trade-categories"],
    queryFn: () => listCategoriesFn(),
  });
  const { data: preferences } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => getPreferencesFn(),
  });
  const tracking = journalTrackingFromPreferences(preferences?.journal_tracking);
  const configuredSessions = journalSessionsFromPreferences(preferences?.journal_tracking);
  const screenshotSlots = screenshotSlotsFromPreferences(preferences?.journal_tracking);
  const categoryRows = categoryData as CategoryRow[];

  const { data: initialShares } = useQuery({
    queryKey: ["trade-shares", tradeId],
    queryFn: () => getSharesFn({ data: { tradeId } }),
    enabled: !!tradeId,
  });

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
      if (error) {
        console.error("Error fetching shared trades count:", error);
        return 0;
      }
      const uniqueTradeIds = new Set(
        (data as unknown as { trade_id: string }[] | null)?.map((row) => row.trade_id) ?? [],
      );
      return uniqueTradeIds.size;
    },
  });

  // Local review-form state — initialized from server data.
  const [reasoning, setReasoning] = useState("");
  const [category, setCategory] = useState("");
  const [grade, setGrade] = useState<Grade | "">("");
  const [mistakeTags, setMistakeTags] = useState<string[]>([]);
  const [inKillzone, setInKillzone] = useState<boolean | null>(null);
  const [tradeDate, setTradeDate] = useState<string>("");
  const [session, setSession] = useState("");
  const [plannedRR, setPlannedRR] = useState("");
  const [riskAmount, setRiskAmount] = useState("");
  const [pnlAmount, setPnlAmount] = useState("");
  const [emotionTags, setEmotionTags] = useState<string[]>([]);
  const [sharedGroupIds, setSharedGroupIds] = useState<string[]>([]);
  const [previewShot, setPreviewShot] = useState<Shot | null>(null);
  const [confirmShotDelete, setConfirmShotDelete] = useState<Shot | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [sharesHydrated, setSharesHydrated] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [entryModel, setEntryModel] = useState("");
  const [marketCondition, setMarketCondition] = useState("");
  const [entryTimeframe, setEntryTimeframe] = useState("");
  const [newsInvolvement, setNewsInvolvement] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [tradeManagement, setTradeManagement] = useState<string[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const closeInitiatorRef = useRef<HTMLElement | null>(null);
  const initialReviewRef = useRef<string | null>(null);

  const reviewSnapshot = JSON.stringify({
    reasoning,
    category: category.trim(),
    grade,
    mistakeTags,
    inKillzone,
    tradeDate,
    session,
    plannedRR,
    riskAmount,
    pnlAmount,
    emotionTags: [...emotionTags].sort(),
    sharedGroupIds: [...sharedGroupIds].sort(),
    entryModel,
    marketCondition,
    entryTimeframe,
    newsInvolvement,
    exitReason,
    tradeManagement: [...tradeManagement].sort(),
    customTags: [...customTags].sort(),
  });
  const dirty = initialReviewRef.current !== null && initialReviewRef.current !== reviewSnapshot;

  const requestClose = useCallback(
    (initiator?: HTMLElement | null) => {
      closeInitiatorRef.current = initiator ?? (document.activeElement as HTMLElement | null);
      if (dirty) {
        setDiscardConfirmOpen(true);
        return;
      }
      onClose();
    },
    [dirty, onClose],
  );

  useEffect(() => {
    setHydrated(false);
    setSharesHydrated(false);
  }, [tradeId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!trade || hydrated) return;
    setReasoning(trade.reasoning ?? "");
    setCategory((trade.categories ?? [])[0] ?? "");
    const g = GRADES.includes((trade.grade ?? "") as Grade) ? (trade.grade as Grade) : "";
    setGrade(g);
    setMistakeTags(trade.mistake_tags ?? []);
    setInKillzone(trade.in_killzone ?? null);
    setTradeDate(trade.trade_date ?? "");
    setSession(trade.session ?? "");
    setPlannedRR(trade.planned_rr ? String(trade.planned_rr).replace(/R$/i, "") : "");
    setRiskAmount(trade.risk_amount != null ? String(trade.risk_amount) : "");
    setPnlAmount(
      trade.pnl_amount != null || trade.reward_amount != null
        ? String(Math.abs(Number(trade.pnl_amount ?? trade.reward_amount)))
        : "",
    );
    setEmotionTags(trade.emotion_tags ?? []);
    setEntryModel(trade.entry_model ?? "");
    setMarketCondition(trade.market_condition ?? "");
    setEntryTimeframe(trade.entry_timeframe ?? "");
    setNewsInvolvement(trade.news_involvement ?? "");
    setExitReason(trade.exit_reason ?? "");
    setTradeManagement(trade.trade_management ?? []);
    setCustomTags(trade.custom_tags ?? []);
    setHydrated(true);
  }, [trade, hydrated]);

  useEffect(() => {
    if (initialShares !== undefined && !sharesHydrated) {
      setSharedGroupIds(initialShares.groupIds);
      setSharesHydrated(true);
    }
  }, [initialShares, sharesHydrated]);

  useEffect(() => {
    if (hydrated && sharesHydrated && initialReviewRef.current === null) {
      initialReviewRef.current = reviewSnapshot;
    }
  }, [hydrated, reviewSnapshot, sharesHydrated]);

  // Escape closes the review modal itself only when nothing is layered above it —
  // the screenshot viewer (handled above, capture phase), a confirm dialog, or
  // the quick-capture editor must always close first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (previewShot || confirmShotDelete || escapePaused) return;
      requestClose(document.activeElement as HTMLElement | null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewShot, confirmShotDelete, escapePaused, requestClose]);

  const allTradesQuery = useQuery<DbTrade[]>({ queryKey: ["trades"], queryFn: () => listFn() });
  const allTrades = useMemo(() => allTradesQuery.data ?? [], [allTradesQuery.data]);
  const entryModelSuggestions = useMemo(
    () => [
      ...new Set(
        allTrades
          .map((item) => item.entry_model?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    [allTrades],
  );
  const customTagSuggestions = useMemo(
    () => [...new Set(allTrades.flatMap((item) => item.custom_tags ?? []))],
    [allTrades],
  );
  const similar = useMemo(() => {
    if (!trade) return { wins: [] as DbTrade[], losses: [] as DbTrade[] };
    const matches = allTrades.filter((t) => {
      if (t.id === trade.id) return false;
      let score = 0;
      if (category && (t.categories ?? []).includes(category)) score += 2;
      if (trade.session && t.session === trade.session) score += 1;
      if (grade && t.grade === grade) score += 1;
      return score >= 2;
    });
    return {
      wins: matches.filter((t) => t.result === "win"),
      losses: matches.filter((t) => t.result === "loss"),
    };
  }, [trade, allTrades, category, grade]);

  const firstTradeYear = useMemo(() => {
    const years = allTrades
      .map((item) => Number(item.trade_date?.slice(0, 4)))
      .filter((year) => Number.isInteger(year) && year > 0);
    return years.length ? Math.min(...years) : new Date().getFullYear();
  }, [allTrades]);
  const saveM = useMutation({
    mutationFn: async () => {
      if (!trade) return;
      const risk = riskAmount.trim() ? Number(riskAmount) : null;
      const rawPnl = pnlAmount.trim() ? Number(pnlAmount) : null;
      const signedPnl =
        rawPnl == null || !Number.isFinite(rawPnl)
          ? null
          : trade.result === "loss"
            ? -Math.abs(rawPnl)
            : trade.result === "breakeven"
              ? 0
              : Math.abs(rawPnl);
      const normalizedCategory = category.trim().toLocaleLowerCase();
      if (
        normalizedCategory &&
        !categoryRows.some((item) => item.normalized_name === normalizedCategory)
      ) {
        await createCategoryFn({ data: category.trim() });
      }
      const [reviewResult] = await Promise.all([
        saveDetailedReviewFn({
          data: {
            id: trade.id,
            patch: {
              reasoning: reasoning || null,
              grade: grade || null,
              mistake_tags: mistakeTags,
              in_killzone: inKillzone,
              categories: category.trim() ? [category.trim()] : [],
              entry_model: entryModel || null,
              market_condition: marketCondition || null,
              entry_timeframe: entryTimeframe || null,
              news_involvement: newsInvolvement || null,
              exit_reason: exitReason || null,
              trade_management: normalizeTradeManagement(tradeManagement),
              custom_tags: normalizeTags(customTags),
              emotion_tags: appearsInPlacement(tracking, "emotions", "detailed_review")
                ? emotionTags
                : (trade.emotion_tags ?? []),
              risk_amount: appearsInPlacement(tracking, "r_performance", "detailed_review")
                ? risk != null && Number.isFinite(risk) && risk > 0
                  ? risk
                  : null
                : trade.risk_amount,
              reward_amount: appearsInPlacement(tracking, "r_performance", "detailed_review")
                ? signedPnl
                : trade.reward_amount,
              pnl_amount: appearsInPlacement(tracking, "r_performance", "detailed_review")
                ? signedPnl
                : trade.pnl_amount,
              ...(tradeDate ? { trade_date: tradeDate } : {}),
              session: appearsInPlacement(tracking, "session", "detailed_review")
                ? session || null
                : trade.session,
              planned_rr: appearsInPlacement(tracking, "planned_rr", "detailed_review")
                ? (() => {
                    const parsed = parsePlannedRR(plannedRR);
                    return parsed == null ? null : parsed.toFixed(2);
                  })()
                : trade.planned_rr,
            },
          },
        }),
        appearsInPlacement(tracking, "community", "detailed_review")
          ? shareTradeFn({
              data: {
                tradeId: trade.id,
                groupIds: sharedGroupIds,
                includeReasoning: true,
              },
            })
          : Promise.resolve(null),
      ]);
      return reviewResult;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["trade", tradeId] });
      qc.invalidateQueries({ queryKey: ["trade-shares", tradeId] });
      qc.invalidateQueries({ queryKey: ["shared-trades-count"] });
      qc.invalidateQueries({ queryKey: ["account-stats"] });
      qc.invalidateQueries({ queryKey: ["trade-categories"] });
      initialReviewRef.current = reviewSnapshot;
      const missing = result?.missingRequirements ?? [];
      toast.success(missing.length ? "Review saved — completion still needed" : "Review saved");
    },
    onError: (e: Error) => {
      console.error("Failed to save review:", e);
      toast.error(e.message);
    },
  });

  const removeShot = useMutation({
    mutationFn: (id: string) => delShot({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["trade", tradeId] });
      setConfirmShotDelete(null);
      toast.success("Screenshot removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTimeframe = useMutation({
    mutationFn: (vars: { id: string; timeframe: Timeframe | null }) =>
      updateShotTimeframe({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trade", tradeId] });
      toast.success("Screenshot classified");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadShots = useMutation({
    mutationFn: async ({
      files,
      timeframe,
      replaceShot,
    }: {
      files: File[];
      timeframe: Timeframe;
      replaceShot?: Shot;
    }) => {
      if (shots.length - (replaceShot ? 1 : 0) + files.length > 3) {
        throw new Error(
          "Each trade can have up to 3 screenshots. Remove one before adding another.",
        );
      }
      for (const f of files) {
        const errMsg = validateScreenshotFile(f);
        if (errMsg) throw new Error(`"${f.name}": ${errMsg}`);
      }
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      for (const f of files) {
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${uid}/${tradeId}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("trade-screenshots")
          .upload(path, f, { upsert: false });
        if (upErr) throw new Error(upErr.message);
        try {
          if (replaceShot) {
            await replaceShotFn({
              data: {
                id: replaceShot.id,
                storage_path: path,
                kind: "after",
                caption: timeframe,
              },
            });
          } else {
            await addShot({
              data: { trade_id: tradeId, storage_path: path, kind: "after", caption: timeframe },
            });
          }
        } catch (metadataError) {
          const { error: cleanupError } = await supabase.storage
            .from("trade-screenshots")
            .remove([path]);
          if (cleanupError) {
            console.error("[screenshot-upload] Compensating object cleanup failed", {
              code: cleanupError.name || "storage_remove_failed",
            });
          }
          throw metadataError;
        }
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["trade", tradeId] });
      toast.success(variables.replaceShot ? "Screenshot replaced" : "Screenshot added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!trade) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={modalTransition}
        className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4"
        onClick={onClose}
      >
        <motion.div
          {...modalPanelMotion}
          transition={modalTransition}
          className="glow-card w-full max-w-2xl rounded-2xl p-10 text-center text-sm text-muted-foreground"
        >
          Loading trade…
        </motion.div>
      </motion.div>
    );
  }

  const res =
    trade.result === "win"
      ? "WIN"
      : trade.result === "loss"
        ? "LOSS"
        : trade.result === "breakeven"
          ? "BE"
          : "—";
  const side = trade.direction === "short" ? "SHORT" : trade.direction === "long" ? "LONG" : null;
  const r = rrNum(trade.achieved_rr);
  const positive = r > 0;
  const negative = r < 0;
  const when = displayHeaderDate(trade.trade_date);
  const shotSlots = TIMEFRAMES.filter(
    (timeframe) =>
      screenshotSlots[timeframe].enabled ||
      shots.some((shot) => shot.caption === timeframe && shot.url),
  ).map((timeframe) => ({
    timeframe,
    label: screenshotSlots[timeframe].label,
    shot: shots.find((s) => s.caption === timeframe && s.url) ?? null,
  }));
  const recentSessionIds = [
    ...new Set(allTrades.map((item) => item.session).filter(Boolean)),
  ].slice(0, 8) as string[];
  const unassignedShots = shots.filter(
    (s) => s.url && !TIMEFRAMES.includes(s.caption as Timeframe),
  );

  const toggleMistake = (tag: string) =>
    setMistakeTags((p) => (p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]));

  const shareEligible = !!trade.instrument && !!trade.result && !!tradeDate;

  const inputClass =
    "w-full rounded-lg bg-white/[0.04] px-3 py-2 text-sm ring-1 ring-white/[0.06] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40";
  const detailedRisk = Number(riskAmount);
  const detailedRawPnl = Number(pnlAmount);
  const detailedSignedPnl =
    trade.result === "loss"
      ? -Math.abs(detailedRawPnl)
      : trade.result === "breakeven"
        ? 0
        : Math.abs(detailedRawPnl);
  const detailedAchievedR =
    riskAmount.trim() &&
    pnlAmount.trim() &&
    Number.isFinite(detailedRisk) &&
    detailedRisk > 0 &&
    Number.isFinite(detailedSignedPnl)
      ? detailedSignedPnl / detailedRisk
      : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={modalTransition}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose(event.currentTarget);
      }}
    >
      <motion.div
        {...modalPanelMotion}
        transition={modalTransition}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className={cn(
          "glow-card w-full max-w-3xl max-h-[92vh] rounded-2xl p-6 shadow-[var(--shadow-elevated)]",
          previewShot ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">
              TRADE #{number}
            </div>
            <h2 className="mt-1 text-2xl font-bold">{trade.instrument}</h2>
            <div className="text-xs text-muted-foreground">{when}</div>
          </div>
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit quick capture details"
                title="Edit the quick-capture basics — instrument, session, result, risk"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit quick capture
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-destructive disabled:opacity-50"
                title="Delete trade"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={(event) => requestClose(event.currentTarget)}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Trade Facts */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "SIDE",
              value: side ?? "—",
              className: cn(
                "text-sm font-bold",
                side === "LONG"
                  ? "text-success"
                  : side === "SHORT"
                    ? "text-destructive"
                    : "text-muted-foreground",
              ),
            },
            {
              label: "RESULT",
              value: res,
              className: cn(
                "text-sm font-bold",
                res === "WIN" && "text-success",
                res === "LOSS" && "text-destructive",
                res === "BE" && "text-info",
              ),
            },
            {
              label: "SESSION",
              value: trade.session
                ? (configuredSessions.find((item) => item.id === trade.session)?.label ??
                  sessionLabel(trade.session))
                : "—",
              className: cn("text-sm font-semibold", !trade.session && "text-muted-foreground"),
            },
            {
              label: "ACHIEVED R",
              value: trade.achieved_rr != null ? `${positive ? "+" : ""}${r.toFixed(2)}R` : "—",
              className: cn(
                "text-sm font-bold tabular-nums",
                positive && "text-success",
                negative && "text-destructive",
                !positive && !negative && "text-muted-foreground",
              ),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.04]"
            >
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                {item.label}
              </div>
              <div className={cn("mt-1.5", item.className)}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Screenshots use the same authoritative trade records as Quick Capture. */}
        {appearsInPlacement(tracking, "screenshots", "detailed_review") && shotSlots.length > 0 && (
          <div className="mt-5">
            <Section title="Trade screenshots">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {shotSlots.map(({ timeframe, label, shot }) => (
                  <ScreenshotSlot
                    key={timeframe}
                    timeframe={timeframe}
                    label={label}
                    previewUrl={shot?.url ?? null}
                    uploading={uploadShots.isPending}
                    disabled={shots.length >= 3}
                    onPreview={() => {
                      if (shot) setPreviewShot(shot);
                    }}
                    onUpload={(file) => {
                      uploadShots.mutate({
                        files: [file],
                        timeframe,
                        replaceShot: shot ?? undefined,
                      });
                    }}
                    onRemove={shot ? () => setConfirmShotDelete(shot) : undefined}
                  />
                ))}
              </div>
              {unassignedShots.length > 0 && (
                <div className="mt-4 rounded-xl bg-white/[0.018] p-3 ring-1 ring-white/[0.04]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Other screenshots
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {unassignedShots.map((s) => (
                      <div key={s.id} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setPreviewShot(s)}
                          className="aspect-video w-full overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06] transition hover:ring-primary/30"
                        >
                          <img
                            src={s.url!}
                            alt="Additional screenshot"
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmShotDelete(s)}
                          className="text-[10px] font-medium text-muted-foreground transition hover:text-destructive"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {shots.length >= 3 && shotSlots.some((slot) => !slot.shot) && (
                <div className="mt-3 rounded-lg bg-white/[0.025] px-3 py-2 text-xs text-muted-foreground ring-1 ring-white/[0.05]">
                  Screenshot limit reached. Each trade can have up to 3 screenshots.
                </div>
              )}
            </Section>
          </div>
        )}

        {/* Review */}
        <div className="mt-3">
          <Section title="">
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  TRADE DATE
                </label>
                <TradeDatePicker
                  value={tradeDate}
                  earliestTradeYear={firstTradeYear}
                  onChange={setTradeDate}
                  className="mt-1.5"
                />
              </div>
              {appearsInPlacement(tracking, "session", "detailed_review") && (
                <div>
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    SESSION
                  </span>
                  <SessionSelect
                    value={session}
                    onValueChange={setSession}
                    recentSessionIds={recentSessionIds}
                    triggerClassName={cn(inputClass, "mt-1.5 h-auto border-0 shadow-none")}
                  />
                </div>
              )}
              {appearsInPlacement(tracking, "r_performance", "detailed_review") && (
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                      RISK AMOUNT
                    </span>
                    <input
                      value={riskAmount}
                      inputMode="decimal"
                      onChange={(event) => setRiskAmount(event.target.value)}
                      className={cn(inputClass, "mt-1.5")}
                      placeholder="e.g. 100"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                      {trade.result === "win"
                        ? "PROFIT AMOUNT"
                        : trade.result === "loss"
                          ? "LOSS AMOUNT"
                          : "PROFIT / LOSS"}
                    </span>
                    <input
                      value={pnlAmount}
                      inputMode="decimal"
                      disabled={trade.result === "breakeven"}
                      onChange={(event) => setPnlAmount(event.target.value)}
                      className={cn(
                        inputClass,
                        "mt-1.5",
                        trade.result === "breakeven" && "cursor-not-allowed opacity-55",
                      )}
                      placeholder="e.g. 200"
                    />
                  </label>
                </div>
              )}
              {(appearsInPlacement(tracking, "planned_rr", "detailed_review") ||
                appearsInPlacement(tracking, "r_performance", "detailed_review")) && (
                <div className="grid grid-cols-2 gap-3">
                  {appearsInPlacement(tracking, "planned_rr", "detailed_review") && (
                    <label>
                      <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                        PLANNED R:R
                      </span>
                      <input
                        value={plannedRR}
                        onChange={(event) => setPlannedRR(event.target.value)}
                        className={cn(inputClass, "mt-1.5")}
                        placeholder="e.g. 2 or 1:2"
                      />
                    </label>
                  )}
                  {appearsInPlacement(tracking, "r_performance", "detailed_review") && (
                    <div>
                      <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                        ACHIEVED R
                      </span>
                      <div
                        className={cn(
                          inputClass,
                          "mt-1.5 flex min-h-9 items-center bg-white/[0.02] font-semibold tabular-nums",
                          detailedAchievedR != null && detailedAchievedR > 0 && "text-success",
                          detailedAchievedR != null && detailedAchievedR < 0 && "text-destructive",
                        )}
                      >
                        {detailedAchievedR == null
                          ? "—"
                          : `${detailedAchievedR > 0 ? "+" : ""}${detailedAchievedR.toFixed(2)}R`}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {appearsInPlacement(tracking, "category", "detailed_review") && (
                <div>
                  <label className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    CATEGORY / SETUP
                  </label>
                  <CreatableCombobox
                    value={category}
                    suggestions={categoryRows
                      .filter((item) => !item.archived_at)
                      .map((item) => item.name)}
                    placeholder="Select or add category"
                    onValueChange={setCategory}
                  />
                </div>
              )}
              {appearsInPlacement(tracking, "entry_model", "detailed_review") && (
                <label>
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    ENTRY MODEL / TRIGGER
                  </span>
                  <CreatableCombobox
                    value={entryModel}
                    suggestions={entryModelSuggestions}
                    placeholder="Select or add entry model"
                    onValueChange={setEntryModel}
                  />
                </label>
              )}
              {appearsInPlacement(tracking, "market_condition", "detailed_review") && (
                <label>
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    MARKET CONDITION
                  </span>
                  <DarkSelect
                    value={marketCondition}
                    options={MARKET_CONDITIONS}
                    placeholder="Select market condition"
                    onValueChange={setMarketCondition}
                  />
                </label>
              )}
              {appearsInPlacement(tracking, "entry_timeframe", "detailed_review") && (
                <label>
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    ENTRY TIMEFRAME
                  </span>
                  <DarkSelect
                    value={entryTimeframe}
                    options={ENTRY_TIMEFRAMES}
                    searchable
                    placeholder="Select entry timeframe"
                    onValueChange={setEntryTimeframe}
                  />
                </label>
              )}
              {appearsInPlacement(tracking, "news_involvement", "detailed_review") && (
                <label>
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    NEWS INVOLVEMENT
                  </span>
                  <DarkSelect
                    value={newsInvolvement}
                    options={NEWS_INVOLVEMENT}
                    placeholder="Select news involvement"
                    onValueChange={setNewsInvolvement}
                  />
                </label>
              )}
              {appearsInPlacement(tracking, "custom_tags", "detailed_review") && (
                <div>
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    CUSTOM TAGS
                  </span>
                  <TagInput
                    values={customTags}
                    suggestions={customTagSuggestions}
                    onChange={setCustomTags}
                  />
                </div>
              )}
              {appearsInPlacement(tracking, "emotions", "detailed_review") && (
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                        EMOTIONS
                      </span>
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
                    {QUICK_CAPTURE_EMOTIONS.map((emotion) => {
                      const active = emotionTags.includes(emotion.key);
                      return (
                        <button
                          key={emotion.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setEmotionTags((current) =>
                              active
                                ? current.filter((value) => value !== emotion.key)
                                : [...current, emotion.key],
                            )
                          }
                          className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ring-1 transition-all duration-200",
                            active
                              ? "bg-primary/20 text-foreground shadow-[0_0_18px_hsl(var(--primary)/0.18)] ring-primary/50"
                              : "bg-white/[0.03] text-muted-foreground ring-white/[0.06] hover:text-foreground hover:ring-white/[0.12]",
                          )}
                        >
                          <span className="text-sm leading-none">{emotion.emoji}</span>
                          <span>{emotion.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {appearsInPlacement(tracking, "reasoning", "detailed_review") && (
                <div>
                  <label className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    TRADE REASONING
                  </label>
                  <textarea
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                    rows={3}
                    placeholder="Why did you take this trade?"
                    className={cn(inputClass, "mt-1.5 resize-none")}
                  />
                </div>
              )}
              {appearsInPlacement(tracking, "grade", "detailed_review") && (
                <div>
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    TRADE GRADE
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {GRADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={grade === g}
                        onClick={() => setGrade(grade === g ? "" : g)}
                        className={cn(
                          "min-h-9 min-w-10 flex-1 rounded-lg px-3 text-xs font-semibold ring-1 transition-all duration-200",
                          grade === g
                            ? gradeTone(g)
                            : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground",
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {appearsInPlacement(tracking, "killzone", "detailed_review") && (
                <div>
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    KILLZONE
                  </span>
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
                        onClick={() => setInKillzone((current) => (current === value ? null : value))}
                        className={cn(
                          "min-h-9 flex-1 rounded-lg text-xs font-semibold transition-colors duration-150",
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
              {(appearsInPlacement(tracking, "exit_reason", "detailed_review") ||
                appearsInPlacement(tracking, "trade_management", "detailed_review")) && (
                <div className="col-span-full grid gap-3">
                  {appearsInPlacement(tracking, "exit_reason", "detailed_review") && (
                    <label>
                      <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                        EXIT REASON
                      </span>
                      <DarkSelect
                        value={exitReason}
                        options={EXIT_REASONS}
                        placeholder="Select exit reason"
                        onValueChange={setExitReason}
                      />
                    </label>
                  )}
                  {appearsInPlacement(tracking, "trade_management", "detailed_review") && (
                    <div>
                      <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                        TRADE MANAGEMENT
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {TRADE_MANAGEMENT_ACTIONS.map((value) => {
                          const active = tradeManagement.includes(value);
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setTradeManagement((current) =>
                                  toggleTradeManagement(current, value),
                                )
                              }
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
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Execution Issues */}
        {appearsInPlacement(tracking, "mistakes", "detailed_review") && (
          <div className="mt-3">
            <Section title="EXECUTION ISSUES">
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_MISTAKE_TAGS.map((tag) => {
                  const active = mistakeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleMistake(tag)}
                      className={cn(
                        "min-h-9 rounded-full px-3 text-[11px] font-medium ring-1 transition-all duration-200",
                        active
                          ? "bg-warning/20 text-warning ring-warning/40 shadow-[0_0_0_3px_oklch(0.82_0.17_65/0.08)]"
                          : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground hover:bg-white/[0.05]",
                      )}
                    >
                      {active && <Check className="mr-1 inline h-3 w-3" />}
                      {tag}
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>
        )}

        {/* Similar */}
        {(similar.wins.length > 0 || similar.losses.length > 0) && (
          <div className="mt-3">
            <Section title="SIMILAR TRADES">
              <p className="-mt-1 text-xs text-muted-foreground">
                Resembles{" "}
                <span className="font-semibold text-success">{similar.wins.length} wins</span> and{" "}
                <span className="font-semibold text-destructive">
                  {similar.losses.length} losses
                </span>
                .
              </p>
            </Section>
          </div>
        )}

        {appearsInPlacement(tracking, "community", "detailed_review") && (
          <div className="mt-3">
            <Section title="COMMUNITY SHARING">
              <div className="space-y-3">
                {sharedTradesCount < 3 && (
                  <div className="text-xs leading-5 text-muted-foreground">
                    Shares instrument, result, date, reasoning, and the LTF screenshot when added.
                  </div>
                )}
                {myGroups.length === 0 ? (
                  <div className="rounded-lg bg-white/[0.02] px-3 py-2.5 text-xs text-muted-foreground ring-1 ring-white/[0.04]">
                    You haven't joined or created any community groups yet. Visit Community to get
                    started.
                  </div>
                ) : (
                  <div className="max-h-[145px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {myGroups.map((g) => {
                        const checked = sharedGroupIds.includes(g.id);
                        return (
                          <label
                            key={g.id}
                            onClick={(event) => event.stopPropagation()}
                            className={cn(
                              "flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm ring-1",
                              checked
                                ? "bg-primary/[0.08] ring-primary/25"
                                : "bg-white/[0.025] ring-white/[0.06]",
                              !shareEligible && !checked && "opacity-40 cursor-not-allowed",
                            )}
                          >
                            <span className="min-w-0 truncate">{g.name}</span>
                            <input
                              type="checkbox"
                              disabled={!shareEligible && !checked}
                              checked={checked}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setSharedGroupIds((previous) =>
                                  event.target.checked
                                    ? [...previous, g.id]
                                    : previous.filter((id) => id !== g.id),
                                )
                              }
                              className="h-4 w-4 shrink-0 accent-primary"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          </div>
        )}

        <div className="sticky -bottom-6 z-10 -mx-6 mt-5 flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-background/95 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={(event) => requestClose(event.currentTarget)}
              className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => saveM.mutate()}
              disabled={saveM.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saveM.isPending ? "Saving…" : "Save review"}
            </button>
          </div>
        </div>
        <ScreenshotViewer
          open={Boolean(previewShot?.url)}
          src={previewShot?.url}
          alt={`Screenshot ${previewShot?.kind ?? ""}`}
          onClose={() => setPreviewShot(null)}
        />
        <ConfirmDialog
          open={confirmShotDelete !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmShotDelete(null);
          }}
          title="Delete screenshot?"
          description="This screenshot will be permanently removed from this trade."
          confirmLabel="Delete screenshot"
          destructive
          loading={removeShot.isPending}
          onConfirm={() => {
            if (confirmShotDelete) removeShot.mutate(confirmShotDelete.id);
          }}
        />
        <ConfirmDialog
          open={discardConfirmOpen}
          onOpenChange={(open) => {
            setDiscardConfirmOpen(open);
            if (!open) window.requestAnimationFrame(() => closeInitiatorRef.current?.focus());
          }}
          title="Discard changes?"
          description="Your unsaved Detailed Review changes will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          destructive
          onConfirm={() => {
            setDiscardConfirmOpen(false);
            onClose();
          }}
        />
      </motion.div>
    </motion.div>
  );
}

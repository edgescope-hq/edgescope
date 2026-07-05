import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Pencil, Trash2, Plus, Check, Save, CalendarDays } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getTrade, updateTrade, deleteScreenshot, addScreenshot, listTrades, updateScreenshotTimeframe } from "@/lib/trades.functions";
import { validateScreenshotFile } from "@/lib/file-validation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
type AnnotationShape = unknown;
import { GRADES, type Grade } from "@/components/trades/trade-form-modal";
import { rrNum, type DbTrade } from "@/lib/trade-mappers";
import { sessionLabel } from "@/lib/trade-constants";
import { hasDetailedReviewMinimum } from "@/lib/review-status";

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

type Shot = { id: string; kind: string; url: string | null; caption?: string | null; annotations?: AnnotationShape[] };
type Timeframe = "HTF" | "MTF" | "LTF";
const TIMEFRAMES: Timeframe[] = ["HTF", "MTF", "LTF"];

const modalTransition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

function parseDateKey(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(value: string): string {
  const date = parseDateKey(value);
  return date ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Select date";
}

function displayHeaderDate(value: string): string {
  const date = parseDateKey(value);
  return date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : value;
}

const gradeTone = (g: string): string => {
  if (g === "A+" || g === "A") return "bg-success/15 text-success ring-success/30";
  if (g === "B+" || g === "B") return "bg-primary/15 text-primary ring-primary/30";
  if (g === "C") return "bg-warning/15 text-warning ring-warning/30";
  return "bg-destructive/15 text-destructive ring-destructive/30";
};

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
  const update = useServerFn(updateTrade);
  const delShot = useServerFn(deleteScreenshot);
  const addShot = useServerFn(addScreenshot);
  const updateShotTimeframe = useServerFn(updateScreenshotTimeframe);
  const listFn = useServerFn(listTrades);

  const { data } = useQuery({
    queryKey: ["trade", tradeId],
    queryFn: () => get({ data: { id: tradeId } }),
  });

  const trade = data?.trade as DbTrade | undefined;
  const shots = (data?.screenshots ?? []) as unknown as Shot[];

  // Local review-form state — initialized from server data.
  const [reasoning, setReasoning] = useState("");
  const [category, setCategory] = useState("");
  const [grade, setGrade] = useState<Grade | "">("");
  const [mistakeTags, setMistakeTags] = useState<string[]>([]);
  const [inKillzone, setInKillzone] = useState(false);
  const [tradeDate, setTradeDate] = useState<string>("");
  const [shareCommunity, setShareCommunity] = useState(false);
  const [previewShot, setPreviewShot] = useState<Shot | null>(null);
  const [confirmShotDelete, setConfirmShotDelete] = useState<Shot | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!trade || hydrated) return;
    setReasoning(trade.reasoning ?? "");
    setCategory((trade.categories ?? [])[0] ?? "");
    const g = GRADES.includes((trade.grade ?? "") as Grade) ? (trade.grade as Grade) : "";
    setGrade(g);
    setMistakeTags(trade.mistake_tags ?? []);
    setInKillzone(trade.in_killzone === true);
    setTradeDate(trade.trade_date ?? "");
    setShareCommunity(!!trade.is_shared);
    setHydrated(true);
  }, [trade, hydrated]);

  useEffect(() => {
    if (!previewShot) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setPreviewShot(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [previewShot]);

  // Escape closes the review modal itself only when nothing is layered above it —
  // the screenshot viewer (handled above, capture phase), a confirm dialog, or
  // the quick-capture editor must always close first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (previewShot || confirmShotDelete || escapePaused) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewShot, confirmShotDelete, escapePaused, onClose]);

  const allTradesQuery = useQuery<DbTrade[]>({ queryKey: ["trades"], queryFn: () => listFn() });
  const allTrades = allTradesQuery.data ?? [];
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
    if (!allTrades.length) return new Date().getFullYear();
    const dates = allTrades
      .map((t) => t.trade_date)
      .filter(Boolean)
      .sort();
    if (!dates.length) return new Date().getFullYear();
    return new Date(dates[0]).getFullYear();
  }, [allTrades]);

  const lastRelevantTradeYear = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const dates = allTrades
      .map((t) => t.trade_date)
      .filter(Boolean)
      .sort();
    if (!dates.length) return currentYear;
    const latestTradeYear = new Date(dates[dates.length - 1]).getFullYear();
    return Math.max(currentYear, latestTradeYear);
  }, [allTrades]);

  const calendarStart = useMemo(() => new Date(firstTradeYear, 0, 1), [firstTradeYear]);
  const calendarEnd = useMemo(() => new Date(lastRelevantTradeYear, 11, 31), [lastRelevantTradeYear]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (!trade) return;
      await update({
        data: {
          id: trade.id,
          patch: {
            reasoning: reasoning || null,
            grade: grade || null,
            mistake_tags: mistakeTags,
            in_killzone: inKillzone,
            is_shared: shareCommunity,
            categories: category.trim() ? [category.trim()] : [],
            ...(tradeDate ? { trade_date: tradeDate } : {}),
          },
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["trade", tradeId] });
      qc.invalidateQueries({ queryKey: ["account-stats"] });
      toast.success("Review saved");
    },
    onError: (e: Error) => toast.error(e.message),
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
    mutationFn: (vars: { id: string; timeframe: Timeframe | null }) => updateShotTimeframe({ data: vars }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trade", tradeId] }); toast.success("Screenshot classified"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadShots = useMutation({
    mutationFn: async ({ files, timeframe }: { files: File[]; timeframe: Timeframe }) => {
      if (shots.length + files.length > 3) {
        throw new Error("Each trade can have up to 3 screenshots. Remove one before adding another.");
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
        const { error: upErr } = await supabase.storage.from("trade-screenshots").upload(path, f, { upsert: false });
        if (upErr) throw new Error(upErr.message);
        await addShot({ data: { trade_id: tradeId, storage_path: path, kind: "after", caption: timeframe } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["trade", tradeId] });
      toast.success("Screenshot added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!trade) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
        <div className="glow-card w-full max-w-2xl rounded-2xl p-10 text-center text-sm text-muted-foreground">Loading trade…</div>
      </motion.div>
    );
  }

  const res = trade.result === "win" ? "WIN" : trade.result === "loss" ? "LOSS" : trade.result === "breakeven" ? "BE" : "—";
  const side = trade.direction === "short" ? "SHORT" : "LONG";
  const r = rrNum(trade.achieved_rr);
  const positive = r > 0;
  const negative = r < 0;
  const when = displayHeaderDate(trade.trade_date);
  const shotSlots = TIMEFRAMES.map((timeframe) => ({
    timeframe,
    shot: shots.find((s) => s.caption === timeframe && s.url) ?? null,
  }));
  const unassignedShots = shots.filter((s) => s.url && !TIMEFRAMES.includes(s.caption as Timeframe));

  const toggleMistake = (tag: string) => setMistakeTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]);

  // Sharing exposes the screenshot + reasoning packet, so both must exist first.
  // Judged on live form state; unsharing an already-shared trade is always allowed.
  const shareEligible = hasDetailedReviewMinimum({ reasoning, screenshot_count: shots.length });
  const canToggleShare = shareEligible || shareCommunity;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.05]">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );

  const inputClass = "w-full rounded-lg bg-white/[0.04] px-3 py-2 text-sm ring-1 ring-white/[0.06] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.98, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.98, y: 8 }} transition={modalTransition} onClick={(e: MouseEvent) => e.stopPropagation()} className={cn("glow-card w-full max-w-3xl max-h-[92vh] rounded-2xl p-6 shadow-[var(--shadow-elevated)]", previewShot ? "overflow-hidden" : "overflow-y-auto")}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">TRADE #{number}</div>
            <h2 className="mt-1 text-2xl font-bold">{trade.instrument}</h2>
            <div className="text-xs text-muted-foreground">{when}</div>
          </div>
          <div className="flex items-center gap-1.5">
            {onEdit && (
              <button
                onClick={onEdit}
                aria-label="Edit quick capture details"
                title="Edit the quick-capture basics — instrument, session, result, risk"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit quick capture
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} disabled={isDeleting} className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-destructive disabled:opacity-50" title="Delete trade"><Trash2 className="h-4 w-4" /></button>
            )}
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Trade Facts */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "SIDE", value: side, className: cn("text-sm font-bold", side === "LONG" ? "text-success" : "text-destructive") },
            { label: "RESULT", value: res, className: cn("text-sm font-bold", res === "WIN" && "text-success", res === "LOSS" && "text-destructive", res === "BE" && "text-info") },
            { label: "SESSION", value: trade.session ? sessionLabel(trade.session) : "Select session", className: "text-sm font-semibold" },
            { label: "REALIZED R", value: trade.achieved_rr != null ? `${positive ? "+" : ""}${r.toFixed(2)}R` : "—", className: cn("text-sm font-bold tabular-nums", positive && "text-success", negative && "text-destructive", !positive && !negative && "text-muted-foreground") },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.04]">
              <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">{item.label}</div>
              <div className={cn("mt-1.5", item.className)}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Screenshots */}
        <div className="mt-5">
            <Section title="SCREENSHOTS">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {shotSlots.map(({ timeframe, shot }) => (
                  <div key={timeframe} className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.05]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-foreground">{timeframe}</div>
                        <div className="text-[10px] text-muted-foreground">Upload slot</div>
                      </div>
                      {shot && (
                        <button
                          type="button"
                          onClick={() => setConfirmShotDelete(shot)}
                          title="Delete screenshot"
                          className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.04] text-muted-foreground/70 ring-1 ring-white/10 transition-all hover:bg-destructive/20 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {shot ? (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setPreviewShot(shot)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setPreviewShot(shot);
                          }
                        }}
                        className="group relative aspect-video cursor-pointer overflow-hidden rounded-xl bg-white/[0.025] text-left ring-1 ring-white/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:ring-primary/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <img src={shot.url!} alt={`${timeframe} screenshot`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>
                    ) : (
                      <label className={cn(
                        "grid aspect-video cursor-pointer place-items-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.025] text-center text-xs text-muted-foreground transition-all duration-200 hover:border-primary/35 hover:bg-primary/[0.035] hover:text-foreground",
                        (uploadShots.isPending || shots.length >= 3) && "cursor-not-allowed opacity-50 hover:border-white/[0.12] hover:bg-white/[0.025] hover:text-muted-foreground",
                      )}>
                        <span className="inline-flex items-center gap-1.5">
                          <Plus className="h-3.5 w-3.5" />
                          {uploadShots.isPending ? "Uploading..." : `Upload ${timeframe}`}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadShots.isPending || shots.length >= 3}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadShots.mutate({ files: [file], timeframe });
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
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
                          <img src={s.url!} alt="Additional screenshot" className="h-full w-full object-cover" />
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
              {false && shots.length === 0 && (
                <div className="rounded-xl bg-white/[0.02] px-4 py-5 text-center text-xs text-muted-foreground ring-1 ring-white/[0.04]">
                  No screenshots yet. Add up to 3 clean review images when they help your process.
                </div>
              )}
              {false && shots.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {shots.map((s) => s.url ? (
                    <div key={s.id} className="flex flex-col gap-2">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setPreviewShot(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setPreviewShot(s);
                          }
                        }}
                        className="group relative aspect-video overflow-hidden rounded-xl bg-white/[0.025] text-left shadow-[0_10px_30px_-18px_oklch(0_0_0/0.9)] ring-1 ring-white/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:ring-primary/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer"
                      >
                        <img src={s.url} alt={`Screenshot ${s.kind}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>

                      <div className="flex items-center justify-between gap-1 px-1">
                        {/* One timeframe per screenshot — segmented single-select,
                            rendered optimistically from the in-flight mutation. */}
                        <div
                          role="radiogroup"
                          aria-label="Screenshot timeframe"
                          className="inline-flex rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]"
                        >
                          {(["HTF", "MTF", "LTF"] as const).map((tf) => {
                            const pendingHere =
                              setTimeframe.isPending && setTimeframe.variables?.id === s.id;
                            const selected = pendingHere ? setTimeframe.variables?.timeframe : s.caption;
                            const active = selected === tf;
                            return (
                              <button
                                key={tf}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                disabled={setTimeframe.isPending}
                                onClick={() => setTimeframe.mutate({ id: s.id, timeframe: active ? null : tf })}
                                className={cn(
                                  "cursor-pointer rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all duration-200",
                                  active
                                    ? "bg-primary/20 text-primary"
                                    : "text-muted-foreground hover:text-foreground",
                                  setTimeframe.isPending && "cursor-default opacity-70",
                                )}
                              >
                                {tf}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmShotDelete(s)}
                          title="Delete screenshot"
                          className="grid h-6 w-6 place-items-center rounded-full bg-white/[0.04] text-muted-foreground/60 ring-1 ring-white/10 transition-all hover:bg-destructive/20 hover:text-destructive cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : null)}
                </div>
              )}
              {false && shots.length < 3 ? (
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:bg-white/[0.06] hover:text-foreground hover:ring-white/[0.1]">
                <Plus className="h-3.5 w-3.5" /> {uploadShots.isPending ? "Uploading…" : "Add screenshot"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploadShots.isPending}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) uploadShots.mutate({ files, timeframe: "HTF" });
                    e.target.value = "";
                  }}
                />
              </label>
              ) : (
                <div className="hidden">
                  Screenshot limit reached. Each trade can have up to 3 screenshots.
                </div>
              )}
            </Section>
          </div>

        {/* Review */}
        <div className="mt-3">
          <Section title="REVIEW">
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">TRADE DATE</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(inputClass, "mt-1.5 flex items-center justify-between text-left", !tradeDate && "text-muted-foreground")}
                    >
                      <span>{displayDate(tradeDate)}</span>
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto rounded-xl border-white/[0.08] bg-background/95 p-0">
                    <Calendar
                      mode="single"
                      showOutsideDays={false}
                      selected={parseDateKey(tradeDate)}
                      onSelect={(date) => {
                        if (date) setTradeDate(formatDateKey(date));
                      }}
                      captionLayout="dropdown"
                      startMonth={calendarStart}
                      endMonth={calendarEnd}
                      className="[--cell-size:1.9rem]"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">CATEGORY / SETUP</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} className={cn(inputClass, "mt-1.5")} />
              </div>
              <div>
                <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">TRADE REASONING</label>
                <textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} rows={3} className={cn(inputClass, "mt-1.5 resize-none")} />
              </div>
              <div>
                <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">TRADE GRADE</label>
                <div className="mt-1.5 flex gap-1.5">
                  {GRADES.map((g) => (
                    <button key={g} type="button" onClick={() => setGrade(grade === g ? "" : g)} className={cn("flex-1 rounded-lg py-2 text-xs font-bold ring-1 transition-all duration-200", grade === g ? gradeTone(g) : "bg-white/[0.04] text-muted-foreground ring-white/[0.06] hover:text-foreground")}>{g}</button>
                  ))}
                </div>
              </div>
              <div className="pt-1">
                <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">KILLZONE</label>
                <label className="mt-1.5 flex cursor-pointer items-center gap-2.5 rounded-lg bg-white/[0.04] px-3 py-2 ring-1 ring-white/[0.06] transition hover:ring-primary/30">
                  <input type="checkbox" checked={inKillzone} onChange={(e) => setInKillzone(e.target.checked)} className="h-4 w-4 accent-primary" />
                  <span className="text-sm">Taken during Killzone</span>
                </label>
              </div>
            </div>
          </Section>
        </div>

        {/* Mistakes */}
        <div className="mt-3">
          <Section title="MISTAKES / RULE BREAKS">
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_MISTAKE_TAGS.map((tag) => {
                const active = mistakeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleMistake(tag)}
                    className={cn(
                      "rounded-full px-2.5 py-1.5 text-[11px] font-medium ring-1 transition-all duration-200",
                      active
                        ? "bg-destructive/20 text-destructive ring-destructive/40 shadow-[0_0_0_3px_oklch(0.64_0.22_22/0.08)]"
                        : "bg-white/[0.04] text-muted-foreground ring-white/[0.06] hover:text-foreground",
                    )}
                  >
                    {active && <Check className="mr-1 inline h-3 w-3" />}{tag}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        {/* Similar */}
        {(similar.wins.length > 0 || similar.losses.length > 0) && (
          <div className="mt-3">
            <Section title="SIMILAR TRADES">
              <p className="-mt-1 text-xs text-muted-foreground">
                Resembles <span className="font-semibold text-success">{similar.wins.length} wins</span> and{" "}
                <span className="font-semibold text-destructive">{similar.losses.length} losses</span>.
              </p>
            </Section>
          </div>
        )}

        <div className="mt-3">
          <Section title="COMMUNITY SHARING">
            <label
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] px-3 py-2.5 ring-1 ring-white/[0.05] transition",
                canToggleShare ? "cursor-pointer hover:bg-white/[0.04]" : "opacity-75",
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold">Share with Community</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Group members see only the screenshot, instrument, result, date, and reasoning.
                </div>
                {!canToggleShare && (
                  <div className="mt-1 text-[11px] text-muted-foreground/80">
                    Add a screenshot and trade reasoning to make this trade shareable.
                  </div>
                )}
              </div>
              <input
                type="checkbox"
                checked={shareCommunity}
                disabled={!canToggleShare}
                onChange={(e) => setShareCommunity(e.target.checked)}
                className="h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
              />
            </label>
          </Section>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground">Close</button>
          <button onClick={() => saveM.mutate()} disabled={saveM.isPending} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saveM.isPending ? "Saving…" : "Save review"}
          </button>
        </div>
        {/* Screenshot viewer is portaled to <body>: rendered inline it sits inside a
            transformed (framer-motion) ancestor, which re-anchors `fixed` positioning
            to the modal box — the backdrop then doesn't cover the viewport and clicks
            beside it land on the review modal's own backdrop, closing everything.
            React events from the portal still bubble through the component tree,
            so stopPropagation keeps them away from the review modal's handlers. */}
        {previewShot?.url &&
          createPortal(
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={(event) => {
                event.stopPropagation();
                setPreviewShot(null);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md sm:p-6"
            >
              <div
                className="relative inline-flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)]"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewShot(null);
                  }}
                  aria-label="Close screenshot viewer"
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3.5 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/70 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" /> Close
                </button>
                <motion.img
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={modalTransition}
                  src={previewShot.url}
                  alt={`Screenshot ${previewShot.kind}`}
                  className="max-h-[calc(100vh-2rem)] max-w-full rounded-xl object-contain"
                />
              </div>
            </motion.div>,
            document.body,
          )}
        <ConfirmDialog
          open={confirmShotDelete !== null}
          onOpenChange={(open) => { if (!open) setConfirmShotDelete(null); }}
          title="Delete screenshot?"
          description="This screenshot will be permanently removed from this trade."
          confirmLabel="Delete screenshot"
          destructive
          loading={removeShot.isPending}
          onConfirm={() => {
            if (confirmShotDelete) removeShot.mutate(confirmShotDelete.id);
          }}
        />
      </motion.div>
    </motion.div>
  );
}

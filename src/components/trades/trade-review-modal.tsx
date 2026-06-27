import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { motion } from "framer-motion";
import { X, Pencil, Trash2, Plus, Check, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getTrade, updateTrade, deleteScreenshot, addScreenshot, listTrades, updateScreenshotTimeframe } from "@/lib/trades.functions";
import { validateScreenshotFile } from "@/lib/file-validation";
type AnnotationShape = unknown;
import { GRADES, type Grade } from "@/components/trades/trade-form-modal";
import { rrNum, formatTradeWhen, type DbTrade } from "@/lib/trade-mappers";
import { EMOTIONS } from "@/lib/emotions";

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
}: {
  tradeId: string;
  number: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
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
  const [lessons, setLessons] = useState("");
  const [grade, setGrade] = useState<Grade | "">("");
  const [mistakeTags, setMistakeTags] = useState<string[]>([]);
  const [emotionTags, setEmotionTags] = useState<string[]>([]);
  const [inKillzone, setInKillzone] = useState(false);
  const [tradeDate, setTradeDate] = useState<string>("");
  const [tradeTime, setTradeTime] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!trade || hydrated) return;
    setReasoning(trade.reasoning ?? "");
    setCategory((trade.categories ?? [])[0] ?? "");
    setLessons(trade.lessons_learned ?? "");
    const g = GRADES.includes((trade.grade ?? "") as Grade) ? (trade.grade as Grade) : "";
    setGrade(g);
    setMistakeTags(trade.mistake_tags ?? []);
    setEmotionTags(trade.emotion_tags ?? []);
    setInKillzone(trade.in_killzone === true);
    setTradeDate(trade.trade_date ?? "");
    setTradeTime((trade.trade_time ?? "").slice(0, 5));
    setHydrated(true);
  }, [trade, hydrated]);

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

  const saveM = useMutation({
    mutationFn: async () => {
      if (!trade) return;
      await update({
        data: {
          id: trade.id,
          patch: {
            reasoning: reasoning || null,
            lessons_learned: lessons || null,
            grade: grade || null,
            mistake_tags: mistakeTags,
            emotion_tags: emotionTags,
            in_killzone: inKillzone,
            categories: category.trim() ? [category.trim()] : [],
            ...(tradeDate ? { trade_date: tradeDate } : {}),
            trade_time: tradeTime ? `${tradeTime}:00` : null,
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trade", tradeId] }); toast.success("Screenshot removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTimeframe = useMutation({
    mutationFn: (vars: { id: string; timeframe: "HTF" | "MTF" | "LTF" | "Other" | null }) => updateShotTimeframe({ data: vars }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trade", tradeId] }); toast.success("Screenshot classified"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadShots = useMutation({
    mutationFn: async (files: File[]) => {
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
        await addShot({ data: { trade_id: tradeId, storage_path: path, kind: "after" } });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trade", tradeId] }); toast.success("Screenshot added"); },
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
  const when = formatTradeWhen(trade.trade_date, trade.trade_time);

  const toggleMistake = (tag: string) => setMistakeTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]);
  const toggleEmotion = (key: string) => setEmotionTags((p) => p.includes(key) ? p.filter((t) => t !== key) : [...p, key]);
  

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );

  const inputClass = "w-full rounded-lg bg-white/[0.04] px-3 py-2 text-sm ring-1 ring-white/[0.06] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} onClick={(e: MouseEvent) => e.stopPropagation()} className="glow-card w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">TRADE #{number}</div>
            <h2 className="mt-1 text-2xl font-bold">{trade.instrument}</h2>
            <div className="text-xs text-muted-foreground">{when}</div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground" title="Edit core fields"><Pencil className="h-4 w-4" /></button>
            <button onClick={onDelete} disabled={isDeleting} className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-destructive disabled:opacity-50" title="Delete trade"><Trash2 className="h-4 w-4" /></button>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Trade Facts */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "SIDE", value: side, className: cn("text-sm font-bold", side === "LONG" ? "text-success" : "text-destructive") },
            { label: "RESULT", value: res, className: cn("text-sm font-bold", res === "WIN" && "text-success", res === "LOSS" && "text-destructive", res === "BE" && "text-info") },
            { label: "SESSION", value: trade.session ?? "—", className: "text-sm font-semibold" },
            { label: "REALIZED R", value: trade.achieved_rr != null ? `${positive ? "+" : ""}${r.toFixed(2)}R` : "—", className: cn("text-sm font-bold tabular-nums", positive && "text-success", negative && "text-destructive", !positive && !negative && "text-muted-foreground") },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.04]">
              <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">{item.label}</div>
              <div className={cn("mt-1.5", item.className)}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Screenshots */}
        {(shots.length > 0 || true) && (
          <div className="mt-5">
            <Section title="SCREENSHOTS">
              {shots.length === 0 && (
                <p className="text-xs text-muted-foreground">No screenshots yet.</p>
              )}
              {shots.length > 0 && (
                <div className="grid grid-cols-1 gap-4">
                  {shots.map((s) => s.url ? (
                    <div key={s.id} className="relative overflow-hidden rounded-lg ring-1 ring-white/[0.06]">
                      <img src={s.url} alt={`Screenshot ${s.kind}`} className="w-full object-contain" />
                      <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-center gap-1">
                        {(["HTF", "MTF", "LTF", "Other"] as const).map((tf) => {
                          const active = s.caption === tf;
                          return (
                            <button
                              key={tf}
                              type="button"
                              onClick={() => setTimeframe.mutate({ id: s.id, timeframe: active ? null : tf })}
                              disabled={setTimeframe.isPending}
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 transition-all",
                                active
                                  ? "bg-primary/20 text-primary ring-primary/40"
                                  : "bg-black/60 text-white/70 ring-white/20 hover:bg-black/80 hover:text-white",
                              )}
                            >
                              {tf}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => { if (confirm("Delete this screenshot?")) removeShot.mutate(s.id); }}
                          disabled={removeShot.isPending}
                          title="Delete screenshot"
                          className="ml-auto rounded-full bg-black/60 p-1.5 text-white/70 ring-1 ring-white/20 hover:bg-destructive hover:text-white disabled:opacity-30"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ) : null)}
                </div>
              )}
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all hover:text-foreground hover:ring-white/[0.1]">
                <Plus className="h-3.5 w-3.5" /> {uploadShots.isPending ? "Uploading…" : "Add screenshot"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploadShots.isPending}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) uploadShots.mutate(files);
                    e.target.value = "";
                  }}
                />
              </label>
            </Section>
          </div>
        )}

        {/* Review */}
        <div className="mt-3">
          <Section title="REVIEW">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">TRADE DATE</label>
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className={cn(inputClass, "mt-1.5")}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold tracking-wider text-muted-foreground">TRADE TIME</label>
                  <input
                    type="time"
                    value={tradeTime}
                    onChange={(e) => setTradeTime(e.target.value)}
                    className={cn(inputClass, "mt-1.5")}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground sm:col-span-2 -mt-1">
                  When the trade actually happened. The journal entry was logged separately.
                </p>
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
                <label className="mt-2 flex cursor-pointer items-center gap-2.5 rounded-lg bg-white/[0.04] px-3 py-2 ring-1 ring-white/[0.06] hover:ring-primary/30 transition">
                  <input type="checkbox" checked={inKillzone} onChange={(e) => setInKillzone(e.target.checked)} className="h-4 w-4 accent-primary" />
                  <span className="text-sm">Taken during Killzone</span>
                </label>
              </div>
            </div>
          </Section>
        </div>


        {/* Emotions */}
        <div className="mt-3">
          <Section title="EMOTIONS">
            <div className="flex flex-wrap gap-1.5">
              {EMOTIONS.map((emotion) => {
                const active = emotionTags.includes(emotion.key);
                return (
                  <button
                    key={emotion.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleEmotion(emotion.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium ring-1 transition-all duration-200",
                      active
                        ? "bg-primary/20 text-foreground shadow-[0_0_18px_hsl(var(--primary)/0.18)] ring-primary/50"
                        : "bg-white/[0.04] text-muted-foreground ring-white/[0.06] hover:text-foreground",
                    )}
                  >
                    <span className="text-sm leading-none">{emotion.emoji}</span>
                    <span>{emotion.label}</span>
                  </button>
                );
              })}
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

        {/* Notes */}
        <div className="mt-3">
          <Section title="NOTES">
            <textarea value={lessons} onChange={(e) => setLessons(e.target.value)} rows={3} className={cn(inputClass, "resize-none")} />
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

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground">Close</button>
          <button onClick={() => saveM.mutate()} disabled={saveM.isPending} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saveM.isPending ? "Saving…" : "Save review"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

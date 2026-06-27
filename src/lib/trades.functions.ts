import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkRateLimitOrThrow } from "@/lib/rate-limiter";

const tradeSchema = z.object({
  market: z.enum(["forex", "crypto", "stocks", "indices", "futures", "commodities", "other"]),
  instrument: z.string().min(1).max(64),
  trade_date: z.string(),
  trade_time: z.string().nullable().optional(),
  direction: z.enum(["long", "short"]),
  entry_price: z.number().nullable().optional(),
  stop_loss: z.number().nullable().optional(),
  take_profit: z.number().nullable().optional(),
  exit_price: z.number().nullable().optional(),
  account_size: z.number().nullable().optional(),
  risk_percentage: z.number().nullable().optional(),
  position_size: z.number().nullable().optional(),
  planned_rr: z.string().max(64).nullable().optional(),
  achieved_rr: z.number().nullable().optional(),
  result: z.enum(["win", "loss", "breakeven"]).nullable().optional(),
  grade: z.enum(["A+", "A", "B+", "B", "C", "D"]).nullable().optional(),
  session: z.string().max(64).nullable().optional(),
  killzone: z.enum(["asian", "london", "new_york", "london_close"]).nullable().optional(),
  reasoning: z.string().max(5000).nullable().optional(),
  lessons_learned: z.string().max(5000).nullable().optional(),
  mistakes_made: z.string().max(5000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  emotion_before: z.string().max(64).nullable().optional(),
  emotion_during: z.string().max(64).nullable().optional(),
  emotion_after: z.string().max(64).nullable().optional(),
  mistake_tags: z.array(z.string().max(64)).max(20).default([]),
  categories: z.array(z.string().max(64)).max(20).default([]),
  subcategories: z.array(z.string().max(64)).max(20).default([]),
  is_shared: z.boolean().default(false),
  // New journal/P&L fields (Phase 1 cleanup)
  risk_amount: z.number().nullable().optional(),
  reward_amount: z.number().nullable().optional(),
  pnl_amount: z.number().nullable().optional(),
  private_notes: z.string().max(5000).nullable().optional(),
  // Discipline + emoji emotions (Phase 2 quick-capture refactor)
  in_killzone: z.boolean().nullable().optional(),
  emotion_tags: z.array(z.string().max(32)).max(10).optional(),
});

async function getActiveAccountId(
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("trading_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

export const createTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("create-trade", 60, 60_000);
    const { supabase, userId } = context;
    const account_id = await getActiveAccountId(supabase, userId);
    const { data: row, error } = await supabase
      .from("trades")
      .insert({ ...data, user_id: userId, account_id })
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });


export const updateTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), patch: tradeSchema.partial() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("trades")
      .update(data.patch)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });

export const deleteTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Fetch associated screenshots before deletion so we can clean up storage files.
    const { data: shots } = await context.supabase
      .from("trade_screenshots")
      .select("storage_path")
      .eq("trade_id", data.id)
      .eq("user_id", context.userId);
    // Remove storage files first.
    if (shots?.length) {
      const paths = shots.map((s) => s.storage_path).filter(Boolean) as string[];
      if (paths.length) {
        await context.supabase.storage.from("trade-screenshots").remove(paths);
      }
    }
    // Delete the trade (cascades to trade_screenshots DB rows).
    const { error } = await context.supabase
      .from("trades")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const listTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trades")
      .select("*")
      .eq("user_id", context.userId)
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw safeError(error);
    return data;
  });

export const getTrade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: trade, error }, { data: shots, error: e2 }] = await Promise.all([
      context.supabase.from("trades").select("*").eq("id", data.id).eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("trade_screenshots").select("*").eq("trade_id", data.id).eq("user_id", context.userId).order("created_at"),
    ]);
    if (error) throw safeError(error);
    if (e2) throw safeError(e2);
    if (!trade) throw new Error("Not found");

    const withUrls = await Promise.all(
      (shots ?? []).map(async (s) => {
        const { data: signed } = await context.supabase
          .storage.from("trade-screenshots")
          .createSignedUrl(s.storage_path, 60 * 60);
        return { ...s, url: signed?.signedUrl ?? null };
      }),
    );
    return { trade, screenshots: withUrls };
  });

export const addScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    trade_id: z.string().uuid(),
    storage_path: z.string().min(1).max(512),
    kind: z.enum(["before", "after"]).default("before"),
    caption: z.string().max(255).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("add-screenshot", 20, 60_000);
    // Enforce that the storage path belongs to the caller. Storage upload
    // policies already require the first folder to equal the user's UID, but
    // this row is later read by an admin client (community signed URLs) which
    // bypasses storage RLS, so re-check here to prevent registering another
    // user's path.
    if (!data.storage_path.startsWith(context.userId + "/")) {
      throw new Error("Forbidden: path does not belong to caller");
    }
    // Verify the trade belongs to the caller before attaching a screenshot.
    const { data: trade } = await context.supabase
      .from("trades")
      .select("id")
      .eq("id", data.trade_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!trade) throw new Error("Forbidden");


    const { data: row, error } = await context.supabase
      .from("trade_screenshots")
      .insert({
        trade_id: data.trade_id,
        user_id: context.userId,
        storage_path: data.storage_path,
        kind: data.kind,
        caption: data.caption,
      })
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });

export const deleteScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: shot } = await context.supabase
      .from("trade_screenshots")
      .select("storage_path")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!shot) throw new Error("Forbidden");
    if (shot.storage_path) {
      await context.supabase.storage.from("trade-screenshots").remove([shot.storage_path]);
    }
    const { error } = await context.supabase
      .from("trade_screenshots")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

const annotationShape = z.object({
  id: z.string().max(64),
  type: z.enum(["arrow", "line", "rect", "circle", "text"]),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  color: z.string().max(32).optional(),
  label: z.string().max(120).optional(),
  text: z.string().max(200).optional(),
});

export const updateScreenshotTimeframe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      timeframe: z.enum(["HTF", "MTF", "LTF", "Other"]).nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trade_screenshots")
      .update({ caption: data.timeframe })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const updateScreenshotAnnotations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    annotations: z.array(annotationShape).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trade_screenshots")
      .update({ annotations: data.annotations })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });


// =========================================================
// Paper Trading
// =========================================================

const paperOpenSchema = z.object({
  instrument: z.string().min(1).max(64),
  direction: z.enum(["long", "short"]),
  entry_price: z.number(),
  stop_loss: z.number(),
  take_profit: z.number(),
  account_size: z.number().nullable().optional(),
  risk_percentage: z.number().nullable().optional(),
  position_size: z.number().nullable().optional(),
  planned_rr: z.string().max(64).nullable().optional(),
  session: z.string().max(64).nullable().optional(),
  categories: z.array(z.string().max(64)).max(20).default([]),
  notes: z.string().max(5000).nullable().optional(),
  emotion_before: z.string().max(64).nullable().optional(),
  market: z.enum(["forex", "crypto", "stocks", "indices", "futures", "commodities", "other"]).default("other"),
});

export const openPaperTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => paperOpenSchema.parse(d))
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("open-paper-trade", 30, 60_000);
    const now = new Date();
    const account_id = await getActiveAccountId(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("trades")
      .insert({
        user_id: context.userId,
        account_id,
        market: data.market,

        instrument: data.instrument,
        direction: data.direction,
        entry_price: data.entry_price,
        stop_loss: data.stop_loss,
        take_profit: data.take_profit,
        account_size: data.account_size ?? null,
        risk_percentage: data.risk_percentage ?? null,
        position_size: data.position_size ?? null,
        planned_rr: data.planned_rr ?? null,
        session: data.session ?? null,
        categories: data.categories,
        notes: data.notes ?? null,
        emotion_before: data.emotion_before ?? null,
        trade_date: now.toISOString().slice(0, 10),
        trade_time: now.toISOString().slice(11, 19),
        is_paper: true,
        status: "open",
        opened_at: now.toISOString(),
        live_price: data.entry_price,
        floating_pnl: 0,
      })
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });

export const listOpenPaperTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trades")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_paper", true)
      .eq("status", "open")
      .order("opened_at", { ascending: false });
    if (error) throw safeError(error);
    return data;
  });

export const updatePaperLivePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), live_price: z.number(), floating_pnl: z.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trades")
      .update({ live_price: data.live_price, floating_pnl: data.floating_pnl })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "open");
    if (error) throw safeError(error);
    return { ok: true };
  });

export const closePaperTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    exit_price: z.number(),
    closed_reason: z.enum(["tp", "sl", "manual"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: trade, error: fetchErr } = await context.supabase
      .from("trades")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("is_paper", true)
      .eq("status", "open")
      .maybeSingle();
    if (fetchErr) throw safeError(fetchErr);
    if (!trade) throw new Error("Open paper trade not found");

    const entry = Number(trade.entry_price);
    const sl = Number(trade.stop_loss);
    const tp = Number(trade.take_profit);
    const dir = trade.direction === "long" ? 1 : -1;
    const risk = Math.abs(entry - sl) || 1;
    const achieved_rr = ((data.exit_price - entry) * dir) / risk;
    const reward = Math.abs(tp - entry);
    const rrPlanned = reward / risk;
    let result: "win" | "loss" | "breakeven" = "breakeven";
    if (achieved_rr > 0.05) result = "win";
    else if (achieved_rr < -0.05) result = "loss";

    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("trades")
      .update({
        status: "closed",
        exit_price: data.exit_price,
        closed_reason: data.closed_reason,
        closed_at: now,
        achieved_rr,
        result,
        planned_rr: trade.planned_rr ?? rrPlanned.toFixed(2),
        floating_pnl: null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });

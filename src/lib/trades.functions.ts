import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkRateLimitOrThrow } from "@/lib/rate-limiter";
import { localDateKey, localTimeKey } from "@/lib/trade-mappers";
import { isOwnedScreenshotPath } from "@/lib/screenshot-storage";
import {
  missingReviewRequirements,
  requirementsFromPreferences,
  type ReviewRequirementKey,
} from "@/lib/review-requirements";
import type { Database } from "@/integrations/supabase/types";
import {
  normalizeSingleValue,
  normalizeEntryTimeframe,
  normalizeTags,
  normalizeTradeManagement,
  journalTrackingFromPreferences,
  tradeCompletenessRequirementsFromPreferences,
} from "@/lib/journal-tracking";
import { getReviewStatus } from "@/lib/review-status";

type TradeListRow = Database["public"]["Tables"]["trades"]["Row"] & {
  trade_screenshots: { id: string }[] | null;
};

const tradeSchema = z.object({
  market: z.enum(["forex", "crypto", "stocks", "indices", "futures", "commodities", "other"]),
  instrument: z.string().trim().max(64).nullable().optional(),
  trade_date: z.string(),
  trade_time: z.string().nullable().optional(),
  direction: z.enum(["long", "short"]).nullable().optional(),
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
  // New journal/P&L fields (Phase 1 cleanup)
  risk_amount: z.number().nullable().optional(),
  reward_amount: z.number().nullable().optional(),
  pnl_amount: z.number().nullable().optional(),
  private_notes: z.string().max(5000).nullable().optional(),
  // Discipline + emoji emotions (Phase 2 quick-capture refactor)
  in_killzone: z.boolean().nullable().optional(),
  emotion_tags: z.array(z.string().max(32)).max(10).optional(),
  entry_model: z.string().max(80).nullable().optional(),
  market_condition: z.string().max(80).nullable().optional(),
  entry_timeframe: z.string().max(32).nullable().optional(),
  news_involvement: z.string().max(80).nullable().optional(),
  exit_reason: z.string().max(80).nullable().optional(),
  trade_management: z.array(z.string().max(80)).max(8).optional(),
  custom_tags: z.array(z.string().max(48)).max(12).optional(),
});

const createTradeSchema = tradeSchema;

const detailedReviewPatchSchema = z.object({
  reasoning: z.string().max(5000).nullable().optional(),
  grade: z.enum(["A+", "A", "B+", "B", "C", "D"]).nullable().optional(),
  mistake_tags: z.array(z.string().max(64)).max(20).optional(),
  in_killzone: z.boolean().nullable().optional(),
  categories: z.array(z.string().max(64)).max(20).optional(),
  entry_model: z.string().max(80).nullable().optional(),
  session: z.string().max(64).nullable().optional(),
  planned_rr: z.string().max(64).nullable().optional(),
  market_condition: z.string().max(80).nullable().optional(),
  entry_timeframe: z.string().max(32).nullable().optional(),
  news_involvement: z.string().max(80).nullable().optional(),
  exit_reason: z.string().max(80).nullable().optional(),
  trade_management: z.array(z.string().max(80)).max(8).optional(),
  custom_tags: z.array(z.string().max(48)).max(12).optional(),
  emotion_tags: z.array(z.string().max(32)).max(10).optional(),
  risk_amount: z.number().nullable().optional(),
  reward_amount: z.number().nullable().optional(),
  pnl_amount: z.number().nullable().optional(),
  trade_date: z.string().optional(),
});

function normalizeJournalPayload<
  T extends { result?: string | null; pnl_amount?: number | null; reward_amount?: number | null },
>(data: T): T {
  if (data.result !== "win" && data.result !== "loss" && data.result !== "breakeven") return data;
  const amount = data.pnl_amount ?? data.reward_amount;
  if (amount == null || !Number.isFinite(amount)) return data;
  const pnl =
    data.result === "loss" ? -Math.abs(amount) : data.result === "win" ? Math.abs(amount) : 0;
  return { ...data, pnl_amount: pnl, reward_amount: pnl };
}

function normalizeOptionalTracking<T extends Record<string, unknown>>(data: T): T {
  return {
    ...data,
    ...(Object.hasOwn(data, "entry_model")
      ? { entry_model: normalizeSingleValue(data.entry_model as string | null) }
      : {}),
    ...(Object.hasOwn(data, "market_condition")
      ? { market_condition: normalizeSingleValue(data.market_condition as string | null) }
      : {}),
    ...(Object.hasOwn(data, "entry_timeframe")
      ? { entry_timeframe: normalizeEntryTimeframe(data.entry_timeframe as string | null) }
      : {}),
    ...(Object.hasOwn(data, "news_involvement")
      ? { news_involvement: normalizeSingleValue(data.news_involvement as string | null) }
      : {}),
    ...(Object.hasOwn(data, "exit_reason")
      ? { exit_reason: normalizeSingleValue(data.exit_reason as string | null) }
      : {}),
    ...(Object.hasOwn(data, "trade_management")
      ? { trade_management: normalizeTradeManagement(data.trade_management as string[] | null) }
      : {}),
    ...(Object.hasOwn(data, "custom_tags")
      ? { custom_tags: normalizeTags(data.custom_tags as string[] | null) }
      : {}),
  } as T;
}

async function getActiveAccountId(supabase: any, userId: string): Promise<string | null> {
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
  .inputValidator((d) => createTradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("create-trade", 60, 60_000);
    const { supabase, userId } = context;
    let account_id = await getActiveAccountId(supabase, userId);
    if (!account_id) {
      // Idempotently get or create default account
      const { data: existing } = await supabase
        .from("trading_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("name", "Personal")
        .eq("account_type", "personal")
        .limit(1)
        .maybeSingle();

      if (existing) {
        account_id = existing.id;
        await supabase.from("trading_accounts").update({ is_active: true }).eq("id", account_id);
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("trading_accounts")
          .insert({
            user_id: userId,
            name: "Personal",
            account_type: "personal",
            starting_balance: 0,
            is_active: true,
          })
          .select("id")
          .single();
        if (insErr) {
          const { data: retry } = await supabase
            .from("trading_accounts")
            .select("id")
            .eq("user_id", userId)
            .eq("is_active", true)
            .maybeSingle();
          account_id = retry?.id ?? null;
        } else {
          account_id = inserted.id;
        }
      }
    }

    const journalData = normalizeOptionalTracking(normalizeJournalPayload(data));
    let calculatedAchievedRR = journalData.achieved_rr;
    if (journalData.risk_amount && journalData.risk_amount > 0 && journalData.pnl_amount != null) {
      calculatedAchievedRR = Number((journalData.pnl_amount / journalData.risk_amount).toFixed(2));
    }

    const { data: row, error } = await supabase
      .from("trades")
      .insert({ ...journalData, user_id: userId, account_id, achieved_rr: calculatedAchievedRR })
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });

export const updateTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), patch: tradeSchema.partial() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: currentTrade } = await context.supabase
      .from("trades")
      .select("risk_amount, pnl_amount, reward_amount")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    const mergedRisk =
      data.patch.risk_amount !== undefined
        ? data.patch.risk_amount
        : (currentTrade?.risk_amount ?? null);
    const normalizedPatch = normalizeOptionalTracking(normalizeJournalPayload(data.patch));
    const mergedPnl =
      normalizedPatch.pnl_amount !== undefined
        ? normalizedPatch.pnl_amount
        : (currentTrade?.pnl_amount ?? currentTrade?.reward_amount ?? null);

    let calculatedAchievedRR = normalizedPatch.achieved_rr;
    if (mergedRisk && mergedRisk > 0 && mergedPnl != null) {
      calculatedAchievedRR = Number((mergedPnl / mergedRisk).toFixed(2));
    }

    const { data: row, error } = await context.supabase
      .from("trades")
      .update({
        ...normalizedPatch,
        ...(calculatedAchievedRR !== undefined ? { achieved_rr: calculatedAchievedRR } : {}),
      })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });

export const saveDetailedReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), patch: detailedReviewPatchSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [
      { data: currentTrade, error: tradeError },
      { count: screenshotCount, error: screenshotError },
      { data: preferences, error: preferenceError },
    ] = await Promise.all([
      context.supabase
        .from("trades")
        .select(
          "instrument, direction, result, risk_amount, reward_amount, pnl_amount, session, planned_rr, reasoning, grade, categories, review_completed_at, emotion_tags, entry_model, market_condition, entry_timeframe, news_involvement, exit_reason, trade_management, custom_tags",
        )
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("trade_screenshots")
        .select("id", { count: "exact", head: true })
        .eq("trade_id", data.id)
        .eq("user_id", context.userId),
      context.supabase
        .from("trading_preferences")
        .select(
          "review_require_screenshot, review_require_reasoning, review_require_category, review_require_grade, review_require_entry_model, review_require_market_condition, review_require_entry_timeframe, review_require_news_involvement, review_require_exit_reason, review_require_trade_management, review_require_custom_tags, journal_tracking",
        )
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (tradeError) throw safeError(tradeError);
    if (screenshotError) throw safeError(screenshotError);
    if (preferenceError) throw safeError(preferenceError);
    if (!currentTrade) throw new Error("Not found");

    const categories = (data.patch.categories ?? currentTrade.categories ?? [])
      .map((category) => category.trim())
      .filter(Boolean);
    const patch = normalizeJournalPayload(
      normalizeOptionalTracking({
        ...data.patch,
        reasoning:
          data.patch.reasoning === undefined
            ? currentTrade.reasoning
            : data.patch.reasoning?.trim() || null,
        grade: data.patch.grade === undefined ? currentTrade.grade : data.patch.grade,
        categories,
        entry_model:
          data.patch.entry_model === undefined ? currentTrade.entry_model : data.patch.entry_model,
        market_condition:
          data.patch.market_condition === undefined
            ? currentTrade.market_condition
            : data.patch.market_condition,
        entry_timeframe:
          data.patch.entry_timeframe === undefined
            ? currentTrade.entry_timeframe
            : data.patch.entry_timeframe,
        news_involvement:
          data.patch.news_involvement === undefined
            ? currentTrade.news_involvement
            : data.patch.news_involvement,
        exit_reason:
          data.patch.exit_reason === undefined ? currentTrade.exit_reason : data.patch.exit_reason,
        trade_management:
          data.patch.trade_management === undefined
            ? currentTrade.trade_management
            : data.patch.trade_management,
        custom_tags:
          data.patch.custom_tags === undefined ? currentTrade.custom_tags : data.patch.custom_tags,
        emotion_tags:
          data.patch.emotion_tags === undefined
            ? currentTrade.emotion_tags
            : data.patch.emotion_tags,
        risk_amount:
          data.patch.risk_amount === undefined ? currentTrade.risk_amount : data.patch.risk_amount,
        reward_amount:
          data.patch.reward_amount === undefined
            ? currentTrade.reward_amount
            : data.patch.reward_amount,
        pnl_amount:
          data.patch.pnl_amount === undefined ? currentTrade.pnl_amount : data.patch.pnl_amount,
        result: currentTrade.result,
      }),
    );
    const calculatedAchievedRR =
      patch.risk_amount != null &&
      patch.risk_amount > 0 &&
      patch.pnl_amount != null &&
      Number.isFinite(patch.pnl_amount)
        ? Number((patch.pnl_amount / patch.risk_amount).toFixed(2))
        : null;
    const requirements = requirementsFromPreferences(preferences);
    const missing = missingReviewRequirements(
      {
        screenshot_count: screenshotCount ?? 0,
        reasoning: patch.reasoning,
        categories,
        grade: patch.grade,
        entry_model: patch.entry_model,
        market_condition: patch.market_condition,
        entry_timeframe: patch.entry_timeframe,
        news_involvement: patch.news_involvement,
        exit_reason: patch.exit_reason,
        trade_management: patch.trade_management,
        custom_tags: patch.custom_tags,
      },
      requirements,
    );

    if (requirements.category && !missing.includes("category") && categories.length > 0) {
      const normalizedCategories = categories.map((category) => category.toLocaleLowerCase());
      const { data: validCategories, error: categoryError } = await context.supabase
        .from("trade_categories")
        .select("normalized_name")
        .eq("user_id", context.userId)
        .is("archived_at", null)
        .in("normalized_name", normalizedCategories);
      if (categoryError) throw safeError(categoryError);
      if (!(validCategories ?? []).length) missing.push("category");
    }

    const pendingMissingRequirements = currentTrade.review_completed_at ? [] : missing;
    const tracking = journalTrackingFromPreferences(preferences?.journal_tracking);
    const completenessStatus = getReviewStatus({
      ...currentTrade,
      ...patch,
      achieved_rr: calculatedAchievedRR,
      screenshot_count: screenshotCount ?? 0,
      r_performance_enabled: tracking.r_performance !== "hidden",
      trade_completeness_requirements: tradeCompletenessRequirementsFromPreferences(
        preferences?.journal_tracking,
      ),
    });
    const reviewCompletedAt =
      currentTrade.review_completed_at ??
      (pendingMissingRequirements.length === 0 && completenessStatus !== "incomplete"
        ? new Date().toISOString()
        : null);
    const { data: row, error: updateError } = await context.supabase
      .from("trades")
      .update({
        ...patch,
        achieved_rr: calculatedAchievedRR,
        ...(reviewCompletedAt ? { review_completed_at: reviewCompletedAt } : {}),
      })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (updateError) throw safeError(updateError);

    return {
      trade: row,
      missingRequirements: pendingMissingRequirements as ReviewRequirementKey[],
      reviewCompletedAt: reviewCompletedAt ?? null,
    };
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
        const { error: storageError } = await context.supabase.storage
          .from("trade-screenshots")
          .remove(paths);
        if (storageError) throw safeError(storageError);
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
    const pageSize = 500;
    const rows: TradeListRow[] = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await context.supabase
        .from("trades")
        .select("*, trade_screenshots(id)")
        .eq("user_id", context.userId)
        .order("trade_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw safeError(error);
      rows.push(...((data ?? []) as TradeListRow[]));
      if (!data || data.length < pageSize) break;
    }

    return rows;
  });

export const getTrade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: trade, error }, { data: shots, error: e2 }] = await Promise.all([
      context.supabase
        .from("trades")
        .select("*")
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("trade_screenshots")
        .select("*")
        .eq("trade_id", data.id)
        .eq("user_id", context.userId)
        .order("created_at"),
    ]);
    if (error) throw safeError(error);
    if (e2) throw safeError(e2);
    if (!trade) throw new Error("Not found");

    const withUrls = await Promise.all(
      (shots ?? []).map(async (s) => {
        if (!isOwnedScreenshotPath(s.storage_path, context.userId, data.id)) {
          return { ...s, url: null };
        }
        const { data: signed } = await context.supabase.storage
          .from("trade-screenshots")
          .createSignedUrl(s.storage_path, 60 * 60);
        return { ...s, url: signed?.signedUrl ?? null };
      }),
    );
    return { trade, screenshots: withUrls };
  });

export const addScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        trade_id: z.string().uuid(),
        storage_path: z.string().min(1).max(512),
        kind: z.enum(["before", "after"]).default("before"),
        caption: z.string().max(255).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("add-screenshot", 20, 60_000);
    // Enforce that the storage path belongs to the caller. Storage upload
    // policies already require the first folder to equal the user's UID, but
    // this row is later read by an admin client (community signed URLs) which
    // bypasses storage RLS, so re-check here to prevent registering another
    // user's path.
    if (!isOwnedScreenshotPath(data.storage_path, context.userId, data.trade_id)) {
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

    const { count, error: countError } = await context.supabase
      .from("trade_screenshots")
      .select("id", { count: "exact", head: true })
      .eq("trade_id", data.trade_id)
      .eq("user_id", context.userId);
    if (countError) throw safeError(countError);
    if ((count ?? 0) >= 3) {
      throw new Error("Each trade can have up to 3 screenshots. Remove one before adding another.");
    }

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
      const { error: storageError } = await context.supabase.storage
        .from("trade-screenshots")
        .remove([shot.storage_path]);
      if (storageError) throw safeError(storageError);
    }
    const { error } = await context.supabase
      .from("trade_screenshots")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const replaceScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        storage_path: z.string().min(1).max(500),
        kind: z.enum(["before", "after"]),
        caption: z.string().max(120).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("replace-screenshot", 20, 60_000);
    const { data: current } = await context.supabase
      .from("trade_screenshots")
      .select("storage_path, trade_id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!current) throw new Error("Forbidden");
    if (!isOwnedScreenshotPath(data.storage_path, context.userId, current.trade_id)) {
      throw new Error("Forbidden: path does not belong to caller");
    }

    const { data: row, error } = await context.supabase
      .from("trade_screenshots")
      .update({
        storage_path: data.storage_path,
        kind: data.kind,
        caption: data.caption,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw safeError(error);

    if (current.storage_path && current.storage_path !== data.storage_path) {
      const { error: cleanupError } = await context.supabase.storage
        .from("trade-screenshots")
        .remove([current.storage_path]);
      if (cleanupError) {
        console.error("[screenshot-replace] Previous object cleanup failed", {
          code: cleanupError.name || "storage_remove_failed",
        });
      }
    }
    return row;
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
    z
      .object({
        id: z.string().uuid(),
        timeframe: z.enum(["HTF", "MTF", "LTF"]).nullable(),
      })
      .parse(d),
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
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        annotations: z.array(annotationShape).max(200),
      })
      .parse(d),
  )
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
  market: z
    .enum(["forex", "crypto", "stocks", "indices", "futures", "commodities", "other"])
    .default("other"),
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
        trade_date: localDateKey(now),
        trade_time: localTimeKey(now),
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
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), live_price: z.number(), floating_pnl: z.number() }).parse(d),
  )
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
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        exit_price: z.number(),
        closed_reason: z.enum(["tp", "sl", "manual"]),
      })
      .parse(d),
  )
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

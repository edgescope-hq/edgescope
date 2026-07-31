import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { journalTrackingConfigSchema, type JournalTrackingConfig } from "@/lib/journal-tracking";
import type { Json } from "@/integrations/supabase/types";
import {
  ANALYTICS_KPI_IDS,
  ANALYTICS_SECTION_IDS,
  analyticsPreferencesFromStored,
  analyticsPreferencesForStorage,
} from "@/lib/analytics-sections";

export type TradingPreferences = {
  id: string;
  user_id: string;
  starting_balance: number | null;
  account_type: "personal" | "funded" | "demo" | null;
  default_risk_pct: number | null;
  max_trades_per_day: number | null;
  max_daily_loss: number | null;
  max_daily_profit: number | null;
  primary_market: "forex" | "crypto" | "indices" | "gold" | "stocks" | null;
  primary_session: "london" | "new_york" | "asian" | "multiple" | null;
  require_screenshot: boolean;
  require_setup_selection: boolean;
  require_post_trade_reflection: boolean;
  review_require_screenshot: boolean;
  review_require_reasoning: boolean;
  review_require_category: boolean;
  review_require_grade: boolean;
  review_require_entry_model: boolean;
  review_require_market_condition: boolean;
  review_require_entry_timeframe: boolean;
  review_require_news_involvement: boolean;
  review_require_exit_reason: boolean;
  review_require_trade_management: boolean;
  review_require_custom_tags: boolean;
  journal_tracking: Json;
  analytics_preferences: Json;
  created_at: string;
  updated_at: string;
};

const prefsSchema = z.object({
  starting_balance: z.number().nonnegative().nullable().optional(),
  account_type: z.enum(["personal", "funded", "demo"]).nullable().optional(),
  default_risk_pct: z.number().min(0).max(100).nullable().optional(),
  max_trades_per_day: z.number().int().min(0).max(1000).nullable().optional(),
  max_daily_loss: z.number().nonnegative().nullable().optional(),
  max_daily_profit: z.number().nonnegative().nullable().optional(),
  primary_market: z.enum(["forex", "crypto", "indices", "gold", "stocks"]).nullable().optional(),
  primary_session: z.enum(["london", "new_york", "asian", "multiple"]).nullable().optional(),
  require_screenshot: z.boolean().optional(),
  require_setup_selection: z.boolean().optional(),
  require_post_trade_reflection: z.boolean().optional(),
  review_require_screenshot: z.boolean().optional(),
  review_require_reasoning: z.boolean().optional(),
  review_require_category: z.boolean().optional(),
  review_require_grade: z.boolean().optional(),
  review_require_entry_model: z.boolean().optional(),
  review_require_market_condition: z.boolean().optional(),
  review_require_entry_timeframe: z.boolean().optional(),
  review_require_news_involvement: z.boolean().optional(),
  review_require_exit_reason: z.boolean().optional(),
  review_require_trade_management: z.boolean().optional(),
  review_require_custom_tags: z.boolean().optional(),
  journal_tracking: journalTrackingConfigSchema.optional(),
  analytics_preferences: z
    .object({
      hidden: z.array(z.enum(ANALYTICS_SECTION_IDS)).optional(),
      order: z.array(z.enum(ANALYTICS_SECTION_IDS)).optional(),
      summaryCards: z.array(z.enum(ANALYTICS_KPI_IDS)).optional(),
      summary_cards: z.array(z.enum(ANALYTICS_KPI_IDS)).optional(),
    })
    .strict()
    .transform((input) => analyticsPreferencesForStorage(analyticsPreferencesFromStored(input)))
    .optional(),
});

const analyticsPreferencesSchema = z
  .object({
    hidden: z.array(z.enum(ANALYTICS_SECTION_IDS)).optional(),
    order: z.array(z.enum(ANALYTICS_SECTION_IDS)).optional(),
    summaryCards: z.array(z.enum(ANALYTICS_KPI_IDS)).optional(),
    summary_cards: z.array(z.enum(ANALYTICS_KPI_IDS)).optional(),
  })
  .strict()
  .transform((input) => analyticsPreferencesForStorage(analyticsPreferencesFromStored(input)));

/**
 * Journal Settings intentionally accepts only journal-owned fields. Keeping
 * this separate from the account-preference payload prevents an unrelated
 * account validation rule from blocking a placement or requirement update.
 */
const journalPreferencesSchema = z
  .object({
    journal_tracking: journalTrackingConfigSchema,
    review_require_screenshot: z.boolean().optional(),
    review_require_reasoning: z.boolean().optional(),
    review_require_category: z.boolean().optional(),
    review_require_grade: z.boolean().optional(),
    review_require_entry_model: z.boolean().optional(),
    review_require_market_condition: z.boolean().optional(),
    review_require_entry_timeframe: z.boolean().optional(),
    review_require_news_involvement: z.boolean().optional(),
    review_require_exit_reason: z.boolean().optional(),
    review_require_trade_management: z.boolean().optional(),
    review_require_custom_tags: z.boolean().optional(),
  })
  .strict();

export const getTradingPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trading_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw safeError(error);
    return (data ?? null) as TradingPreferences | null;
  });
export const upsertTradingPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => prefsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const { data: row, error } = await context.supabase
      .from("trading_preferences")
      .upsert({ user_id: context.userId, ...payload }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw safeError(error);
    return row as TradingPreferences;
  });
export const updateJournalTrackingPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => journalTrackingConfigSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("trading_preferences")
      .upsert(
        { user_id: context.userId, journal_tracking: data as Json },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw safeError(error);
    return row as TradingPreferences;
  });

export const updateJournalPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => journalPreferencesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("trading_preferences")
      .upsert({ user_id: context.userId, ...data, journal_tracking: data.journal_tracking as Json }, {
        onConflict: "user_id",
      })
      .select()
      .single();
    if (error) throw safeError(error);
    return row as TradingPreferences;
  });

export const updateAnalyticsPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => analyticsPreferencesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("trading_preferences")
      .upsert(
        { user_id: context.userId, analytics_preferences: data as Json },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw safeError(error);
    return row as TradingPreferences;
  });

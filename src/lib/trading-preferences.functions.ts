import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  created_at: string;
  updated_at: string;
};

const prefsSchema = z.object({
  starting_balance: z.number().nonnegative().nullable(),
  account_type: z.enum(["personal", "funded", "demo"]).nullable(),
  default_risk_pct: z.number().min(0).max(100).nullable(),
  max_trades_per_day: z.number().int().min(0).max(1000).nullable(),
  max_daily_loss: z.number().nonnegative().nullable(),
  max_daily_profit: z.number().nonnegative().nullable(),
  primary_market: z.enum(["forex", "crypto", "indices", "gold", "stocks"]).nullable().optional(),
  primary_session: z.enum(["london", "new_york", "asian", "multiple"]).nullable().optional(),
  require_screenshot: z.boolean().optional(),
  require_setup_selection: z.boolean().optional(),
  require_post_trade_reflection: z.boolean().optional(),
});

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

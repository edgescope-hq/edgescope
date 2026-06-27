import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TradingAccount = {
  id: string;
  user_id: string;
  name: string;
  account_type: "personal" | "funded" | "demo" | "live" | "challenge" | "backtest";
  starting_balance: number;
  status: "active" | "archived";
  is_active: boolean;
  broker: string | null;
  challenge_provider: string | null;
  challenge_phase: string | null;
  max_risk_per_trade_pct: number | null;
  daily_loss_limit_pct: number | null;
  weekly_loss_limit_pct: number | null;
  monthly_loss_limit_pct: number | null;
  max_open_positions: number | null;
  max_correlated_positions: number | null;
  news_trading_allowed: boolean;
  weekend_holding_allowed: boolean;
  created_at: string;
  updated_at: string;
};

const accountInputSchema = z.object({
  name: z.string().min(1).max(80),
  account_type: z.enum(["personal", "funded", "demo", "live", "challenge", "backtest"]).default("personal"),
  starting_balance: z.number().nonnegative(),
  broker: z.string().max(80).nullable().optional(),
  challenge_provider: z.string().max(80).nullable().optional(),
  challenge_phase: z.string().max(80).nullable().optional(),
  max_risk_per_trade_pct: z.number().min(0).max(100).nullable().optional(),
  daily_loss_limit_pct: z.number().min(0).max(100).nullable().optional(),
  weekly_loss_limit_pct: z.number().min(0).max(100).nullable().optional(),
  monthly_loss_limit_pct: z.number().min(0).max(100).nullable().optional(),
  max_open_positions: z.number().int().min(0).max(1000).nullable().optional(),
  max_correlated_positions: z.number().int().min(0).max(1000).nullable().optional(),
  news_trading_allowed: z.boolean().optional(),
  weekend_holding_allowed: z.boolean().optional(),
});

export const listTradingAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trading_accounts")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw safeError(error);
    return (data ?? []) as TradingAccount[];
  });

export const createTradingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => accountInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // If user has no active account yet, make this one active.
    const { count } = await context.supabase
      .from("trading_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("is_active", true);
    const shouldActivate = (count ?? 0) === 0;

    const { data: row, error } = await context.supabase
      .from("trading_accounts")
      .insert({
        user_id: context.userId,
        name: data.name,
        account_type: data.account_type,
        starting_balance: data.starting_balance,
        broker: data.broker ?? null,
        challenge_provider: data.challenge_provider ?? null,
        challenge_phase: data.challenge_phase ?? null,
        max_risk_per_trade_pct: data.max_risk_per_trade_pct ?? null,
        daily_loss_limit_pct: data.daily_loss_limit_pct ?? null,
        is_active: shouldActivate,
      })
      .select()
      .single();
    if (error) throw safeError(error);
    return row as TradingAccount;
  });

export const updateTradingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: accountInputSchema.partial(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trading_accounts")
      .update(data.patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const archiveTradingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "archived"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // If archiving the active one, unset is_active first.
    if (data.status === "archived") {
      await context.supabase
        .from("trading_accounts")
        .update({ is_active: false })
        .eq("id", data.id)
        .eq("user_id", context.userId);
    }
    const { error } = await context.supabase
      .from("trading_accounts")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const setActiveTradingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Clear current active, then set the chosen one. Two steps to satisfy the
    // partial unique index.
    const { error: clearErr } = await context.supabase
      .from("trading_accounts")
      .update({ is_active: false })
      .eq("user_id", context.userId)
      .eq("is_active", true);
    if (clearErr) throw safeError(clearErr);

    const { error } = await context.supabase
      .from("trading_accounts")
      .update({ is_active: true, status: "active" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const deleteTradingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Block delete if there are any trades on this account; user should archive instead.
    const { count, error: cntErr } = await context.supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("account_id", data.id);
    if (cntErr) throw safeError(cntErr);
    if ((count ?? 0) > 0) {
      throw new Error("This account has trades. Archive it instead.");
    }
    // Drop dependent guardrails row first (no cascade defined).
    await context.supabase
      .from("account_guardrails")
      .delete()
      .eq("user_id", context.userId)
      .eq("account_id", data.id);
    const { error } = await context.supabase
      .from("trading_accounts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  accountTypePreservesEvidencePopulation,
  type EvidenceAccountType,
} from "@/lib/evidence-population";

export type TradingAccount = {
  id: string;
  user_id: string;
  name: string;
  account_type: EvidenceAccountType;
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
  max_trades_per_day: number | null;
  news_trading_allowed: boolean;
  weekend_holding_allowed: boolean;
  created_at: string;
  updated_at: string;
};

const accountInputSchema = z.object({
  name: z.string().min(1).max(80),
  account_type: z
    .enum(["personal", "funded", "demo", "live", "challenge", "backtest"])
    .default("personal"),
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
  max_trades_per_day: z.number().int().min(0).max(1000).nullable().optional(),
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
    // If the user has no Default Trade Account yet, make this the default.
    const { count } = await context.supabase
      .from("trading_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("is_active", true);
    const shouldActivate = (count ?? 0) === 0;

    // Idempotency check for fallback account name "Personal"
    if (data.name === "Personal" && data.account_type === "personal") {
      const { data: existing } = await context.supabase
        .from("trading_accounts")
        .select("*")
        .eq("user_id", context.userId)
        .eq("name", "Personal")
        .eq("account_type", "personal")
        .eq("status", "active")
        .maybeSingle();
      if (existing) {
        if (!existing.is_active && shouldActivate) {
          await context.supabase
            .from("trading_accounts")
            .update({ is_active: true })
            .eq("id", existing.id);
          existing.is_active = true;
        }
        return existing as TradingAccount;
      }
    }

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
        max_trades_per_day: data.max_trades_per_day ?? null,
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
    const { data: current, error: currentError } = await context.supabase
      .from("trading_accounts")
      .select("id, account_type")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (currentError) throw safeError(currentError);
    if (!current) throw new Error("Trading account not found");
    if (
      data.patch.account_type &&
      !accountTypePreservesEvidencePopulation(current.account_type, data.patch.account_type)
    ) {
      throw new Error(
        "An account cannot change between actual, practice, and research evidence. Create a separate account so its history keeps its original meaning.",
      );
    }

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
    const { data: target, error: targetError } = await context.supabase
      .from("trading_accounts")
      .select("id, is_active, status")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (targetError) throw safeError(targetError);
    if (!target) throw new Error("Trading account not found");

    const { error } = await context.supabase
      .from("trading_accounts")
      .update({ status: data.status, ...(data.status === "archived" ? { is_active: false } : {}) })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);

    // Keep the Default Trade Account invariant when the retired account was
    // previously the default. Historical trades remain attached to the archive.
    if (data.status === "archived" && target.is_active) {
      const restoreTarget = async () => {
        await context.supabase
          .from("trading_accounts")
          .update({ status: target.status, is_active: true })
          .eq("id", target.id)
          .eq("user_id", context.userId);
      };
      const { data: replacement, error: replacementError } = await context.supabase
        .from("trading_accounts")
        .select("id")
        .eq("user_id", context.userId)
        .eq("status", "active")
        .neq("id", data.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (replacementError) {
        await restoreTarget();
        throw safeError(replacementError);
      }
      if (replacement) {
        const { error: defaultError } = await context.supabase
          .from("trading_accounts")
          .update({ is_active: true })
          .eq("id", replacement.id)
          .eq("user_id", context.userId);
        if (defaultError) {
          await restoreTarget();
          throw safeError(defaultError);
        }
      }
    }
    return { ok: true };
  });

export const setDefaultTradingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: target, error: targetErr } = await context.supabase
      .from("trading_accounts")
      .select("id, is_active, status")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (targetErr) throw safeError(targetErr);
    if (!target) throw new Error("Trading account not found");
    if (target.is_active && target.status === "active") return { ok: true };

    const { data: previousActive, error: prevErr } = await context.supabase
      .from("trading_accounts")
      .select("id")
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .maybeSingle();
    if (prevErr) throw safeError(prevErr);

    const { error: clearErr } = await context.supabase
      .from("trading_accounts")
      .update({ is_active: false })
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .neq("id", data.id);
    if (clearErr) throw safeError(clearErr);

    const { data: activated, error } = await context.supabase
      .from("trading_accounts")
      .update({ is_active: true, status: "active" })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id")
      .maybeSingle();
    if (error || !activated) {
      if (previousActive?.id) {
        await context.supabase
          .from("trading_accounts")
          .update({ is_active: true })
          .eq("id", previousActive.id)
          .eq("user_id", context.userId);
      }
      if (error) throw safeError(error);
      throw new Error("Trading account not found");
    }
    return { ok: true };
  });

/** @deprecated Internal compatibility alias. Product copy calls this the
 * Default Trade Account; Account View is the separate saved filter. */
export const setActiveTradingAccount = setDefaultTradingAccount;

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

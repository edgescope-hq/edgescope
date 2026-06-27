import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccountGuardrails = {
  id: string;
  user_id: string;
  account_id: string;
  stop_after_consecutive_losses: number | null;
  stop_after_daily_loss: boolean;
  cooldown_minutes_after_loss: number | null;
  require_trade_plan: boolean;
  require_screenshot: boolean;
  require_post_trade_review: boolean;
  lock_after_emotional_violations: number | null;
  daily_loss_reminder: boolean;
  created_at: string;
  updated_at: string;
};

const guardrailsPatchSchema = z.object({
  stop_after_consecutive_losses: z.number().int().min(0).max(100).nullable().optional(),
  stop_after_daily_loss: z.boolean().optional(),
  cooldown_minutes_after_loss: z.number().int().min(0).max(1440).nullable().optional(),
  require_trade_plan: z.boolean().optional(),
  require_screenshot: z.boolean().optional(),
  require_post_trade_review: z.boolean().optional(),
  lock_after_emotional_violations: z.number().int().min(0).max(100).nullable().optional(),
  daily_loss_reminder: z.boolean().optional(),
});

export const getGuardrails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("account_guardrails")
      .select("*")
      .eq("account_id", data.account_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw safeError(error);
    return (row ?? null) as AccountGuardrails | null;
  });

export const upsertGuardrails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        account_id: z.string().uuid(),
        patch: guardrailsPatchSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify the account belongs to the user before we tie a guardrail row to it.
    const { data: acct, error: acctErr } = await context.supabase
      .from("trading_accounts")
      .select("id")
      .eq("id", data.account_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (acctErr) throw safeError(acctErr);
    if (!acct) throw new Error("Account not found");

    const payload = Object.fromEntries(
      Object.entries(data.patch).filter(([, v]) => v !== undefined),
    );

    const { data: row, error } = await context.supabase
      .from("account_guardrails")
      .upsert(
        { user_id: context.userId, account_id: data.account_id, ...payload },
        { onConflict: "account_id" },
      )
      .select()
      .single();
    if (error) throw safeError(error);
    return row as AccountGuardrails;
  });

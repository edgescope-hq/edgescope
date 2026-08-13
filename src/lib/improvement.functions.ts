import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeError } from "@/lib/server-errors";
import { isTradeEligibleForFocus } from "@/lib/improvement";
import { journalEvidencePopulationForTrade } from "@/lib/evidence-population";

export type ImprovementFocus = {
  id: string;
  user_id: string;
  origin: "scope" | "trader";
  state: "active" | "closed" | "stopped";
  behavior: string;
  trigger_situation: string;
  intended_behavior: string;
  grounding: string;
  relevant_evidence_definition: string;
  source_discovery_id: string | null;
  source_trade_ids: string[];
  standard_version_id: string | null;
  activated_at: string;
  closed_at: string | null;
  resolution: "improved" | "unresolved" | "unsupported" | "no_longer_applicable" | null;
  closure_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ImprovementOccurrence = {
  id: string;
  user_id: string;
  focus_id: string;
  trade_id: string;
  assessment: "followed" | "deviated" | "unassessable";
  assessment_provenance: "trader" | "deterministic";
  note: string | null;
  assessed_at: string;
  created_at: string;
  updated_at: string;
};

const focusInput = z.object({
  origin: z.enum(["scope", "trader"]),
  behavior: z.string().trim().min(1).max(500),
  trigger_situation: z.string().trim().min(1).max(500),
  intended_behavior: z.string().trim().min(1).max(500),
  grounding: z.string().trim().min(1).max(2000),
  relevant_evidence_definition: z.string().trim().min(1).max(1000),
  source_discovery_id: z.string().max(500).nullable().optional(),
  source_trade_ids: z.array(z.string().uuid()).max(500).default([]),
  standard_version_id: z.string().uuid().nullable().optional(),
});

export const listImprovementFocuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: focuses, error: focusError }, { data: occurrences, error: occurrenceError }] =
      await Promise.all([
        context.supabase
          .from("improvement_focuses")
          .select("*")
          .eq("user_id", context.userId)
          .order("activated_at", { ascending: false }),
        context.supabase
          .from("improvement_occurrences")
          .select("*")
          .eq("user_id", context.userId)
          .order("assessed_at", { ascending: false }),
      ]);
    if (focusError) throw safeError(focusError);
    if (occurrenceError) throw safeError(occurrenceError);
    return {
      focuses: (focuses ?? []) as ImprovementFocus[],
      occurrences: (occurrences ?? []) as ImprovementOccurrence[],
    };
  });

export const getActiveImprovementFocus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: focus, error } = await context.supabase
      .from("improvement_focuses")
      .select("*")
      .eq("user_id", context.userId)
      .eq("state", "active")
      .maybeSingle();
    if (error) throw safeError(error);
    if (!focus) return { focus: null, occurrences: [] as ImprovementOccurrence[] };
    const { data: occurrences, error: occurrenceError } = await context.supabase
      .from("improvement_occurrences")
      .select("*")
      .eq("user_id", context.userId)
      .eq("focus_id", focus.id)
      .order("assessed_at", { ascending: false });
    if (occurrenceError) throw safeError(occurrenceError);
    return {
      focus: focus as ImprovementFocus,
      occurrences: (occurrences ?? []) as ImprovementOccurrence[],
    };
  });

export const activateImprovementFocus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => focusInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: active, error: activeError } = await context.supabase
      .from("improvement_focuses")
      .select("id")
      .eq("user_id", context.userId)
      .eq("state", "active")
      .maybeSingle();
    if (activeError) throw safeError(activeError);
    if (active) throw new Error("Resolve or stop the current focus before activating another.");

    if (data.standard_version_id) {
      const { data: version, error } = await context.supabase
        .from("playbook_standard_versions")
        .select("id")
        .eq("id", data.standard_version_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (error) throw safeError(error);
      if (!version) throw new Error("The selected standard context is unavailable.");
    }

    const sourceTradeIds = [...new Set(data.source_trade_ids)];
    if (sourceTradeIds.length) {
      const { data: ownedTrades, error } = await context.supabase
        .from("trades")
        .select("id, account_id, is_paper")
        .eq("user_id", context.userId)
        .in("id", sourceTradeIds);
      if (error) throw safeError(error);
      const accountIds = [
        ...new Set((ownedTrades ?? []).map((trade) => trade.account_id).filter(Boolean)),
      ] as string[];
      const { data: ownedAccounts, error: accountError } = accountIds.length
        ? await context.supabase
            .from("trading_accounts")
            .select("id, account_type")
            .eq("user_id", context.userId)
            .in("id", accountIds)
        : { data: [], error: null };
      if (accountError) throw safeError(accountError);
      const ownedById = new Map((ownedTrades ?? []).map((trade) => [trade.id, trade]));
      if (
        sourceTradeIds.some((id) => {
          const trade = ownedById.get(id);
          return (
            !trade || journalEvidencePopulationForTrade(trade, ownedAccounts ?? []) !== "actual"
          );
        })
      ) {
        throw new Error("Focus grounding can reference only your actual journal evidence.");
      }
    }

    const { data: row, error } = await context.supabase
      .from("improvement_focuses")
      .insert({
        ...data,
        source_trade_ids: sourceTradeIds,
        source_discovery_id: data.source_discovery_id ?? null,
        standard_version_id: data.standard_version_id ?? null,
        user_id: context.userId,
      })
      .select("*")
      .single();
    if (error) throw safeError(error);
    return row as ImprovementFocus;
  });

export const assessImprovementOccurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({
        focus_id: z.string().uuid(),
        trade_id: z.string().uuid(),
        assessment: z.enum(["followed", "deviated", "unassessable"]),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const [{ data: focus, error: focusError }, { data: trade, error: tradeError }] =
      await Promise.all([
        context.supabase
          .from("improvement_focuses")
          .select("id, activated_at, state")
          .eq("id", data.focus_id)
          .eq("user_id", context.userId)
          .maybeSingle(),
        context.supabase
          .from("trades")
          .select("id, account_id, created_at, trade_date, is_paper")
          .eq("id", data.trade_id)
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
    if (focusError) throw safeError(focusError);
    if (tradeError) throw safeError(tradeError);
    if (!focus || focus.state !== "active") throw new Error("The improvement focus is not active.");
    if (!trade) {
      throw new Error("The selected trade is unavailable.");
    }

    const { data: tradeAccount, error: accountError } = trade.account_id
      ? await context.supabase
          .from("trading_accounts")
          .select("id, account_type")
          .eq("id", trade.account_id)
          .eq("user_id", context.userId)
          .maybeSingle()
      : { data: null, error: null };
    if (accountError) throw safeError(accountError);
    if (
      journalEvidencePopulationForTrade(trade, tradeAccount ? [tradeAccount] : []) !== "actual" ||
      !isTradeEligibleForFocus(trade, focus)
    ) {
      throw new Error(
        "Only actual journal evidence occurring after focus activation can assess this focus.",
      );
    }

    const { data: row, error } = await context.supabase
      .from("improvement_occurrences")
      .upsert(
        {
          user_id: context.userId,
          focus_id: focus.id,
          trade_id: trade.id,
          assessment: data.assessment,
          assessment_provenance: "trader",
          note: data.note || null,
          assessed_at: new Date().toISOString(),
        },
        { onConflict: "focus_id,trade_id" },
      )
      .select("*")
      .single();
    if (error) throw safeError(error);
    return row as ImprovementOccurrence;
  });

export const resolveImprovementFocus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({
        focus_id: z.string().uuid(),
        resolution: z
          .enum(["improved", "unresolved", "unsupported", "no_longer_applicable"])
          .nullable(),
        closure_note: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const state = data.resolution ? "closed" : "stopped";
    const { data: row, error } = await context.supabase
      .from("improvement_focuses")
      .update({
        state,
        resolution: data.resolution,
        closure_note: data.closure_note || null,
        closed_at: new Date().toISOString(),
      })
      .eq("id", data.focus_id)
      .eq("user_id", context.userId)
      .eq("state", "active")
      .select("*")
      .maybeSingle();
    if (error) throw safeError(error);
    if (!row) throw new Error("The improvement focus is no longer active.");
    return row as ImprovementFocus;
  });

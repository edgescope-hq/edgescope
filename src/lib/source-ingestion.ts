import type { Database, Json } from "../integrations/supabase/types.ts";

export type SourceKind = "manual" | "file_import" | "connected";

export type IngestionRunStatus =
  "pending" | "processing" | "completed" | "partial" | "failed" | "cancelled";

export type SourceEventKind =
  | "fill"
  | "partial_entry"
  | "partial_exit"
  | "commission"
  | "fee"
  | "swap"
  | "correction"
  | "transaction"
  | "other";

export type NormalizedSourceSide = "buy" | "sell";

export type EvidenceSourceRow = Database["public"]["Tables"]["evidence_sources"]["Row"];
export type SourceAccountRow = Database["public"]["Tables"]["source_accounts"]["Row"];
export type IngestionRunRow = Database["public"]["Tables"]["ingestion_runs"]["Row"];
export type SourceEventRow = Database["public"]["Tables"]["source_events"]["Row"];
export type TradeSourceEventRow = Database["public"]["Tables"]["trade_source_events"]["Row"];

export type RawSourceRecord = { [key: string]: Json | undefined };

/**
 * Normalized economic fields use signed contribution semantics.
 *
 * grossPnl is signed trading P&L. Commission, fees, swap, and otherCosts are
 * also signed: a charge is negative and a rebate/credit is positive. Provider
 * sign conversion belongs in the source adapter. Null always means unknown.
 */
export type NormalizedSourceEconomics = Readonly<{
  currency: string | null;
  grossPnl: number | null;
  commission: number | null;
  fees: number | null;
  swap: number | null;
  otherCosts: number | null;
  netPnl: number | null;
}>;

export type ResolvedNetPnl = Readonly<{
  value: number | null;
  provenance: "source_reported" | "derived_complete_components" | "missing";
}>;

function finite(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

/**
 * Uses a source-reported normalized net value when present. Otherwise derives
 * net only when every normalized component is known; unknown costs are never
 * silently treated as zero.
 */
export function resolveNormalizedNetPnl(economics: NormalizedSourceEconomics): ResolvedNetPnl {
  const reportedNet = finite(economics.netPnl);
  if (reportedNet !== null) {
    return { value: reportedNet, provenance: "source_reported" };
  }

  const components = [
    economics.grossPnl,
    economics.commission,
    economics.fees,
    economics.swap,
    economics.otherCosts,
  ].map(finite);

  if (components.some((component) => component === null)) {
    return { value: null, provenance: "missing" };
  }

  const value = components.reduce<number>((sum, component) => sum + (component ?? 0), 0);
  return {
    value: Number(value.toFixed(8)),
    provenance: "derived_complete_components",
  };
}

export type StableExternalEventIdentity = Readonly<{
  scopeKind: "source" | "source_account";
  scopeId: string;
  externalIdKind: string;
  externalEventId: string;
}>;

/**
 * Returns a definitive identity only for a source-provided ID and namespace.
 * It deliberately does not manufacture a fingerprint for rows without one.
 */
export function stableExternalEventIdentity(input: {
  sourceId: string;
  sourceAccountId: string | null;
  externalIdKind: string | null;
  externalEventId: string | null;
}): StableExternalEventIdentity | null {
  if (!input.externalIdKind || !input.externalEventId) return null;
  return {
    scopeKind: input.sourceAccountId ? "source_account" : "source",
    scopeId: input.sourceAccountId ?? input.sourceId,
    externalIdKind: input.externalIdKind,
    externalEventId: input.externalEventId,
  };
}

export type ObjectiveSourceEventDraft = Readonly<{
  userId: string;
  sourceId: string;
  sourceAccountId?: string | null;
  ingestionRunId: string;
  eventKind: SourceEventKind;
  externalIdKind?: string | null;
  externalEventId?: string | null;
  externalDealId?: string | null;
  externalOrderId?: string | null;
  externalPositionId?: string | null;
  externalTransactionId?: string | null;
  sourceEventType?: string | null;
  sourceSymbol?: string | null;
  normalizedInstrument?: string | null;
  sourceSide?: string | null;
  normalizedSide?: NormalizedSourceSide | null;
  quantity?: number | null;
  price?: number | null;
  sourceTimestamp?: string | null;
  occurredAt?: string | null;
  sourceTimezone?: string | null;
  sourceUtcOffsetMinutes?: number | null;
  economics: NormalizedSourceEconomics;
  rawPayload: RawSourceRecord;
  normalizationMetadata?: RawSourceRecord;
}>;

export type ObjectiveSourceEventInsert = Database["public"]["Tables"]["source_events"]["Insert"];

/**
 * Projects an adapter result onto the objective source-event contract. The
 * explicit projection is intentional: review, Playbook, emotion, Category,
 * focus, screenshots, and other trader-owned fields cannot flow through it.
 */
export function buildObjectiveSourceEventInsert(
  draft: ObjectiveSourceEventDraft,
): ObjectiveSourceEventInsert {
  const hasIdentityKind = Boolean(draft.externalIdKind);
  const hasIdentityValue = Boolean(draft.externalEventId);
  if (hasIdentityKind !== hasIdentityValue) {
    throw new Error("Stable external event identity requires both ID kind and ID value.");
  }

  return {
    user_id: draft.userId,
    source_id: draft.sourceId,
    source_account_id: draft.sourceAccountId ?? null,
    ingestion_run_id: draft.ingestionRunId,
    event_kind: draft.eventKind,
    external_id_kind: draft.externalIdKind ?? null,
    external_event_id: draft.externalEventId ?? null,
    external_deal_id: draft.externalDealId ?? null,
    external_order_id: draft.externalOrderId ?? null,
    external_position_id: draft.externalPositionId ?? null,
    external_transaction_id: draft.externalTransactionId ?? null,
    source_event_type: draft.sourceEventType ?? null,
    source_symbol: draft.sourceSymbol ?? null,
    normalized_instrument: draft.normalizedInstrument ?? null,
    source_side: draft.sourceSide ?? null,
    normalized_side: draft.normalizedSide ?? null,
    quantity: draft.quantity ?? null,
    price: draft.price ?? null,
    source_timestamp: draft.sourceTimestamp ?? null,
    occurred_at: draft.occurredAt ?? null,
    source_timezone: draft.sourceTimezone ?? null,
    source_utc_offset_minutes: draft.sourceUtcOffsetMinutes ?? null,
    source_currency: draft.economics.currency,
    gross_pnl: draft.economics.grossPnl,
    commission: draft.economics.commission,
    fees: draft.economics.fees,
    swap: draft.economics.swap,
    other_costs: draft.economics.otherCosts,
    net_pnl: draft.economics.netPnl,
    raw_payload: draft.rawPayload,
    normalization_metadata: draft.normalizationMetadata ?? {},
  };
}

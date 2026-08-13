/**
 * Journal population and evidence authorship are separate dimensions.
 *
 * A journal trade may be actual, practice, research, or unknown. Objective
 * source events remain in the source-ingestion tables, while review, intent,
 * Playbook context, and other interpretation remain trader-authored fields.
 * Neither source lineage nor enrichment changes a trade's population.
 */
export type JournalEvidencePopulation = "actual" | "practice" | "research" | "unknown";

export type EvidenceAccountType =
  "personal" | "funded" | "demo" | "live" | "challenge" | "backtest";

export type EvidenceAccount = {
  id: string;
  account_type?: string | null;
};

export type EvidenceTrade = {
  account_id?: string | null;
  is_paper?: boolean | null;
};

export function journalEvidencePopulationForAccountType(
  accountType: string | null | undefined,
): JournalEvidencePopulation {
  switch (accountType) {
    case "personal":
    case "funded":
    case "live":
    case "challenge":
      return "actual";
    case "demo":
      return "practice";
    case "backtest":
      return "research";
    default:
      return "unknown";
  }
}

export function journalEvidencePopulationForTrade(
  trade: EvidenceTrade,
  accounts: readonly EvidenceAccount[],
): JournalEvidencePopulation {
  // Paper/simulated execution is practice evidence regardless of the account
  // it was captured against.
  if (trade.is_paper === true) return "practice";
  if (!trade.account_id) return "unknown";

  const account = accounts.find((candidate) => candidate.id === trade.account_id);
  if (!account) return "unknown";
  return journalEvidencePopulationForAccountType(account.account_type);
}

export function actualJournalTrades<T extends EvidenceTrade>(
  trades: readonly T[],
  accounts: readonly EvidenceAccount[],
): T[] {
  return trades.filter((trade) => journalEvidencePopulationForTrade(trade, accounts) === "actual");
}

/**
 * Default measurement uses actual evidence only. Selecting one account is an
 * explicit inspection action, so its non-Paper practice or backtest history is
 * available without entering the default live aggregate.
 */
export function journalTradesForEvidenceView<T extends EvidenceTrade>(
  trades: readonly T[],
  accounts: readonly EvidenceAccount[],
  selectedAccountId: string,
): T[] {
  if (selectedAccountId === "ALL") return actualJournalTrades(trades, accounts);
  return trades.filter(
    (trade) => trade.is_paper !== true && trade.account_id === selectedAccountId,
  );
}

export function evidenceOccurrencesForTrades<T extends { trade_id: string }>(
  occurrences: readonly T[],
  trades: readonly { id: string }[],
): T[] {
  const eligibleIds = new Set(trades.map((trade) => trade.id));
  return occurrences.filter((occurrence) => eligibleIds.has(occurrence.trade_id));
}

export function evidencePopulationLabel(population: JournalEvidencePopulation): string {
  switch (population) {
    case "actual":
      return "Actual";
    case "practice":
      return "Practice";
    case "research":
      return "Research";
    default:
      return "Unknown";
  }
}

export function accountTypePreservesEvidencePopulation(
  currentType: string | null | undefined,
  nextType: string | null | undefined,
): boolean {
  return (
    journalEvidencePopulationForAccountType(currentType) ===
    journalEvidencePopulationForAccountType(nextType)
  );
}

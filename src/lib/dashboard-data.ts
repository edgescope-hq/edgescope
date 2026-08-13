import {
  journalTradesForEvidenceView,
  type EvidenceAccount,
  type EvidenceTrade,
} from "./evidence-population.ts";

export type DashboardAccountTrade = EvidenceTrade;

export function dashboardTradesForAccount<T extends DashboardAccountTrade>(
  trades: readonly T[],
  accounts: readonly EvidenceAccount[],
  selectedAccountId: string,
): T[] {
  return journalTradesForEvidenceView(trades, accounts, selectedAccountId);
}

export type DashboardExecutionFocusState =
  "large_loss" | "losing_streak" | "strong_run" | "process_first";

export function dashboardExecutionFocusState({
  latestValidR,
  currentLoss,
  currentWin,
}: {
  latestValidR: number | null;
  currentLoss: number;
  currentWin: number;
}): DashboardExecutionFocusState {
  if (latestValidR !== null && latestValidR <= -3) return "large_loss";
  if (currentLoss >= 3) return "losing_streak";
  if (currentWin >= 3) return "strong_run";
  return "process_first";
}

export function dashboardExecutionFocusShowsRecentre(
  state: DashboardExecutionFocusState,
  currentLoss: number,
): boolean {
  return state === "large_loss" || (state === "losing_streak" && currentLoss >= 5);
}

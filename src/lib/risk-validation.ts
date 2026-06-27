// Future-facing helper. Not wired into the trade form yet — kept here so the
// Add Trade modal (and any other workflow) can opt in to discipline checks
// without re-implementing the logic.
import type { TradingAccount } from "@/lib/trading-accounts.functions";
import type { AccountGuardrails } from "@/lib/guardrails.functions";

export type TradeDraft = {
  risk_percentage?: number | null;
  has_trade_plan?: boolean;
  has_screenshot?: boolean;
  open_positions?: number;
  correlated_positions?: number;
  consecutive_losses?: number;
  daily_loss_pct?: number;
  during_news?: boolean;
  weekend_hold?: boolean;
};

export type ValidationWarning = {
  rule: string;
  message: string;
  severity: "warn" | "block";
};

export function validateTradeAgainstAccount(
  trade: TradeDraft,
  account: TradingAccount | null,
  guardrails: AccountGuardrails | null,
): { ok: boolean; warnings: ValidationWarning[] } {
  const warnings: ValidationWarning[] = [];
  if (!account) return { ok: true, warnings };

  const push = (rule: string, message: string, severity: ValidationWarning["severity"] = "warn") =>
    warnings.push({ rule, message, severity });

  if (
    account.max_risk_per_trade_pct != null &&
    trade.risk_percentage != null &&
    trade.risk_percentage > account.max_risk_per_trade_pct
  ) {
    push("max_risk_per_trade", "This trade exceeds your maximum risk per trade.", "block");
  }
  if (
    account.daily_loss_limit_pct != null &&
    trade.daily_loss_pct != null &&
    trade.daily_loss_pct >= account.daily_loss_limit_pct
  ) {
    push("daily_loss_limit", "Daily loss limit reached — no new trades today.", "block");
  }
  if (
    account.max_open_positions != null &&
    trade.open_positions != null &&
    trade.open_positions >= account.max_open_positions
  ) {
    push("max_open_positions", "Maximum open positions reached.", "block");
  }
  if (
    account.max_correlated_positions != null &&
    trade.correlated_positions != null &&
    trade.correlated_positions >= account.max_correlated_positions
  ) {
    push("max_correlated", "Too many correlated positions open.");
  }
  if (account.news_trading_allowed === false && trade.during_news) {
    push("news_trading", "News trading is disabled for this account.", "block");
  }
  if (account.weekend_holding_allowed === false && trade.weekend_hold) {
    push("weekend_hold", "Weekend holding is disabled for this account.");
  }

  if (guardrails) {
    if (
      guardrails.stop_after_consecutive_losses != null &&
      trade.consecutive_losses != null &&
      trade.consecutive_losses >= guardrails.stop_after_consecutive_losses
    ) {
      push("consecutive_losses", "Stop-loss streak hit — take a break.", "block");
    }
    if (guardrails.require_trade_plan && !trade.has_trade_plan) {
      push("require_trade_plan", "A trade plan is required before entry.");
    }
    if (guardrails.require_screenshot && !trade.has_screenshot) {
      push("require_screenshot", "A screenshot is required before journaling.");
    }
  }

  const ok = !warnings.some((w) => w.severity === "block");
  return { ok, warnings };
}

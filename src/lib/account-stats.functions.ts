import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccountStats = {
  starting_balance: number;
  current_balance: number;
  net_pnl: number;
  win_rate: number; // 0..100
  profit_factor: number | null;
  avg_r_multiple: number | null;
  max_drawdown: number; // absolute currency drawdown
  days_traded: number;
  total_trades: number;
};

// Per-trade $ P/L.
// Prefers the user-entered reward_amount (the actual P/L), and falls back to
// achieved_rr × risk%/100 × account_size when reward_amount is absent.
function tradeDollarPnl(t: {
  achieved_rr: number | null;
  risk_percentage: number | null;
  account_size: number | null;
  result: string | null;
  reward_amount?: number | string | null;
}): number {
  const rawReward = t.reward_amount;
  if (rawReward != null && rawReward !== "") {
    const n = Number(rawReward);
    if (isFinite(n)) {
      // Sign by result: losses are negative; wins positive; BE = 0.
      if (t.result === "loss") return -Math.abs(n);
      if (t.result === "win") return Math.abs(n);
      if (t.result === "breakeven") return 0;
      return n;
    }
  }
  const r = Number(t.achieved_rr ?? 0);
  const risk = Number(t.risk_percentage ?? 0) / 100;
  const size = Number(t.account_size ?? 0);
  if (!isFinite(r) || !isFinite(risk) || !isFinite(size)) return 0;
  const pnl = r * risk * size;
  return isFinite(pnl) ? pnl : 0;
}

export const getAccountStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: acct, error: acctErr } = await context.supabase
      .from("trading_accounts")
      .select("starting_balance")
      .eq("id", data.account_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (acctErr) throw safeError(acctErr);
    if (!acct) throw new Error("Account not found");

    const { data: rows, error } = await context.supabase
      .from("trades")
      .select("achieved_rr, risk_percentage, account_size, result, trade_date, is_paper, reward_amount")
      .eq("user_id", context.userId)
      .eq("account_id", data.account_id);
    if (error) throw safeError(error);

    const trades = (rows ?? []).filter((t) => !t.is_paper);

    const startingBalance = Number(acct.starting_balance ?? 0);
    let grossWin = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;
    let rSum = 0;
    let rCount = 0;
    const dayCounter = new Set<string>();

    // Build chronological equity curve for max drawdown.
    const ordered = [...trades].sort((a, b) => {
      const da = a.trade_date ? new Date(a.trade_date).getTime() : 0;
      const db = b.trade_date ? new Date(b.trade_date).getTime() : 0;
      return da - db;
    });

    let equity = startingBalance;
    let peak = startingBalance;
    let maxDrawdown = 0;

    for (const t of ordered) {
      const pnl = tradeDollarPnl(t);
      equity += pnl;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDrawdown) maxDrawdown = dd;

      if (t.trade_date) dayCounter.add(t.trade_date);
      if (t.achieved_rr != null) {
        rSum += Number(t.achieved_rr);
        rCount += 1;
      }
      if (t.result === "win") {
        wins += 1;
        if (pnl > 0) grossWin += pnl;
      } else if (t.result === "loss") {
        losses += 1;
        if (pnl < 0) grossLoss += Math.abs(pnl);
      }
    }

    const totalTrades = trades.length;
    const decided = wins + losses;
    const stats: AccountStats = {
      starting_balance: startingBalance,
      current_balance: equity,
      net_pnl: equity - startingBalance,
      win_rate: decided > 0 ? (wins / decided) * 100 : 0,
      profit_factor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0,
      avg_r_multiple: rCount > 0 ? rSum / rCount : null,
      max_drawdown: maxDrawdown,
      days_traded: dayCounter.size,
      total_trades: totalTrades,
    };
    return stats;
  });

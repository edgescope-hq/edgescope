import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, ArrowUpRight, ArrowDownRight, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { TradingViewWidget } from "./tradingview-widget";
import {
  openPaperTrade,
  listOpenPaperTrades,
  updatePaperLivePrice,
  closePaperTrade,
} from "@/lib/trades.functions";
import { priceProvider } from "@/lib/paper-price-provider";

type DbOpenTrade = {
  id: string;
  instrument: string;
  direction: "long" | "short";
  entry_price: number | string;
  stop_loss: number | string;
  take_profit: number | string;
  position_size: number | string | null;
  planned_rr: string | null;
  live_price: number | string | null;
  floating_pnl: number | string | null;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

// TradingView interval string -> seconds per candle
const TIMEFRAMES = [
  { v: "1", l: "1m", sec: 60 },
  { v: "5", l: "5m", sec: 5 * 60 },
  { v: "15", l: "15m", sec: 15 * 60 },
  { v: "30", l: "30m", sec: 30 * 60 },
  { v: "60", l: "1h", sec: 60 * 60 },
  { v: "240", l: "4h", sec: 4 * 60 * 60 },
  { v: "D", l: "1D", sec: 24 * 60 * 60 },
] as const;

export function PaperWorkspace() {
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("FX:EURUSD");
  const [interval, setInterval_] = useState<string>("60");

  const listOpen = useServerFn(listOpenPaperTrades);
  const openFn = useServerFn(openPaperTrade);
  const closeFn = useServerFn(closePaperTrade);
  const updatePx = useServerFn(updatePaperLivePrice);

  const { data: openTrades = [] } = useQuery({
    queryKey: ["paper-open"],
    queryFn: () => listOpen() as Promise<DbOpenTrade[]>,
    refetchInterval: 10000,
  });

  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!openTrades.length) return;
    let mounted = true;
    let tickCount = 0;

    const tick = async () => {
      if (!mounted) return;
      tickCount += 1;
      const updates: Record<string, number> = {};
      const closures: Promise<unknown>[] = [];

      for (const t of openTrades) {
        const entry = num(t.entry_price);
        const sl = num(t.stop_loss);
        const tp = num(t.take_profit);
        const px = await priceProvider.getPrice(t.instrument, entry);
        updates[t.id] = px;

        const hitTp = t.direction === "long" ? px >= tp : px <= tp;
        const hitSl = t.direction === "long" ? px <= sl : px >= sl;
        if (hitTp || hitSl) {
          closures.push(
            closeFn({ data: { id: t.id, exit_price: hitTp ? tp : sl, closed_reason: hitTp ? "tp" : "sl" } })
              .then(() => { toast.success(`${t.instrument} auto-closed at ${hitTp ? "TP" : "SL"}`); })
              .catch((e: Error) => toast.error(e.message)),
          );
        }
      }
      setLivePrices((prev) => ({ ...prev, ...updates }));

      if (tickCount % 5 === 0) {
        for (const t of openTrades) {
          const px = updates[t.id];
          if (px == null) continue;
          const dir = t.direction === "long" ? 1 : -1;
          const size = num(t.position_size) || 1;
          const fpnl = (px - num(t.entry_price)) * dir * size;
          updatePx({ data: { id: t.id, live_price: px, floating_pnl: fpnl } }).catch(() => {});
        }
      }

      if (closures.length) {
        await Promise.all(closures);
        qc.invalidateQueries({ queryKey: ["paper-open"] });
        qc.invalidateQueries({ queryKey: ["trades"] });
      }
    };

    const id = window.setInterval(tick, 2000);
    tick();
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [openTrades, closeFn, updatePx, qc]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-3xl font-bold tracking-tight md:text-4xl">
            Paper Trading
          </motion.h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Risk-free simulation. Closed paper trades flow into your journal, analytics, and AI insights.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* Chart */}
        <div className="glow-card overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground">SYMBOL</span>
              <span className="text-sm font-bold text-foreground">{symbol}</span>
            </div>
            <div className="flex items-center gap-3">
              <CandleCountdown intervalSec={TIMEFRAMES.find((t) => t.v === interval)?.sec ?? 3600} />
              <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.v}
                    onClick={() => setInterval_(tf.v)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] font-bold tracking-wider transition",
                      interval === tf.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tf.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="h-[480px] md:h-[560px]">
            <TradingViewWidget symbol={symbol} interval={interval} />
          </div>
        </div>

        <OrderTicket symbol={symbol} onSymbolChange={setSymbol} onSubmitted={() => qc.invalidateQueries({ queryKey: ["paper-open"] })} openFn={openFn} />
      </div>

      <OpenPositions
        trades={openTrades}
        livePrices={livePrices}
        onClose={async (t, reason) => {
          const px = livePrices[t.id] ?? num(t.live_price) ?? num(t.entry_price);
          try {
            await closeFn({ data: { id: t.id, exit_price: px, closed_reason: reason } });
            toast.success(`${t.instrument} closed manually`);
            qc.invalidateQueries({ queryKey: ["paper-open"] });
            qc.invalidateQueries({ queryKey: ["trades"] });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

// ----------------------------- Candle Countdown -----------------------------

function CandleCountdown({ intervalSec }: { intervalSec: number }) {
  const [remaining, setRemaining] = useState<number>(() => {
    const now = Math.floor(Date.now() / 1000);
    return intervalSec - (now % intervalSec);
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(intervalSec - (now % intervalSec));
    }, 1000);
    return () => window.clearInterval(id);
  }, [intervalSec]);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const display = intervalSec >= 3600 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return (
    <div className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs font-mono font-bold ring-1 ring-white/[0.06]">
      <Clock className="h-3.5 w-3.5 text-primary" />
      <span className="text-muted-foreground">Next candle</span>
      <span className="tabular-nums text-foreground">{display}</span>
    </div>
  );
}

// ----------------------------- Order Ticket -----------------------------

function OrderTicket({
  symbol,
  onSymbolChange,
  onSubmitted,
  openFn,
}: {
  symbol: string;
  onSymbolChange: (s: string) => void;
  onSubmitted: () => void;
  openFn: (args: { data: unknown }) => Promise<unknown>;
}) {
  const [instrument, setInstrument] = useState(symbol);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [accountBalance, setAccountBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");

  useEffect(() => { setInstrument(symbol); }, [symbol]);

  const entryN = parseFloat(entry);
  const slN = parseFloat(sl);
  const tpN = parseFloat(tp);
  const balN = parseFloat(accountBalance);
  const riskN = parseFloat(riskPct);

  const plannedRR = useMemo(() => {
    if (!isFinite(entryN) || !isFinite(slN) || !isFinite(tpN)) return null;
    const risk = Math.abs(entryN - slN);
    const reward = Math.abs(tpN - entryN);
    if (risk === 0) return null;
    return reward / risk;
  }, [entryN, slN, tpN]);

  const positionSize = useMemo(() => {
    if (!isFinite(balN) || !isFinite(riskN) || !isFinite(entryN) || !isFinite(slN)) return null;
    const riskAmt = (balN * riskN) / 100;
    const perUnit = Math.abs(entryN - slN);
    if (perUnit === 0) return null;
    return riskAmt / perUnit;
  }, [balN, riskN, entryN, slN]);

  const m = useMutation({
    mutationFn: () => openFn({
      data: {
        instrument: instrument.trim(),
        direction,
        entry_price: entryN,
        stop_loss: slN,
        take_profit: tpN,
        account_size: isFinite(balN) ? balN : null,
        risk_percentage: isFinite(riskN) ? riskN : null,
        position_size: positionSize,
        planned_rr: plannedRR != null ? plannedRR.toFixed(2) : null,
        market: "other",
      },
    }),
    onSuccess: () => {
      toast.success("Paper trade opened");
      setEntry(""); setSl(""); setTp("");
      onSubmitted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = instrument.trim() && isFinite(entryN) && isFinite(slN) && isFinite(tpN);

  return (
    <div className="glow-card rounded-2xl p-4">
      <div className="text-sm font-bold">New Paper Trade</div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        Execution only. Add session, category, emotions and notes after the trade closes from My Trades.
      </p>

      <div className="mt-3 space-y-3">
        <Field label="Instrument">
          <input value={instrument} onChange={(e) => setInstrument(e.target.value)} onBlur={() => onSymbolChange(instrument)} className={inputCls} placeholder="e.g. FX:EURUSD" />
        </Field>

        <div>
          <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground">DIRECTION</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection("long")} className={cn("flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold ring-1 ring-white/[0.06]", direction === "long" ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40" : "bg-white/[0.03] text-muted-foreground")}>
              <ArrowUpRight className="h-3.5 w-3.5" /> BUY
            </button>
            <button type="button" onClick={() => setDirection("short")} className={cn("flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold ring-1 ring-white/[0.06]", direction === "short" ? "bg-rose-500/15 text-rose-300 ring-rose-500/40" : "bg-white/[0.03] text-muted-foreground")}>
              <ArrowDownRight className="h-3.5 w-3.5" /> SELL
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Entry"><input value={entry} onChange={(e) => setEntry(e.target.value)} className={inputCls} inputMode="decimal" /></Field>
          <Field label="Stop Loss"><input value={sl} onChange={(e) => setSl(e.target.value)} className={inputCls} inputMode="decimal" /></Field>
          <Field label="Take Profit"><input value={tp} onChange={(e) => setTp(e.target.value)} className={inputCls} inputMode="decimal" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Account Balance"><input value={accountBalance} onChange={(e) => setAccountBalance(e.target.value)} className={inputCls} inputMode="decimal" /></Field>
          <Field label="Risk %"><input value={riskPct} onChange={(e) => setRiskPct(e.target.value)} className={inputCls} inputMode="decimal" /></Field>
        </div>

        <div className="rounded-lg bg-white/[0.03] p-2.5 text-xs ring-1 ring-white/[0.04]">
          <div className="flex justify-between"><span className="text-muted-foreground">Planned RR</span><span className="font-bold text-foreground">{plannedRR != null ? `${plannedRR.toFixed(2)}R` : "—"}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Position Size</span><span className="font-bold text-foreground">{positionSize != null ? positionSize.toFixed(4) : "—"}</span></div>
        </div>

        <button
          type="button"
          disabled={!valid || m.isPending}
          onClick={() => m.mutate()}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-glow)] transition disabled:opacity-50"
        >
          {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Open Paper Trade
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg bg-white/[0.04] px-2.5 py-2 text-xs ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground">{label.toUpperCase()}</div>
      {children}
    </label>
  );
}

// ----------------------------- Open Positions -----------------------------

function OpenPositions({
  trades,
  livePrices,
  onClose,
}: {
  trades: DbOpenTrade[];
  livePrices: Record<string, number>;
  onClose: (t: DbOpenTrade, reason: "manual") => void;
}) {
  if (!trades.length) {
    return (
      <div className="glow-card mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">
        No open paper trades. Submit the ticket above to start practicing.
      </div>
    );
  }
  return (
    <div className="glow-card mt-6 overflow-hidden rounded-2xl">
      <div className="border-b border-white/[0.06] px-4 py-2.5 text-sm font-bold">Open Positions ({trades.length})</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="text-[10px] font-semibold tracking-wider text-muted-foreground">
            <tr className="border-b border-white/[0.04]">
              <th className="px-4 py-2 text-left">Instrument</th>
              <th className="px-3 py-2 text-left">Dir</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">SL</th>
              <th className="px-3 py-2 text-right">TP</th>
              <th className="px-3 py-2 text-right">Live</th>
              <th className="px-3 py-2 text-right">Floating PnL</th>
              <th className="px-3 py-2 text-right">RR</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const entry = num(t.entry_price);
              const px = livePrices[t.id] ?? num(t.live_price) ?? entry;
              const dir = t.direction === "long" ? 1 : -1;
              const size = num(t.position_size) || 1;
              const fpnl = (px - entry) * dir * size;
              const positive = fpnl >= 0;
              return (
                <tr key={t.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{t.instrument}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", t.direction === "long" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                      {t.direction === "long" ? "BUY" : "SELL"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{entry.toFixed(5)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-300/80">{num(t.stop_loss).toFixed(5)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300/80">{num(t.take_profit).toFixed(5)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold">{px.toFixed(5)}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums font-bold", positive ? "text-emerald-300" : "text-rose-300")}>
                    {positive ? "+" : ""}{fpnl.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{t.planned_rr ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => onClose(t, "manual")} className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] font-semibold hover:bg-white/[0.1]">
                      <X className="h-3 w-3" /> Close
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

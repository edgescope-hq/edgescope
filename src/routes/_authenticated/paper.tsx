import { createFileRoute, Link } from "@tanstack/react-router";
import { CandlestickChart, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/paper")({
  head: () => ({
    meta: [
      { title: "Paper Trading — EdgeScope" },
      { name: "description", content: "Practice trading risk-free — coming soon." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PaperPage,
});

function PaperPage() {
  return (
    <div className="px-6 pt-6 md:px-10 md:pt-8">
      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-info/[0.06] px-4 py-3 ring-1 ring-info/20">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Paper Trading is coming soon.</span>{" "}
          For now,{" "}
          <Link to="/trades" className="font-medium text-primary hover:text-primary-glow">
            log paper trades manually in My Trades
          </Link>{" "}
          (filter by Paper). Live charts, auto-execution and a native order engine are planned for a later release.
        </div>
      </div>
      <div className="mt-8 grid place-items-center py-20">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <CandlestickChart className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-5 text-lg font-bold">Paper Trading</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Live chart integration, order management, and auto-execution are in development. 
            Track your practice trades in the meantime using My Trades with the Paper filter.
          </p>
          <Link
            to="/trades"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110"
          >
            Go to My Trades
          </Link>
        </div>
      </div>
    </div>
  );
}

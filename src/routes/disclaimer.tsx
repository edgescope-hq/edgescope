import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appLogoHorizontal from "@/assets/edgescope-horizontal.png.asset.json";

export const Route = createFileRoute("/disclaimer")({
  head: () => ({
    meta: [
      { title: "Trading Disclaimer - EdgeScope" },
      { name: "description", content: "EdgeScope trading disclaimer." },
    ],
  }),
  component: DisclaimerPage,
});

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex w-fit">
            <img src={appLogoHorizontal.url} alt="EdgeScope" className="h-12 w-auto" />
          </Link>
          <button
            onClick={() => window.history.back()}
            className="rounded-xl bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition hover:text-foreground"
          >
            Back
          </button>
        </div>
        <section className="mt-12 rounded-2xl bg-white/[0.03] p-6 ring-1 ring-white/[0.06] md:p-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/85">
            Legal
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This page may be updated as EdgeScope evolves.
          </p>
          <div className="mt-8 space-y-6 text-sm leading-7 text-foreground/76">{children}</div>
        </section>
      </div>
    </main>
  );
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function DisclaimerPage() {
  return (
    <LegalShell title="Trading Disclaimer">
      <LegalSection title="Not Financial Advice">
        <p>
          EdgeScope is not financial advice. It is a journaling, analytics, and self-review tool for
          your own trading records.
        </p>
      </LegalSection>
      <LegalSection title="No Signals or Predictions">
        <p>
          EdgeScope does not provide trade signals, market predictions, copy-trading services, or
          recommendations to buy, sell, or hold any instrument.
        </p>
      </LegalSection>
      <LegalSection title="Not a Broker">
        <p>
          EdgeScope is not a broker and does not place trades, execute orders, custody funds, or
          connect to brokerage accounts for trading.
        </p>
      </LegalSection>
      <LegalSection title="Trading Risk">
        <p>
          Trading involves risk. You are responsible for your own decisions, risk management, and
          outcomes.
        </p>
      </LegalSection>
      <LegalSection title="Past Data">
        <p>
          Past journal data, screenshots, reviews, analytics, and Scope observations do not
          guarantee future performance.
        </p>
      </LegalSection>
      <LegalSection title="Reflective Tools">
        <p>
          Scope and Analytics are reflective tools based on user-entered journal and review data.
          They are intended to help you inspect your process, not predict markets.
        </p>
      </LegalSection>
    </LegalShell>
  );
}

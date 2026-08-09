import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EdgeScopeLogo } from "@/components/brand/edgescope-logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service - EdgeScope" },
      { name: "description", content: "EdgeScope Terms of Service." },
    ],
  }),
  component: TermsPage,
});

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex w-fit">
            <EdgeScopeLogo tone="light" className="h-12 w-auto" />
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

function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <LegalSection title="Acceptance of Terms">
        <p>
          By using EdgeScope, you agree to use the product responsibly and only for lawful personal
          or business journaling purposes.
        </p>
      </LegalSection>
      <LegalSection title="What EdgeScope Is">
        <p>
          EdgeScope is a journaling, analytics, and self-review tool. It does not provide financial
          advice, trade signals, market predictions, brokerage services, or guaranteed
          profitability.
        </p>
      </LegalSection>
      <LegalSection title="User Accounts and Data">
        <p>
          You are responsible for your account access and for the accuracy of the trading journal
          data you enter, upload, or share.
        </p>
      </LegalSection>
      <LegalSection title="Acceptable Use">
        <p>
          Do not misuse EdgeScope, attempt unauthorized access, upload harmful content, or use
          private review circles for spam, harassment, signals, or copy-trading promotion.
        </p>
      </LegalSection>
      <LegalSection title="No Financial Advice or Guarantee">
        <p>
          Analytics and Scope are reflective tools based on your own journal data. They do not
          recommend trades and cannot guarantee future results.
        </p>
      </LegalSection>
      <LegalSection title="Service Availability">
        <p>
          EdgeScope may change during beta. Features may be updated, limited, or temporarily
          unavailable while the product evolves.
        </p>
      </LegalSection>
      <LegalSection title="Account Deletion">
        <p>
          Where supported, you may delete your account and related data from Settings. Some
          technical records may remain where required for security, backups, or legal compliance.
        </p>
      </LegalSection>
      <LegalSection title="Limitation of Liability">
        <p>
          You are responsible for your trading decisions. EdgeScope is provided as a self-review
          tool and is not responsible for trading losses or financial decisions.
        </p>
      </LegalSection>
    </LegalShell>
  );
}

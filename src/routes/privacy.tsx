import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appLogoHorizontal from "@/assets/edgescope-horizontal.png.asset.json";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy - EdgeScope" },
      { name: "description", content: "EdgeScope Privacy Policy." },
    ],
  }),
  component: PrivacyPage,
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

function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <LegalSection title="Data We Collect">
        <p>
          EdgeScope may collect account details such as email, display name, username, and sign-in
          provider, plus trading accounts, trades, screenshots, reviews, emotions, mistakes,
          categories, playbook notes, and private review content you choose to create.
        </p>
      </LegalSection>
      <LegalSection title="How Data Is Used">
        <p>
          Your data is used to provide journaling, review, analytics, Scope, playbook, and private
          review circle features.
        </p>
      </LegalSection>
      <LegalSection title="Private by Default">
        <p>
          Your journal is private by default. Selected trade reviews are shared only when you
          explicitly choose to share them with a review circle.
        </p>
      </LegalSection>
      <LegalSection title="Storage">
        <p>
          EdgeScope may use Supabase database, authentication, and storage services to keep account
          data, journal entries, and uploaded screenshots available to you.
        </p>
      </LegalSection>
      <LegalSection title="Account Deletion">
        <p>
          Where supported, account deletion is scheduled with a 15-day grace period so you can
          cancel before permanent removal. Permanent deletion is completed manually by the EdgeScope
          team until automated purging is available. After that, deletion removes related profile,
          journal, review, screenshot, playbook, and community data connected to your user account.
        </p>
      </LegalSection>
      <LegalSection title="No Sale of User Data">
        <p>EdgeScope does not sell your journal data.</p>
      </LegalSection>
      <LegalSection title="Policy Updates">
        <p>
          This policy may change as EdgeScope evolves. Continued use of the service means you accept
          the current policy.
        </p>
      </LegalSection>
    </LegalShell>
  );
}

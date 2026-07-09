import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock,
  LineChart,
  Lock,
  Search,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import logo from "@/assets/edgescope-logo.png.asset.json";
import logoHorizontal from "@/assets/edgescope-horizontal.png.asset.json";
import { Premium3DBackground } from "@/components/landing/premium-3d-background";
import { getPublicSiteUrl } from "@/lib/site-url";

const SITE_URL = getPublicSiteUrl();
const PAGE_TITLE = "EdgeScope - Trading Journal & Analytics";
const PAGE_DESCRIPTION =
  "EdgeScope helps traders log trades, review execution, track behavior, and uncover evidence-backed patterns from their own journal data.";
const OG_IMAGE = `${SITE_URL}${logoHorizontal.url}`;
const EASE = [0.16, 1, 0.3, 1] as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebSite", name: "EdgeScope", url: SITE_URL, description: PAGE_DESCRIPTION },
            {
              "@type": "SoftwareApplication",
              name: "EdgeScope",
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description: PAGE_DESCRIPTION,
              image: OG_IMAGE,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

const NAV_ITEMS = [
  { id: "scope", label: "Scope" },
  { id: "workflow", label: "Workflow" },
  { id: "community", label: "Community" },
] as const;

const WORKFLOW = [
  {
    step: "01",
    title: "Quick Capture",
    body: "Log the trade, chart context, result, and first notes while the session is still fresh.",
  },
  {
    step: "02",
    title: "Detailed Review",
    body: "Add execution grade, behavior tags, rule breaks, screenshots, and reasoning when you are ready.",
  },
  {
    step: "03",
    title: "Scope Learns",
    body: "Reviewed trades become the evidence base for patterns across your own journal data.",
  },
];

const BENEFITS = [
  {
    icon: Clock,
    title: "Log trades quickly",
    body: "Capture instrument, result, screenshots, setup, and notes without slowing down your session.",
  },
  {
    icon: Search,
    title: "Review execution deeply",
    body: "Separate process quality from outcome with grades, tags, mistakes, and reasoning.",
  },
  {
    icon: Brain,
    title: "Spot behavior patterns",
    body: "Study tendencies around timing, emotion, risk, rule breaks, and follow-through.",
  },
  {
    icon: BookOpen,
    title: "Build your personal playbook",
    body: "Turn repeated review into a clearer record of the setups and conditions you trust.",
  },
];

const SCOPE_PATTERNS = [
  "Setup, session, and instrument patterns",
  "Behavior tendencies across reviewed trades",
  "Risk and rule-break patterns",
  "Execution quality patterns",
];

const SHARED_TRADE_FIELDS = ["Screenshot", "Instrument", "Result", "Date", "Reasoning"];
const CARD_HOVER =
  "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_22px_70px_-34px_oklch(0.68_0.23_295/0.55)]";
const SOFT_ACCENT = "text-primary";
const EYEBROW_ACCENT = "text-[#DDCFFF]";

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothScrollTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = window.scrollY;
  const end = target.getBoundingClientRect().top + window.scrollY - 88;
  document.documentElement.dataset.navScrollTarget = id;

  if (reducedMotion) {
    window.scrollTo({ top: end });
    window.setTimeout(() => {
      if (document.documentElement.dataset.navScrollTarget === id) {
        delete document.documentElement.dataset.navScrollTarget;
      }
    }, 80);
    return;
  }

  const duration = 720;
  const startedAt = performance.now();

  function step(now: number) {
    const progress = Math.min((now - startedAt) / duration, 1);
    window.scrollTo({ top: start + (end - start) * easeInOutCubic(progress) });
    if (progress < 1) {
      requestAnimationFrame(step);
    } else if (document.documentElement.dataset.navScrollTarget === id) {
      delete document.documentElement.dataset.navScrollTarget;
    }
  }

  requestAnimationFrame(step);
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.26, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
  className = "",
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  className?: string;
}) {
  return (
    <div className={`max-w-3xl ${className}`}>
      <p
        className={`text-[13px] font-extrabold uppercase leading-none tracking-[0.24em] ${EYEBROW_ACCENT}`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground md:text-5xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-8 text-foreground/70 md:text-lg">{body}</p>
    </div>
  );
}

function PrimaryCta({ children = "Get Started" }: { children?: React.ReactNode }) {
  return (
    <Link
      to="/auth"
      search={{ mode: "signup" }}
      className="group inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-glow-lg)] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

function SecondaryCta({ children = "Sign In" }: { children?: React.ReactNode }) {
  return (
    <Link
      to="/auth"
      search={{ mode: "signin" }}
      className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] px-6 py-3 text-sm font-medium text-foreground transition-all duration-200 hover:-translate-y-px hover:border-white/[0.18] hover:bg-white/[0.075] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {children}
    </Link>
  );
}

function Landing() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    const clearHeroActiveState = () => {
      if (document.documentElement.dataset.navScrollTarget) return;
      if (window.scrollY < 320) setActiveSection(null);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (window.scrollY < 320) {
          setActiveSection(null);
          return;
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-32% 0px -48% 0px", threshold: [0.18, 0.35, 0.55] },
    );

    NAV_ITEMS.forEach((item) => {
      const section = document.getElementById(item.id);
      if (section) observer.observe(section);
    });

    clearHeroActiveState();
    window.addEventListener("scroll", clearHeroActiveState, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", clearHeroActiveState);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent text-foreground">
      <Premium3DBackground scale="hero" />
      <div className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(180deg,oklch(0.05_0.02_270/0.24),oklch(0.05_0.02_270/0.78)_58%,oklch(0.05_0.02_270/0.92))]" />

      <header className="relative z-20">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link
            to="/"
            aria-label="EdgeScope home"
            className="group inline-flex cursor-pointer items-center"
          >
            <span className="inline-flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.045] px-4 py-2.5 shadow-[0_18px_55px_oklch(0.36_0.18_295/0.18)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-md transition-all duration-200 group-hover:border-white/[0.16] group-hover:bg-white/[0.07]">
              <img
                src={logoHorizontal.url}
                alt="EdgeScope"
                className="h-12 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </span>
          </Link>
          <nav
            className="hidden items-center gap-2 text-sm text-muted-foreground md:flex"
            aria-label="Primary"
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveSection(item.id);
                  smoothScrollTo(item.id);
                }}
                className={`cursor-pointer rounded-full px-3 py-2 transition-all duration-200 hover:bg-white/[0.05] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  activeSection === item.id
                    ? "bg-primary/10 text-primary ring-1 ring-primary/15"
                    : ""
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <SecondaryCta />
            <PrimaryCta />
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-14 pt-6 sm:px-6 md:pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.045] px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground shadow-[0_14px_40px_oklch(0_0_0/0.2)] backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              No signals. No predictions. Only your own trading data.
            </div>

            <h1 className="mt-7 max-w-5xl font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
              Your trading journal should show you where{" "}
              <span className={SOFT_ACCENT}>your edge</span> is hiding.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-foreground/70 md:text-lg">
              EdgeScope helps traders log trades, review execution, track behavior, and uncover
              patterns from their own journal data.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryCta />
              <SecondaryCta />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.34, ease: EASE, delay: 0.08 }}
            className="relative lg:-mt-6"
          >
            <JournalWorkspacePreview />
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
          <Reveal
            className={`grid items-center gap-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl md:p-9 lg:grid-cols-[1fr_0.62fr] ${CARD_HOVER}`}
          >
            <SectionHeader
              eyebrow="The Problem"
              title="Most traders remember outcomes, but forget the conditions behind them."
              body="Without the full context, you can't truly learn. EdgeScope keeps every detail attached to the trade, so review is based on reality, not memory."
            />
            <div
              data-testid="problem-edge-symbol"
              className="relative hidden min-h-[220px] items-center justify-center lg:flex"
              aria-hidden="true"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,oklch(0.68_0.23_295/0.3),transparent_58%)] blur-2xl" />
              <div className="relative h-52 w-72">
                <div className="absolute left-8 top-12 h-px w-40 rotate-[15deg] bg-gradient-to-r from-transparent via-primary/58 to-transparent" />
                <div className="absolute left-24 top-24 h-px w-36 -rotate-[22deg] bg-gradient-to-r from-transparent via-primary/44 to-transparent" />
                <div className="absolute left-16 top-32 h-px w-44 rotate-[8deg] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                {[
                  "left-4 top-8 h-3 w-3 bg-primary/90 shadow-[0_0_24px_oklch(0.68_0.23_295/0.72)]",
                  "left-28 top-20 h-4 w-4 bg-white/80 shadow-[0_0_28px_oklch(0.68_0.23_295/0.48)]",
                  "right-10 top-6 h-2.5 w-2.5 bg-primary/75 shadow-[0_0_22px_oklch(0.68_0.23_295/0.58)]",
                  "left-14 bottom-8 h-2.5 w-2.5 bg-white/60 shadow-[0_0_20px_oklch(0.68_0.23_295/0.36)]",
                  "right-16 bottom-12 h-3.5 w-3.5 bg-primary/85 shadow-[0_0_26px_oklch(0.68_0.23_295/0.64)]",
                ].map((classes) => (
                  <span
                    key={classes}
                    className={`absolute rounded-full ring-4 ring-white/[0.035] ${classes}`}
                  />
                ))}
                <div className="absolute inset-x-8 bottom-4 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
              </div>
            </div>
          </Reveal>
        </section>

        <section
          id="workflow"
          className="scroll-mt-28 mx-auto max-w-7xl px-5 py-12 sm:px-6 lg:px-8"
        >
          <Reveal>
            <SectionHeader
              eyebrow="Review Workflow"
              title="A review workflow for real traders."
              body="A low-friction workflow for logging trades now and studying execution later."
              className="mx-auto text-center"
            />
          </Reveal>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {WORKFLOW.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.25, ease: EASE, delay: index * 0.04 }}
                className={`relative rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl ${CARD_HOVER}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
                    {item.step}
                  </span>
                  {index < WORKFLOW.length - 1 && (
                    <ArrowRight className="hidden h-4 w-4 text-muted-foreground lg:block" />
                  )}
                </div>
                <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-foreground/68">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeader
              eyebrow="Product Value"
              title="Everything points back to better review."
              body="Four practical tools for turning trades into a clearer feedback loop."
              className="mx-auto text-center"
            />
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BENEFITS.map(({ icon: Icon, title, body }, index) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.24, ease: EASE, delay: index * 0.03 }}
                whileHover={{ y: -3 }}
                className={`rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.025] p-5 shadow-[0_18px_60px_-36px_oklch(0_0_0/0.75)] backdrop-blur-xl ${CARD_HOVER}`}
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-primary/12">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-foreground/68">{body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="scope" className="scroll-mt-28 mx-auto max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-7 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
            <Reveal>
              <SectionHeader
                eyebrow="Scope"
                title="Evidence-backed journal analysis from reviewed trades."
                body="Scope looks for patterns in the data you have already captured and reviewed. It is built around your process, not market calls."
              />
              <div className="mt-6 grid gap-3 text-sm text-foreground/68 sm:grid-cols-3 lg:grid-cols-1">
                {["No market predictions", "No chart-pattern detection", "No trade signals"].map(
                  (item) => (
                    <div
                      key={item}
                      className={`flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 ${CARD_HOVER}`}
                    >
                      <Lock className="h-4 w-4 text-primary" />
                      {item}
                    </div>
                  ),
                )}
              </div>
            </Reveal>

            <Reveal
              className={`rounded-3xl border border-primary/20 bg-[linear-gradient(135deg,oklch(0.18_0.08_295/0.72),oklch(0.10_0.02_270/0.78))] p-5 shadow-[0_20px_70px_-42px_oklch(0.68_0.23_295/0.8)] backdrop-blur-xl md:p-7 ${CARD_HOVER}`}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-bold uppercase leading-none tracking-[0.22em] text-[#DDCFFF]">
                    What Scope looks for
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">Pattern areas from your journal</h3>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {SCOPE_PATTERNS.map((pattern) => (
                  <div
                    key={pattern}
                    className={`flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.045] p-4 text-sm leading-6 text-foreground/68 ${CARD_HOVER}`}
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {pattern}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section
          id="community"
          className="scroll-mt-28 mx-auto max-w-7xl px-5 py-12 sm:px-6 lg:px-8"
        >
          <Reveal
            className={`grid overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl lg:grid-cols-[0.92fr_1.08fr] ${CARD_HOVER}`}
          >
            <div className="p-6 md:p-9">
              <SectionHeader
                eyebrow="Community"
                title="Share selected trades with trusted people."
                body="Choose a trade, share only the context needed for feedback, and keep your full journal private. This is focused review, not a public feed."
              />
            </div>
            <div className="border-t border-white/[0.08] bg-black/20 p-6 md:p-9 lg:border-l lg:border-t-0">
              <div
                className={`rounded-2xl border border-white/[0.08] bg-white/[0.045] p-5 ${CARD_HOVER}`}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Selected trade packet</p>
                    <p className="text-xs leading-5 text-foreground/65">
                      Shared only when you choose
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {SHARED_TRADE_FIELDS.map((field) => (
                    <div
                      key={field}
                      className={`rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-foreground/68 ${CARD_HOVER}`}
                    >
                      {field}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-7 text-foreground/68">
                  No copy trading, no social feed, no public journal exposure.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-6 lg:px-8">
          <Reveal
            className={`relative overflow-hidden rounded-3xl border border-primary/20 bg-[linear-gradient(135deg,oklch(0.20_0.09_295/0.76),oklch(0.09_0.02_270/0.88))] p-8 text-center shadow-[0_28px_90px_-44px_oklch(0.68_0.23_295/0.9)] md:p-12 ${CARD_HOVER}`}
          >
            <BarChart3 className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mx-auto mt-5 max-w-3xl font-display text-3xl font-bold tracking-tight md:text-5xl">
              Start building your trading feedback loop.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-foreground/70">
              A calmer way to journal, review, and understand your own trading data.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <PrimaryCta>Start Journaling</PrimaryCta>
              <SecondaryCta />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <img src={logo.url} alt="" className="h-7 w-7 object-contain" />
            <span className="font-semibold">
              <span className="text-foreground">Edge</span>
              <span className="text-primary">Scope</span>
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            {["Private by default", "Review-focused", "Your data stays yours"].map((label) => (
              <span
                key={label}
                className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs">
            <Link to="/terms" className="transition hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="transition hover:text-foreground">
              Privacy
            </Link>
            <Link to="/disclaimer" className="transition hover:text-foreground">
              Disclaimer
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function JournalWorkspacePreview() {
  return (
    <>
      <div className="absolute -inset-7 rounded-[2rem] bg-[radial-gradient(circle_at_50%_35%,oklch(0.68_0.23_295/0.26),transparent_62%)] blur-2xl" />
      <div
        className={`relative overflow-hidden rounded-3xl border border-white/[0.12] bg-[oklch(0.11_0.018_270/0.78)] p-4 shadow-[0_28px_80px_-24px_oklch(0_0_0/0.88),0_0_60px_-20px_oklch(0.68_0.23_295/0.34)] ring-1 ring-white/[0.06] backdrop-blur-2xl ${CARD_HOVER}`}
      >
        <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/95">
                REVIEWED TRADE
              </p>
            </div>
            <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
              Scope-ready
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Instrument", value: "NQ", icon: LineChart },
              { label: "Result", value: "-0.8R", icon: BarChart3 },
              { label: "Status", value: "Reviewed", icon: CheckCircle2 },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.045] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-foreground/62">{label}</p>
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div
              className={`rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 ${CARD_HOVER}`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Camera className="h-4 w-4 text-primary" />
                Screenshot
              </div>
              <div className="mt-4 aspect-[4/3] rounded-xl border border-white/[0.08] bg-[linear-gradient(135deg,oklch(0.19_0.05_295/0.76),oklch(0.08_0.02_270/0.82))] p-3">
                <div className="h-full rounded-lg border border-white/[0.08] bg-black/20">
                  <div className="mt-9 h-px bg-primary/35" />
                  <div className="ml-8 mt-8 h-px w-2/3 bg-emerald-300/30" />
                  <div className="ml-16 mt-8 h-px w-1/2 bg-red-300/30" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div
                className={`rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 ${CARD_HOVER}`}
              >
                <div className="flex flex-wrap gap-2">
                  {["Emotion: FOMO", "Mistake: Late entry", "Rule: Partial followed"].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-1 text-xs text-foreground/64"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`rounded-2xl border border-primary/20 bg-primary/[0.08] p-4 ${CARD_HOVER}`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Journal insight preview
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground/68">
                  Reviewed trades like this help Scope find patterns in your behavior.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

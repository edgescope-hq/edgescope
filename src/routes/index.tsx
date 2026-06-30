import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, LineChart, Brain, BarChart3, Sparkles, CandlestickChart } from "lucide-react";
import logo from "@/assets/edgescope-logo.png.asset.json";
import logoHorizontal from "@/assets/edgescope-horizontal.png.asset.json";
import { Premium3DBackground } from "@/components/landing/premium-3d-background";

const SITE_URL = import.meta.env.VITE_SITE_URL || process.env.SITE_URL || "https://your-domain.com";
const PAGE_TITLE = "EdgeScope - Trading Journal & Analytics";
const PAGE_DESCRIPTION =
  "Journal, analyze, and improve. An edge journal for execution quality, emotional patterns, performance analytics, and long-term trading improvement.";
const OG_IMAGE = `${SITE_URL}${logoHorizontal.url}`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:url", content: SITE_URL + "/" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: SITE_URL + "/" }],
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

const FEATURES = [
  { icon: ShieldCheck, title: "Private by default", body: "Row-level security, signed image URLs, no public endpoints. Your trades stay yours.", gradient: "from-info/20 to-info/5" },
  { icon: LineChart, title: "Execution focused", body: "Grade every trade A+ to D. Track planned vs achieved R:R, sessions, and categories.", gradient: "from-primary/20 to-primary/5" },
  { icon: Brain, title: "Emotion aware", body: "Tag what you felt before, during, and after. See which states actually make you money.", gradient: "from-success/20 to-success/5" },
  { icon: BarChart3, title: "Performance Analytics", body: "Track win rate, R, session performance, day-of-week performance, psychology trends, and long-term growth.", gradient: "from-primary/20 to-primary/5" },
  { icon: Sparkles, title: "Scope", body: "Find hidden patterns in your trading journal. No signals. No predictions.", gradient: "from-warning/20 to-warning/5" },
  { icon: CandlestickChart, title: "Chart & Review", body: "Analyze charts, capture screenshots, journal trades, and review performance inside a single workflow.", gradient: "from-info/20 to-info/5" },
];



function Landing() {
  return (
    <div className="relative min-h-screen bg-transparent text-foreground">
      <Premium3DBackground scale="hero" />

      <header className="absolute top-0 left-0 right-0 z-20 bg-transparent">
        <div className="mx-auto flex h-24 max-w-6xl items-center justify-between px-6">
          <Link to="/" aria-label="EdgeScope home" className="group relative inline-flex items-center">
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-4 rounded-3xl bg-[radial-gradient(circle_at_center,oklch(0.68_0.23_295/0.28),transparent_70%)] opacity-75 blur-xl transition-opacity duration-500 group-hover:opacity-100"
            />
            <span className="relative inline-flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.045] px-4 py-2.5 shadow-[0_18px_55px_oklch(0.36_0.18_295/0.22)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-md transition-all duration-300 group-hover:border-white/[0.16] group-hover:bg-white/[0.06]">
              <img src={logoHorizontal.url} alt="EdgeScope" className="h-14 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
            </span>
          </Link>
          <nav className="flex items-center gap-1.5" aria-label="Primary" />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="pb-20 pt-32 text-center md:pt-40 md:pb-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_14px_oklch(0.74_0.19_152/0.55)]" />
            Execute. Journal. Analyze. Improve.
          </div>

          <h1 className="mx-auto max-w-5xl font-display text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
            Trade with{" "}
            <span className="text-gradient-primary">intention</span>.
            <br />
            <span className="text-muted-foreground">Review with clarity.</span>
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            An{" "}
            <span className="font-display font-semibold tracking-tight text-gradient-primary">
              Edge Journal
            </span>{" "}
            for execution quality, emotional patterns, performance analytics, and long-term trading improvement.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="group inline-flex items-center gap-2.5 rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-glow-lg)] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Get Started
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-7 py-3.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Sign In
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="grid gap-4 pb-20 sm:grid-cols-2 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.06]"
            >
              <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${f.gradient} ring-1 ring-white/[0.06]`}>
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-5 text-base font-semibold">{f.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

      </main>

      <footer className="relative z-10 border-t border-white/[0.04] py-10">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <img src={logo.url} alt="" className="h-7 w-7 object-contain" />
            <span className="text-xs font-semibold"><span className="text-foreground">Edge</span><span className="text-primary">Scope</span></span>
          </div>
        </div>
      </footer>
    </div>
  );
}

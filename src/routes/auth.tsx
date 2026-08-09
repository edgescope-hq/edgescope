import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
} from "lucide-react";
import { bootstrapFirstAdmin, checkBootstrap } from "@/lib/invites.functions";
import { EdgeScopeLogo } from "@/components/brand/edgescope-logo";
import { Premium3DBackground } from "@/components/landing/premium-3d-background";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).default("signin").catch("signin"),
  oauth: z.enum(["google"]).optional(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  error_description: z.string().optional(),
});

const EASE = [0.16, 1, 0.3, 1] as const;
const CARD_HOVER =
  "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_22px_70px_-34px_oklch(0.68_0.23_295/0.55)]";
const EYEBROW_ACCENT = "text-primary";
type AuthMode = "signin" | "signup" | "forgot";

const AUTH_COPY = {
  signin: {
    eyebrow: "Sign in",
    title: "Welcome back to EdgeScope.",
    body: "Continue your journal, review your trades, and keep building your feedback loop.",
    cardTitle: "Sign in to EdgeScope",
    cardBody: "Enter your journal workspace.",
  },
  signup: {
    eyebrow: "Create account",
    title: "Start your trading journal.",
    body: "Log trades, review execution, and build your feedback loop from your own data.",
    cardTitle: "Create your account",
    cardBody: "Start with a private journal built around review.",
  },
  forgot: {
    eyebrow: "Password reset",
    title: "Get back to your journal.",
    body: "Request a reset link and continue reviewing your trades.",
    cardTitle: "Reset your password",
    cardBody: "Enter your email and we will send you a reset link.",
  },
} as const;

const AUTH_BULLETS = {
  signin: [
    { icon: Lock, text: "Private journal" },
    { icon: Search, text: "Review-focused" },
    { icon: ShieldCheck, text: "No signals" },
  ],
  signup: [
    { icon: BookOpen, text: "Quick trade capture" },
    { icon: Search, text: "Detailed review when you are ready" },
    { icon: Lock, text: "Private by default" },
  ],
  forgot: [
    { icon: Lock, text: "Secure reset flow" },
    { icon: Search, text: "Return to review" },
    { icon: ShieldCheck, text: "Private workspace" },
  ],
} as const;

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Sign in - EdgeScope" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const { mode, oauth, error, error_code, error_description } = useSearch({ from: "/auth" });
  const copy = AUTH_COPY[mode];
  const navigate = useNavigate();

  useEffect(() => {
    if (!oauth) return;
    if (error || error_code || error_description) {
      toast.error(getOAuthErrorMessage(error_code, error_description));
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [error, error_code, error_description, navigate, oauth]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="relative min-h-screen overflow-hidden bg-transparent text-foreground"
    >
      <Premium3DBackground scale="auth" />
      <AuthAtmosphereVeil />

      <main className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col px-5 py-6 sm:px-8 lg:min-h-screen lg:justify-between lg:px-12 xl:px-16">
          <motion.header
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="flex items-center justify-between gap-4"
          >
            <Link
              to="/"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <Link
              to="/"
              aria-label="EdgeScope home"
              className="inline-flex cursor-pointer items-center"
            >
              <EdgeScopeLogo tone="light" className="h-12 w-auto object-contain" />
            </Link>
          </motion.header>

          <motion.div
            key={`${mode}-hero`}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE, delay: 0.04 }}
            className="mx-auto w-full max-w-2xl py-10 lg:mx-0 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:py-12"
          >
            <p
              className={`text-[13px] font-extrabold uppercase leading-none tracking-[0.24em] ${EYEBROW_ACCENT}`}
            >
              {copy.eyebrow}
            </p>
            <h1 className="mt-5 font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              <AuthTitle mode={mode} />
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-foreground/70 md:text-lg">
              {copy.body}
            </p>

            <div className="mt-7 grid gap-2 sm:max-w-lg">
              {AUTH_BULLETS[mode].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className={`flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-2.5 text-sm text-foreground/68 backdrop-blur-xl ${CARD_HOVER}`}
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/12">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            <AuthPreview />
          </motion.div>
        </section>

        <section className="flex items-center justify-center border-t border-white/[0.08] bg-black/30 px-5 py-12 backdrop-blur-sm sm:px-8 lg:border-l lg:border-t-0 lg:px-12 xl:px-16">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: EASE, delay: 0.08 }}
            className="w-full max-w-[440px]"
          >
            <div
              className={`rounded-3xl border border-white/[0.1] bg-[oklch(0.10_0.018_270/0.88)] p-6 shadow-[0_28px_80px_-28px_oklch(0_0_0/0.86),0_0_52px_-22px_oklch(0.68_0.23_295/0.34)] ring-1 ring-white/[0.05] backdrop-blur-2xl sm:p-7 ${CARD_HOVER}`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${mode}-copy`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="mb-6"
                >
                  <p
                    className={`text-[13px] font-bold uppercase leading-none tracking-[0.22em] ${EYEBROW_ACCENT}`}
                  >
                    {copy.eyebrow}
                  </p>
                  <h2 className="mt-3 text-2xl font-bold tracking-tight">{copy.cardTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-foreground/68">{copy.cardBody}</p>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.22, ease: EASE }}
                >
                  {mode === "signin" && <SignInForm />}
                  {mode === "signup" && <SignUpForm />}
                  {mode === "forgot" && <ForgotForm />}
                </motion.div>
              </AnimatePresence>
            </div>

            <AuthLinks mode={mode} />
          </motion.div>
        </section>
      </main>
    </motion.div>
  );
}

function AuthAtmosphereVeil() {
  return (
    <div
      data-testid="auth-atmosphere"
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
    >
      <div className="absolute inset-0 bg-[linear-gradient(120deg,oklch(0.05_0.02_270/0.34),oklch(0.05_0.02_270/0.64)_62%,oklch(0.05_0.02_270/0.78))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_22%,oklch(0.68_0.23_295/0.18),transparent_36%),radial-gradient(circle_at_78%_68%,oklch(0.7_0.2_330/0.12),transparent_34%)]" />
      <div className="absolute inset-y-0 right-0 w-full bg-[linear-gradient(90deg,transparent,oklch(0.04_0.018_270/0.42)_58%,oklch(0.04_0.018_270/0.74))]" />
      {[
        "left-[12%] top-[18%] h-1 w-1 opacity-70",
        "left-[28%] top-[58%] h-1.5 w-1.5 opacity-50",
        "left-[44%] top-[28%] h-1 w-1 opacity-45",
        "right-[18%] top-[22%] h-1 w-1 opacity-35",
        "right-[28%] bottom-[24%] h-1.5 w-1.5 opacity-30",
      ].map((classes) => (
        <span
          key={classes}
          className={`absolute rounded-full bg-primary shadow-[0_0_18px_oklch(0.68_0.23_295/0.55)] ${classes}`}
        />
      ))}
    </div>
  );
}

function AuthTitle({ mode }: { mode: AuthMode }) {
  if (mode === "signin") {
    return <>Welcome back to EdgeScope.</>;
  }

  if (mode === "signup") {
    return <>Start your trading journal.</>;
  }

  return <>Get back to your journal.</>;
}

function getOAuthErrorMessage(errorCode?: string, errorDescription?: string) {
  const detail = `${errorCode ?? ""} ${errorDescription ?? ""}`.toLowerCase();
  if (detail.includes("access_denied") || detail.includes("cancel")) {
    return "Google sign-in was cancelled. You can try again whenever you are ready.";
  }
  return "Google sign-in could not be completed. Please try again.";
}

function getGoogleRedirectTo(mode: AuthMode) {
  const params = new URLSearchParams({ mode, oauth: "google" });
  return `${window.location.origin}/auth?${params.toString()}`;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function OAuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-white/[0.1]" />
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
        Or continue with email
      </span>
      <div className="h-px flex-1 bg-white/[0.1]" />
    </div>
  );
}

function GoogleAuthButton({ mode }: { mode: Exclude<AuthMode, "forgot"> }) {
  const [loading, setLoading] = useState(false);

  async function startGoogleAuth() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getGoogleRedirectTo(mode),
          queryParams: { prompt: "select_account" },
        },
      });

      if (error) {
        setLoading(false);
        toast.error("Google sign-in could not be started. Please try again.");
      }
    } catch {
      setLoading(false);
      toast.error("Google sign-in could not be started. Check your connection and try again.");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full rounded-xl border-white/[0.1] bg-white/[0.045] text-sm font-semibold text-foreground shadow-none transition-all duration-200 hover:-translate-y-px hover:border-white/[0.18] hover:bg-white/[0.075]"
      disabled={loading}
      onClick={startGoogleAuth}
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
      Continue with Google
    </Button>
  );
}

function AuthPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE, delay: 0.1 }}
      className={`mt-7 hidden overflow-hidden rounded-2xl border border-white/[0.1] bg-[oklch(0.11_0.018_270/0.66)] p-4 shadow-[0_18px_55px_-34px_oklch(0_0_0/0.78)] backdrop-blur-2xl lg:block ${CARD_HOVER}`}
    >
      <div
        className={`flex items-start gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-4 ${CARD_HOVER}`}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-primary/80">Private by default</p>
          <p className="mt-2 text-sm leading-7 text-foreground/68">
            Your journal stays private unless you choose to share a selected trade for feedback.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function AuthLinks({ mode }: { mode: "signin" | "signup" | "forgot" }) {
  return (
    <div className="mt-6 text-center text-sm text-muted-foreground">
      {mode === "signin" && (
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
          <span>
            New to EdgeScope?{" "}
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="cursor-pointer font-medium text-primary transition-colors duration-200 hover:text-primary-glow"
            >
              Create account
            </Link>
          </span>
        </div>
      )}
      {mode === "signup" && (
        <>
          Already have an account?{" "}
          <Link
            to="/auth"
            search={{ mode: "signin" }}
            className="cursor-pointer font-medium text-primary transition-colors duration-200 hover:text-primary-glow"
          >
            Sign in
          </Link>
        </>
      )}
      {mode === "forgot" && (
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          className="cursor-pointer font-medium text-primary transition-colors duration-200 hover:text-primary-glow"
        >
          Back to sign in
        </Link>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground/70">
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
  );
}

function SignInForm() {
  return (
    <div className="space-y-4">
      <GoogleAuthButton mode="signin" />
    </div>
  );
}

function SignUpForm() {
  return (
    <div className="space-y-4">
      <GoogleAuthButton mode="signup" />
    </div>
  );
}

function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-success/15 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <p className="text-sm text-muted-foreground">Check your inbox for the reset link.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Email
        </Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-xl border-white/[0.08] bg-white/[0.045] text-foreground transition-colors duration-200 placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-primary/25"
        />
      </div>
      <Button
        type="submit"
        className="h-11 w-full rounded-xl bg-primary text-sm font-semibold shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:brightness-110"
        disabled={loading}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send reset link
      </Button>
    </form>
  );
}

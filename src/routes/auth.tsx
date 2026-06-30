import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { bootstrapFirstAdmin, checkBootstrap } from "@/lib/invites.functions";
import logo from "@/assets/edgescope-horizontal.png.asset.json";
import { Premium3DBackground } from "@/components/landing/premium-3d-background";


const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).default("signin").catch("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — EdgeScope" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const { mode } = useSearch({ from: "/auth" });
  const easing = [0.16, 1, 0.3, 1] as const;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: easing }}
      className="relative min-h-screen bg-transparent"
    >
      <Premium3DBackground scale="auth" />

      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: easing }}
        className="relative z-10 px-6 py-5"
      >
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </motion.header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16 pt-8">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: easing, delay: 0.04 }}
          className="w-full max-w-[400px]"
        >
          {/* Logo + heading */}
          <div className="mb-10 text-center">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: easing, delay: 0.06 }}
              className="mx-auto mb-5 flex items-center justify-center"
            >
              <img src={logo.url} alt="EdgeScope" className="h-14 w-auto object-contain" />
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: easing }}
              >
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  {mode === "signin" && "Welcome back"}
                  {mode === "forgot" && "Reset password"}
                  {mode === "signup" && "Create your account"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {mode === "signup" && "Start your EdgeScope trading journal."}
                  {mode === "signin" && "Sign in to EdgeScope."}
                  {mode === "forgot" && "We'll email you a reset link."}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Form card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: easing, delay: 0.08 }}
            className="rounded-2xl border border-white/[0.08] bg-[oklch(0.11_0.018_270/0.78)] p-6 shadow-[0_24px_60px_-20px_oklch(0_0_0/0.7),0_0_40px_-12px_oklch(0.68_0.23_295/0.25)] ring-1 ring-white/[0.04] backdrop-blur-2xl"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.25, ease: easing }}
              >
                {mode === "signin" && <SignInForm />}
                {mode === "signup" && <SignUpForm />}
                {mode === "forgot" && <ForgotForm />}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* Footer links */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22, ease: easing, delay: 0.1 }}
            className="mt-6 text-center text-sm text-muted-foreground"
          >
            {mode === "signin" && (
              <Link to="/auth" search={{ mode: "forgot" }} className="transition-colors duration-200 hover:text-foreground">
                Forgot password
              </Link>
            )}
            {mode === "signup" && (
              <>
                Already have an account?{" "}
                <Link to="/auth" search={{ mode: "signin" }} className="font-medium text-primary transition-colors duration-200 hover:text-primary-glow">
                  Sign in
                </Link>
              </>
            )}
            {mode === "forgot" && (
              <Link to="/auth" search={{ mode: "signin" }} className="font-medium text-primary transition-colors duration-200 hover:text-primary-glow">
                Back to sign in
              </Link>
            )}
          </motion.div>
        </motion.div>
      </main>
    </motion.div>

  );
}

function SignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    try {
      await bootstrapFirstAdmin();
    } catch { /* non-fatal */ }
    setLoading(false);
    toast.success("Signed in");
    navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
        <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl bg-white/[0.04] border-white/[0.06] focus:border-primary/40 focus:ring-primary/20" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
        <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl bg-white/[0.04] border-white/[0.06] focus:border-primary/40 focus:ring-primary/20" />
      </div>
      <Button type="submit" className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Sign in
      </Button>
    </form>
  );
}

function SignUpForm() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);

  useEffect(() => {
    checkBootstrap()
      .then((r) => setNeedsBootstrap(r.needsBootstrap))
      .catch(() => setNeedsBootstrap(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username))
      return toast.error("Username: 3-32 chars, letters/numbers/_/- only");

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { username, display_name: username },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Signup failed");

      // If signup didn't return a session (e.g. email confirmation enabled),
      // try signing in directly — first admin is auto-confirmed by the DB trigger.
      let session = data.session;
      if (!session) {
        const { data: signInData } = await supabase.auth.signInWithPassword({ email, password });
        session = signInData.session ?? null;
      }

      if (session) {
        try { await bootstrapFirstAdmin(); } catch { /* non-fatal */ }
        toast.success("Welcome to EdgeScope");
        navigate({ to: "/dashboard" });
      } else {
        setSent(true);
        toast.success("Check your email to verify your account");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-success/15 text-success">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
        </div>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to <span className="font-medium text-foreground">{email}</span>.
          Click it to activate your account, then sign in.
        </p>
      </div>
    );
  }


  return (
    <form onSubmit={submit} className="space-y-4">
      {needsBootstrap === true && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          You're the first user — this account will be created as the admin.
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</Label>
        <Input id="username" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="trader_handle" className="rounded-xl bg-white/[0.04] border-white/[0.06] focus:border-primary/40 focus:ring-primary/20" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl bg-white/[0.04] border-white/[0.06] focus:border-primary/40 focus:ring-primary/20" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
        <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl bg-white/[0.04] border-white/[0.06] focus:border-primary/40 focus:ring-primary/20" />
        <p className="text-xs text-muted-foreground/60">At least 8 characters. Checked against known leaks.</p>
      </div>
      <Button type="submit" className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account
      </Button>
    </form>
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
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
        </div>
        <p className="text-sm text-muted-foreground">Check your inbox for the reset link.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl bg-white/[0.04] border-white/[0.06] focus:border-primary/40 focus:ring-primary/20" />
      </div>
      <Button type="submit" className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send reset link
      </Button>
    </form>
  );
}

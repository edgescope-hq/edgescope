import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Premium3DBackground } from "@/components/landing/premium-3d-background";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — EdgeScope" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("At least 8 characters");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-transparent px-6">
      <Premium3DBackground scale="auth" />
      <div className="relative z-10 w-full max-w-[400px] rounded-2xl border border-white/[0.08] bg-[oklch(0.11_0.018_270/0.78)] p-6 shadow-[0_24px_60px_-20px_oklch(0_0_0/0.7),0_0_40px_-12px_oklch(0.68_0.23_295/0.25)] backdrop-blur-2xl">
        <h1 className="font-display text-xl font-bold">Set a new password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Choose a strong, unique password.</p>
        {!ready ? (
          <p className="mt-6 text-sm text-muted-foreground">Verifying reset link...</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                New password
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl bg-white/[0.04] border-white/[0.06] focus:border-primary/40 focus:ring-primary/20"
              />
            </div>
            <Button
              type="submit"
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

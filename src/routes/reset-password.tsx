import { createFileRoute, Link } from "@tanstack/react-router";
import { Premium3DBackground } from "@/components/landing/premium-3d-background";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Google sign-in only - EdgeScope" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-transparent px-6">
      <Premium3DBackground scale="auth" />
      <div className="relative z-10 w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[oklch(0.11_0.018_270/0.78)] p-6 text-center shadow-[0_24px_60px_-20px_oklch(0_0_0/0.7),0_0_40px_-12px_oklch(0.68_0.23_295/0.25)] backdrop-blur-2xl">
        <h1 className="font-display text-xl font-bold">Google sign-in only</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          EdgeScope accounts use Google sign-in, so there is no password to reset here.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110"
        >
          Continue to sign in
        </Link>
      </div>
    </div>
  );
}

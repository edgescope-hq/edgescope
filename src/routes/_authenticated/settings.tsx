import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { User, Shield, Palette, Info, LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import appLogo from "@/assets/edgescope-logo.png.asset.json";
import appLogoHorizontal from "@/assets/edgescope-horizontal.png.asset.json";
import { getProfile, updateProfile } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — EdgeScope" },
      { name: "description", content: "Manage your profile, appearance, and security." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

type SectionId = "profile" | "appearance" | "security" | "about";

function Field({
  label, value, type = "text", onChange, disabled, placeholder,
}: {
  label: string; value: string; type?: string;
  onChange?: (v: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <input
        type={type} value={value} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-1.5 w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-primary/40 focus:ring-2 disabled:opacity-50"
      />
    </label>
  );
}

function SettingsPage() {
  const [active, setActive] = useState<SectionId>("profile");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const getProfileFn = useServerFn(getProfile);
  const updateProfileFn = useServerFn(updateProfile);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfileFn(),
  });

  const sections = useMemo(() => {
    const base: { id: SectionId; label: string; icon: typeof User }[] = [
      { id: "profile", label: "Profile", icon: User },
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "security", label: "Security", icon: Shield },
      { id: "about", label: "About", icon: Info },
    ];
    return base;
  }, []);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username ?? "");
    setDisplayName(profile.display_name ?? "");
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: () =>
      updateProfileFn({ data: { username: username.trim(), display_name: displayName.trim() || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReset = async () => {
    if (!profile?.email) { toast.error("No email on profile"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message); else toast.success("Password reset email sent");
  };

  const copyEdgeId = async () => {
    const edgeId = (profile as { edge_id?: string | null } | undefined)?.edge_id;
    if (!edgeId) return;
    try { await navigator.clipboard.writeText(edgeId); toast.success("Edge ID copied"); } catch { /* ignore */ }
  };

  const initial = (displayName || username || "?").charAt(0).toUpperCase();
  const edgeId = (profile as { edge_id?: string | null } | undefined)?.edge_id ?? null;

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="flex items-center gap-3">
        <img src={appLogo.url} alt="EdgeScope" className="h-12 w-12 object-contain" />
        <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="text-3xl font-bold tracking-tight md:text-4xl">
          Settings
        </motion.h1>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="glow-card h-fit rounded-2xl p-1.5">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive ? "bg-primary/10 text-foreground" : "text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                {s.label}
              </button>
            );
          })}
        </nav>

        <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="glow-card rounded-2xl p-6">
          {active === "profile" && (
            <div>
              <h2 className="text-lg font-bold">Profile</h2>
              <div className="mt-5 flex items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-xl font-bold text-primary-foreground shadow-[var(--shadow-glow)]">{initial}</div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{profile?.display_name || profile?.username || (isLoading ? "Loading..." : "—")}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{profile?.email ?? ""}</div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Only you see this" />
                <Field label="Username" value={username} onChange={setUsername} placeholder="trader_handle" />
                <Field label="Email" value={profile?.email ?? ""} type="email" disabled />
                {edgeId && (
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">EdgeScope ID</span>
                    <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm ring-1 ring-white/[0.06]">
                      <span className="tabular-nums">{edgeId}</span>
                      <button onClick={copyEdgeId} className="ml-auto rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground">Copy</button>
                    </div>
                  </label>
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => saveProfile.mutate()}
                  disabled={saveProfile.isPending || username.trim().length < 3}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
                >
                  {saveProfile.isPending ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          )}

          {active === "appearance" && (
            <div>
              <h2 className="text-lg font-bold">Appearance</h2>
              <p className="mt-2 text-sm text-muted-foreground">EdgeScope uses a premium dark theme tuned for long review sessions.</p>
              <div className="mt-6 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <div className="text-sm font-semibold">Theme</div>
                <div className="mt-1 text-xs text-muted-foreground">Dark · Purple accent</div>
                <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground/70">Light theme and custom accents — coming soon.</div>
              </div>
            </div>
          )}

          {active === "security" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold">Security</h2>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Change password</div>
                    <div className="text-xs text-muted-foreground">We'll email you a reset link.</div>
                  </div>
                  <button
                    onClick={sendReset}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3.5 py-2 text-xs font-semibold ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
                  >
                    Send reset email
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Sign out</div>
                    <div className="text-xs text-muted-foreground">End your session on this device.</div>
                  </div>
                  <button
                    onClick={async () => {
                      await qc.cancelQueries();
                      qc.clear();
                      await supabase.auth.signOut();
                      navigate({ to: "/auth", replace: true });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 px-3.5 py-2 text-xs font-semibold text-destructive ring-1 ring-destructive/30 transition hover:bg-destructive/20"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06] opacity-60">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Delete account</div>
                    <div className="text-xs text-muted-foreground">Permanently remove your account and data.</div>
                  </div>
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Coming soon</span>
                </div>
              </div>
            </div>
          )}

          {active === "about" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">About</h2>
              <div className="rounded-xl bg-white/[0.03] p-5 ring-1 ring-white/[0.06]">
                <div className="flex flex-col items-start gap-3">
                  <img src={appLogoHorizontal.url} alt="EdgeScope" className="h-14 w-auto object-contain" />
                  <div className="text-xs text-muted-foreground">Version 1.0.0</div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

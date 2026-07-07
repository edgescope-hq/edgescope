import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app/sidebar";
import { cancelAccountDeletion, getProfile } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const getProfileFn = useServerFn(getProfile);
  const cancelAccountDeletionFn = useServerFn(cancelAccountDeletion);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfileFn(),
  });

  const profileIncomplete =
    profile && (profile as { profile_completed?: boolean | null }).profile_completed !== true;

  useEffect(() => {
    if (profileIncomplete && location.pathname !== "/dashboard") {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [profileIncomplete, location.pathname, navigate]);
  const cancelDeletionM = useMutation({
    mutationFn: () => cancelAccountDeletionFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Account deletion cancelled. Your EdgeScope account is active again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deletionScheduledFor =
    (profile as { deletion_scheduled_for?: string | null } | undefined)?.deletion_scheduled_for ??
    null;

  const signOutAndKeepDeletion = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="edgescope-app relative flex h-screen min-h-screen w-full flex-col overflow-hidden bg-[oklch(0.065_0.012_270)] text-foreground [--muted-foreground:oklch(0.70_0.018_270)] md:flex-row">
      <div
        className="pointer-events-none absolute inset-0 app-orbit-texture opacity-80"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.23_295/0.105),transparent_64%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-18rem] top-[-16rem] h-[42rem] w-[42rem] rounded-full bg-primary/[0.035] blur-3xl"
        aria-hidden
      />
      <AppSidebar />
      <main className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
      {deletionScheduledFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md">
          <div className="glow-card w-full max-w-lg rounded-2xl p-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/85">
              Account deletion pending review
            </div>
            <h2 className="mt-2 text-xl font-bold">Keep your EdgeScope account?</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This account is pending deletion review. Cancel the request to continue using
              EdgeScope, or sign out to keep the request active.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={signOutAndKeepDeletion}
                className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] transition hover:text-foreground"
              >
                Sign out
              </button>
              <button
                type="button"
                onClick={() => cancelDeletionM.mutate()}
                disabled={cancelDeletionM.isPending}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 disabled:opacity-50"
              >
                {cancelDeletionM.isPending ? "Cancelling..." : "Don't delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

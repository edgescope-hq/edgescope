import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app/sidebar";

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
  return (
    <div className="relative flex min-h-screen w-full flex-col md:flex-row bg-background text-foreground">
      {/* Subtle aurora background */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.23_295/0.06),transparent_60%)] opacity-80" />
      <AppSidebar />
      <main className="relative flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

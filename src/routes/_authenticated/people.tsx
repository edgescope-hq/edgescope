import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllUsers, amIAdmin } from "@/lib/invites.functions";
import { Loader2, ShieldCheck, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell } from "@/components/ui/premium";

export const Route = createFileRoute("/_authenticated/people")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "People — EdgeScope" },
      { name: "description", content: "Admin: users." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: PeoplePage,
});

function PeoplePage() {
  const adminFn = useServerFn(amIAdmin);
  const { data: adminInfo, isLoading: checkingAdmin } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: async () => {
      try {
        return await adminFn();
      } catch {
        return { admin: false };
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  if (checkingAdmin) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!adminInfo?.admin) {
    return (
      <div className="grid h-[60vh] place-items-center px-6 text-center">
        <div>
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Admins only</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You don't have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader
        icon={UserCog}
        eyebrow="Admin"
        title="People"
        description="Admin-only user overview for account support and moderation context."
      />
      <div className="mt-5">
        <UsersTable />
      </div>
    </PageShell>
  );
}

function UsersTable() {
  const listFn = useServerFn(listAllUsers);
  const {
    data: users,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => listFn(),
  });

  return (
    <div className="glow-card overflow-hidden rounded-2xl">
      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-rose-300">{(error as Error).message}</div>
      ) : !users?.length ? (
        <div className="p-8 text-sm text-muted-foreground">No users found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-white/[0.012] text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3.5 text-left">Name</th>
                <th className="px-4 py-3.5 text-left">Email</th>
                <th className="px-4 py-3.5 text-left">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-white/[0.045] transition-colors last:border-0 hover:bg-white/[0.025]"
                >
                  <td className="px-4 py-3 font-semibold text-foreground">{u.name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {fmt(u.join_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

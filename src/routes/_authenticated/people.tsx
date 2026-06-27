import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllUsers, amIAdmin } from "@/lib/invites.functions";
import { Loader2, ShieldCheck, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
          <p className="mt-1 text-sm text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight md:text-4xl">
        <UserCog className="h-7 w-7 text-primary" /> People
      </h1>

      <div className="mt-5">
        <UsersTable />
      </div>
    </div>
  );
}

function UsersTable() {
  const listFn = useServerFn(listAllUsers);
  const { data: users, isLoading, error } = useQuery({
    queryKey: ["all-users"], queryFn: () => listFn(),
  });

  return (
    <div className="glow-card overflow-hidden rounded-2xl">
      {isLoading ? (
        <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="p-6 text-sm text-rose-300">{(error as Error).message}</div>
      ) : !users?.length ? (
        <div className="p-6 text-sm text-muted-foreground">No users found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-left">Community</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-semibold text-foreground">{u.name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(u.join_date)}</td>
                  <td className="px-4 py-3">
                    {u.community_access ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                        <ShieldCheck className="h-3 w-3" /> Granted
                      </span>
                    ) : <span className="text-[11px] text-muted-foreground">—</span>}
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
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return "—";
  }
}

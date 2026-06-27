import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import {
  ArrowLeft,
  Bell,
  Check,
  Copy,
  MessageCircle,
  Plus,
  Send,
  Settings as SettingsIcon,
  Trash2,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addComment,
  cancelInvitation,
  createGroup,
  deleteComment,
  deleteGroup,
  getMyProfile,
  inviteByEdgeId,
  leaveGroup,
  listGroupMembers,
  listGroupPendingInvites,
  listGroupTrades,
  listMyGroups,
  listMyInvitations,
  listNotifications,
  listTradeComments,
  markNotificationsRead,
  removeMember,
  renameGroup,
  respondInvitation,
  updateComment,
  type GroupSummary,
  type GroupTrade,
  type TradeComment,
} from "@/lib/groups.functions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "Community — EdgeScope" },
      { name: "description", content: "Private trader review circles." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CommunityPage,
});

function CommunityPage() {
  const [activeGroup, setActiveGroup] = useState<GroupSummary | null>(null);

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <Header />
      {activeGroup ? (
        <GroupDetail group={activeGroup} onBack={() => setActiveGroup(null)} />
      ) : (
        <GroupsList onOpen={setActiveGroup} />
      )}
    </div>
  );
}

// ============ Header (Edge ID + notifications + invitations) ============

function Header() {
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => profileFn(),
  });
  const [showNotifs, setShowNotifs] = useState(false);

  const notifFn = useServerFn(listNotifications);
  const { data: notifications = [] } = useQuery({
    queryKey: ["community-notifications"],
    queryFn: () => notifFn(),
    refetchInterval: 30_000,
  });
  const unread = notifications.filter((n) => !n.read_at).length;

  const copyEdgeId = () => {
    if (!profile?.edge_id) return;
    navigator.clipboard.writeText(profile.edge_id);
    toast.success("EdgeScope ID copied");
  };

  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl font-bold tracking-tight md:text-4xl"
        >
          Community
        </motion.h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Review trades with a trusted circle. Your journal stays private by default.
        </p>
      </div>
      <div className="flex items-center gap-3">
        {profile?.edge_id && (
          <button
            onClick={copyEdgeId}
            className="group flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs ring-1 ring-white/[0.06] transition hover:bg-white/[0.07]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Your ID
            </span>
            <span className="font-mono text-sm font-semibold">{profile.edge_id}</span>
            <Copy className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground" />
          </button>
        )}
        <button
          onClick={() => setShowNotifs(true)}
          className="relative rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.06] transition hover:bg-white/[0.07]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </button>
      </div>
      <InvitationsBar />
      <AnimatePresence>
        {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
      </AnimatePresence>
    </div>
  );
}

function InvitationsBar() {
  const qc = useQueryClient();
  const fn = useServerFn(listMyInvitations);
  const { data: invs = [] } = useQuery({
    queryKey: ["my-invitations"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });
  const respondFn = useServerFn(respondInvitation);
  const respond = useMutation({
    mutationFn: (vars: { id: string; accept: boolean }) =>
      respondFn({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success(vars.accept ? "Joined group" : "Invitation declined");
      qc.invalidateQueries({ queryKey: ["my-invitations"] });
      qc.invalidateQueries({ queryKey: ["my-groups"] });
      qc.invalidateQueries({ queryKey: ["community-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (invs.length === 0) return null;
  return (
    <div className="w-full">
      <div className="glow-card rounded-2xl p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          Pending invitations
        </div>
        <div className="space-y-2">
          {invs.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3.5 py-2.5 ring-1 ring-white/[0.05]"
            >
              <div className="min-w-0 text-sm">
                <div className="font-semibold">{i.group_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  from <span className="font-mono text-foreground/80">{i.inviter_edge_id}</span> · {i.inviter_display}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => respond.mutate({ id: i.id, accept: true })}
                  disabled={respond.isPending}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => respond.mutate({ id: i.id, accept: false })}
                  disabled={respond.isPending}
                  className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.06] transition hover:text-foreground disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(listNotifications);
  const markFn = useServerFn(markNotificationsRead);
  const { data: notifications = [] } = useQuery({
    queryKey: ["community-notifications"],
    queryFn: () => fn(),
  });
  const markAll = useMutation({
    mutationFn: () => markFn({ data: { ids: "all" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-notifications"] }),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-4 backdrop-blur-md sm:place-items-center"
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="glow-card w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl p-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">Notifications</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => markAll.mutate()}
              className="rounded-lg px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              Mark all read
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {notifications.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                "rounded-xl px-3.5 py-2.5 text-sm ring-1",
                n.read_at
                  ? "bg-white/[0.02] ring-white/[0.04] text-muted-foreground"
                  : "bg-primary/[0.06] ring-primary/20",
              )}
            >
              <NotificationText n={n} />
              <div className="mt-1 text-[10px] text-muted-foreground/70">
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function NotificationText({ n }: { n: { type: string; payload: Record<string, string | number | boolean | null> } }) {
  const p = n.payload;
  switch (n.type) {
    case "invite_received":
      return <>You were invited to <b>{String(p.group_name ?? "a group")}</b>.</>;
    case "invite_accepted":
      return <><span className="font-mono">{String(p.invitee_edge_id ?? "")}</span> joined your group.</>;
    case "trade_shared":
      return <><span className="font-mono">{String(p.trader_edge_id ?? "")}</span> shared a trade on <b>{String(p.instrument ?? "")}</b>.</>;
    case "comment_added":
      return <><span className="font-mono">{String(p.author_edge_id ?? "")}</span> commented on your <b>{String(p.instrument ?? "")}</b> trade.</>;
    default:
      return <>{n.type}</>;
  }
}

// ============ Groups list ============

function GroupsList({ onOpen }: { onOpen: (g: GroupSummary) => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(listMyGroups);
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["my-groups"],
    queryFn: () => fn(),
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const createFn = useServerFn(createGroup);
  const create = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim() } }),
    onSuccess: () => {
      toast.success("Group created");
      setName("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["my-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" /> Your groups
        </h2>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" /> New group
        </button>
      </div>

      {isLoading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="glow-card mt-6 rounded-2xl p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h3 className="mt-3 text-base font-semibold">No groups yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a group, then invite traders by their EdgeScope ID.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => onOpen(g)}
              className="glow-card flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition hover:ring-white/[0.12]"
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1",
                    g.role === "owner"
                      ? "bg-primary/15 text-primary ring-primary/25"
                      : "bg-white/[0.04] text-muted-foreground ring-white/[0.08]",
                  )}
                >
                  {g.role}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {g.member_count} member{g.member_count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="text-lg font-bold tracking-tight">{g.name}</div>
              <div className="text-[11px] text-muted-foreground">
                Created {new Date(g.created_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {creating && (
          <ModalShell onClose={() => setCreating(false)} title="Create group">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) create.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  GROUP NAME
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. ICT Study Group"
                  maxLength={60}
                  className="mt-1.5 w-full rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || create.isPending}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
                >
                  {create.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============ Group detail ============

function GroupDetail({ group, onBack }: { group: GroupSummary; onBack: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"trades" | "members" | "settings">("trades");

  const tradesFn = useServerFn(listGroupTrades);
  const { data: trades = [] } = useQuery({
    queryKey: ["group-trades", group.id],
    queryFn: () => tradesFn({ data: { groupId: group.id } }),
  });

  const membersFn = useServerFn(listGroupMembers);
  const { data: members = [] } = useQuery({
    queryKey: ["group-members", group.id],
    queryFn: () => membersFn({ data: { groupId: group.id } }),
  });

  const leaveFn = useServerFn(leaveGroup);
  const leave = useMutation({
    mutationFn: () => leaveFn({ data: { groupId: group.id } }),
    onSuccess: () => {
      toast.success("Left group");
      qc.invalidateQueries({ queryKey: ["my-groups"] });
      onBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOwner = group.role === "owner";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All groups
        </button>
        {!isOwner && (
          <button
            onClick={() => leave.mutate()}
            className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-white/[0.06] hover:text-destructive"
          >
            Leave group
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{group.name}</h2>
          <p className="text-xs text-muted-foreground">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          {(["trades", "members", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition",
                tab === t ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "trades" && <TradesTab group={group} trades={trades} />}
      {tab === "members" && <MembersTab group={group} members={members} />}
      {tab === "settings" && <SettingsTab group={group} onDeleted={onBack} />}
    </motion.div>
  );
}

// ============ Trades tab ============

function TradesTab({ group, trades }: { group: GroupSummary; trades: GroupTrade[] }) {
  const [open, setOpen] = useState<GroupTrade | null>(null);

  return (
    <div className="mt-6 space-y-3">
      {trades.length === 0 ? (
        <div className="glow-card rounded-2xl p-10 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h3 className="mt-3 text-base font-semibold">No shared trades yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Toggle “Share with Community” when logging a trade to show it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {trades.map((t) => (
            <TradeCard key={t.id} trade={t} onOpen={() => setOpen(t)} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && <TradeDetail trade={open} groupId={group.id} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
}

function TradeCard({ trade, onOpen }: { trade: GroupTrade; onOpen: () => void }) {
  const shot = trade.screenshots.find((s) => s.url)?.url ?? null;
  return (
    <button
      onClick={onOpen}
      className="glow-card group overflow-hidden rounded-2xl p-0 text-left transition hover:ring-white/[0.12]"
    >
      {shot ? (
        <div className="relative h-44 w-full overflow-hidden bg-black/40">
          <img src={shot} alt={trade.instrument} className="h-full w-full object-cover opacity-90 transition group-hover:scale-[1.02] group-hover:opacity-100" />
        </div>
      ) : (
        <div className="grid h-44 w-full place-items-center bg-white/[0.02] text-[11px] text-muted-foreground">
          No screenshot
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold">{trade.instrument}</div>
          <div className="flex gap-1.5">
            {trade.direction && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1",
                  trade.direction === "long"
                    ? "bg-success/15 text-success ring-success/25"
                    : "bg-destructive/15 text-destructive ring-destructive/25",
                )}
              >
                {trade.direction}
              </span>
            )}
            {trade.result && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1",
                  trade.result === "win"
                    ? "bg-success/15 text-success ring-success/25"
                    : trade.result === "loss"
                      ? "bg-destructive/15 text-destructive ring-destructive/25"
                      : "bg-info/15 text-info ring-info/25",
                )}
              >
                {trade.result === "breakeven" ? "BE" : trade.result}
              </span>
            )}
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-[12px] text-muted-foreground">
          {trade.reasoning || "No reasoning provided."}
        </p>
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-mono">{trade.trader_edge_id}</span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> {trade.comment_count}
          </span>
        </div>
      </div>
    </button>
  );
}

function TradeDetail({
  trade,
  groupId,
  onClose,
}: {
  trade: GroupTrade;
  groupId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: () => profileFn() });
  const myId = profile?.id;

  const commentsFn = useServerFn(listTradeComments);
  const { data: comments = [] } = useQuery({
    queryKey: ["trade-comments", trade.id, groupId],
    queryFn: () => commentsFn({ data: { tradeId: trade.id, groupId } }),
  });

  const addFn = useServerFn(addComment);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          tradeId: trade.id,
          groupId,
          parentId: replyTo,
          body: body.trim(),
        },
      }),
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["trade-comments", trade.id, groupId] });
      qc.invalidateQueries({ queryKey: ["group-trades", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Build threaded structure
  const roots = useMemo(() => comments.filter((c) => !c.parent_id), [comments]);
  const childrenMap = useMemo(() => {
    const m = new Map<string, TradeComment[]>();
    for (const c of comments) {
      if (c.parent_id) {
        if (!m.has(c.parent_id)) m.set(c.parent_id, []);
        m.get(c.parent_id)!.push(c);
      }
    }
    return m;
  }, [comments]);

  return (
    <ModalShell onClose={onClose} title={trade.instrument} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-mono text-foreground/80">{trade.trader_edge_id}</span>
            <span>·</span>
            <span>{new Date(trade.trade_date).toLocaleDateString()}</span>
          </div>
          <div className="flex gap-1.5">
            {trade.direction && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                  trade.direction === "long"
                    ? "bg-success/15 text-success ring-success/25"
                    : "bg-destructive/15 text-destructive ring-destructive/25",
                )}
              >
                {trade.direction}
              </span>
            )}
            {trade.result && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                  trade.result === "win"
                    ? "bg-success/15 text-success ring-success/25"
                    : trade.result === "loss"
                      ? "bg-destructive/15 text-destructive ring-destructive/25"
                      : "bg-info/15 text-info ring-info/25",
                )}
              >
                {trade.result === "breakeven" ? "BE" : trade.result}
              </span>
            )}
          </div>
        </div>

        {trade.screenshots.filter((s) => s.url).length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {trade.screenshots
              .filter((s) => s.url)
              .map((s) => (
                <img
                  key={s.id}
                  src={s.url!}
                  alt={trade.instrument}
                  className="w-full rounded-xl ring-1 ring-white/[0.06]"
                />
              ))}
          </div>
        )}

        {trade.reasoning && (
          <div className="rounded-xl bg-white/[0.025] p-4 text-sm leading-relaxed ring-1 ring-white/[0.04]">
            {trade.reasoning}
          </div>
        )}

        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Comments
          </h4>
          <div className="mt-3 space-y-3">
            {roots.length === 0 && (
              <p className="text-sm text-muted-foreground">No comments yet. Start the review.</p>
            )}
            {roots.map((c) => (
              <CommentNode
                key={c.id}
                comment={c}
                replies={childrenMap.get(c.id) ?? []}
                myId={myId ?? ""}
                onReply={(id) => setReplyTo(id)}
                groupId={groupId}
                tradeId={trade.id}
              />
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) add.mutate();
            }}
            className="mt-4 flex items-start gap-2"
          >
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
              rows={2}
              maxLength={4000}
              className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex flex-col gap-2">
              {replyTo && (
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[10px] text-muted-foreground"
                >
                  Cancel reply
                </button>
              )}
              <button
                type="submit"
                disabled={!body.trim() || add.isPending}
                className="rounded-xl bg-primary px-3 py-2.5 text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalShell>
  );
}

function CommentNode({
  comment,
  replies,
  myId,
  onReply,
  groupId,
  tradeId,
}: {
  comment: TradeComment;
  replies: TradeComment[];
  myId: string;
  onReply: (id: string) => void;
  groupId: string;
  tradeId: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  const updateFn = useServerFn(updateComment);
  const deleteFn = useServerFn(deleteComment);
  const update = useMutation({
    mutationFn: () => updateFn({ data: { id: comment.id, body: draft.trim() } }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["trade-comments", tradeId, groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id: comment.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trade-comments", tradeId, groupId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const isMine = myId === comment.user_id;

  return (
    <div className="rounded-xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.04]">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div>
          <span className="font-mono text-foreground/80">{comment.author_edge_id}</span>
          <span className="ml-2">{new Date(comment.created_at).toLocaleString()}</span>
          {comment.updated_at !== comment.created_at && <span className="ml-1 italic">· edited</span>}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onReply(comment.id)}
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground"
          >
            Reply
          </button>
          {isMine && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground"
              >
                Edit
              </button>
              <button
                onClick={() => del.mutate()}
                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-destructive"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="rounded-lg bg-white/[0.04] px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setEditing(false); setDraft(comment.body); }}
              className="rounded-lg bg-white/[0.04] px-3 py-1 text-[11px] text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => update.mutate()}
              disabled={!draft.trim() || update.isPending}
              className="rounded-lg bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
      )}

      {replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l border-white/[0.06] pl-3">
          {replies.map((r) => (
            <div key={r.id} className="rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <div>
                  <span className="font-mono text-foreground/80">{r.author_edge_id}</span>
                  <span className="ml-2">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                {myId === r.user_id && (
                  <button
                    onClick={() => {
                      const fn = async () => {
                        await (await import("@/lib/groups.functions")).deleteComment({ data: { id: r.id } });
                        qc.invalidateQueries({ queryKey: ["trade-comments", tradeId, groupId] });
                      };
                      fn();
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-destructive"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{r.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Members tab ============

function MembersTab({
  group,
  members,
}: {
  group: GroupSummary;
  members: { user_id: string; edge_id: string; display_name: string | null; username: string; role: "owner" | "member" }[];
}) {
  const qc = useQueryClient();
  const isOwner = group.role === "owner";

  const [edgeId, setEdgeId] = useState("");
  const inviteFn = useServerFn(inviteByEdgeId);
  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { groupId: group.id, edgeId: edgeId.trim() } }),
    onSuccess: () => {
      toast.success("Invitation sent");
      setEdgeId("");
      qc.invalidateQueries({ queryKey: ["group-pending-invites", group.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingFn = useServerFn(listGroupPendingInvites);
  const { data: pending = [] } = useQuery({
    queryKey: ["group-pending-invites", group.id],
    queryFn: () => pendingFn({ data: { groupId: group.id } }),
    enabled: isOwner,
  });

  const cancelFn = useServerFn(cancelInvitation);
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-pending-invites", group.id] }),
  });

  const removeFn = useServerFn(removeMember);
  const remove = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { groupId: group.id, userId } }),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["group-members", group.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-6 space-y-6">
      {isOwner && (
        <div className="glow-card rounded-2xl p-5">
          <h3 className="text-sm font-semibold">Invite a trader</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter their EdgeScope ID (e.g. <span className="font-mono">EDGE-8F42A1</span>).
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (edgeId.trim()) invite.mutate(); }}
            className="mt-3 flex gap-2"
          >
            <input
              value={edgeId}
              onChange={(e) => setEdgeId(e.target.value.toUpperCase())}
              placeholder="EDGE-XXXXXX"
              className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 font-mono text-sm tracking-wider ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={!edgeId.trim() || invite.isPending}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
            >
              {invite.isPending ? "Sending…" : "Invite"}
            </button>
          </form>

          {pending.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Pending invitations
              </div>
              <div className="mt-2 space-y-1.5">
                {pending.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/[0.025] px-3 py-2 text-sm ring-1 ring-white/[0.04]">
                    <div>
                      <span className="font-mono text-foreground/80">{p.invitee_edge_id}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{p.invitee_display}</span>
                    </div>
                    <button
                      onClick={() => cancel.mutate(p.id)}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" /> Members
        </h3>
        <div className="mt-3 space-y-1.5">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between rounded-lg bg-white/[0.025] px-3.5 py-2.5 ring-1 ring-white/[0.04]"
            >
              <div>
                <div className="text-sm font-semibold">{m.display_name || m.username}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{m.edge_id}</div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1",
                    m.role === "owner"
                      ? "bg-primary/15 text-primary ring-primary/25"
                      : "bg-white/[0.04] text-muted-foreground ring-white/[0.08]",
                  )}
                >
                  {m.role}
                </span>
                {isOwner && m.role !== "owner" && (
                  <button
                    onClick={() => remove.mutate(m.user_id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove member"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ Settings tab ============

function SettingsTab({ group, onDeleted }: { group: GroupSummary; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isOwner = group.role === "owner";

  const renameFn = useServerFn(renameGroup);
  const rename = useMutation({
    mutationFn: () => renameFn({ data: { id: group.id, name: name.trim() } }),
    onSuccess: () => {
      toast.success("Group renamed");
      qc.invalidateQueries({ queryKey: ["my-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deleteGroup);
  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id: group.id } }),
    onSuccess: () => {
      toast.success("Group deleted");
      qc.invalidateQueries({ queryKey: ["my-groups"] });
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner) {
    return (
      <div className="mt-6 glow-card rounded-2xl p-6 text-sm text-muted-foreground">
        Only the group owner can manage settings.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <SettingsIcon className="h-4 w-4 text-primary" /> Group name
        </h3>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={() => rename.mutate()}
            disabled={!name.trim() || name.trim() === group.name || rename.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Save
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-destructive/[0.04] p-5 ring-1 ring-destructive/20">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <Trash2 className="h-4 w-4" /> Danger zone
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Deleting a group removes all its members, invitations, and comments permanently.
        </p>
        <button
          onClick={() => setConfirmDelete(true)}
          className="mt-3 rounded-xl bg-destructive/15 px-4 py-2 text-sm font-semibold text-destructive ring-1 ring-destructive/30 hover:bg-destructive/20"
        >
          Delete group
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${group.name}"?`}
        description="This cannot be undone."
        confirmLabel="Delete group"
        destructive
        onConfirm={() => { setConfirmDelete(false); del.mutate(); }}
      />
    </div>
  );
}

// ============ Shell ============

function ModalShell({
  children,
  onClose,
  title,
  wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className={cn(
          "glow-card max-h-[90vh] w-full overflow-y-auto rounded-2xl p-6",
          wide ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </motion.div>
    </motion.div>
  );
}

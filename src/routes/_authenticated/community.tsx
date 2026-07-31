import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  PencilLine,
  Plus,
  Search,
  Trash2,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelInvitation,
  createGroup,
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
  listTradeReactions,
  markNotificationsRead,
  removeMember,
  renameGroup,
  respondInvitation,
  upsertReaction,
  deleteReaction,
  type GroupSummary,
  type GroupTrade,
  type TradeReaction,
} from "@/lib/groups.functions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";

const MOTION_EASE = [0.16, 1, 0.3, 1] as const;
const MODAL_TRANSITION = { duration: 0.22, ease: MOTION_EASE };

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

function roleLabel(role: "owner" | "member") {
  return role === "owner" ? "Admin" : "Member";
}

function normalizeGroupName(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function CommunityPage() {
  const [activeGroup, setActiveGroup] = useState<GroupSummary | null>(null);

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        eyebrow="Review circles"
        title="Community"
        description="Review trades with a trusted circle. Your journal stays private by default."
      />
      <Header />
      {activeGroup ? (
        <GroupDetail group={activeGroup} onBack={() => setActiveGroup(null)} />
      ) : (
        <GroupsList onOpen={setActiveGroup} />
      )}
    </PageShell>
  );
}

// ============ Header (Edge ID + notifications + invitations) ============

function Header() {
  const [showNotifs, setShowNotifs] = useState(false);

  const notifFn = useServerFn(listNotifications);
  const { data: notifications = [] } = useQuery({
    queryKey: ["community-notifications"],
    queryFn: () => notifFn(),
    refetchInterval: 30_000,
  });
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="ml-auto flex items-center gap-3">
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
    mutationFn: (vars: { id: string; accept: boolean }) => respondFn({ data: vars }),
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
                  from <span className="font-mono text-foreground/80">{i.inviter_edge_id}</span> ·{" "}
                  {i.inviter_display}
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
        initial={{ scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 8 }}
        transition={MODAL_TRANSITION}
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

function NotificationText({
  n,
}: {
  n: { type: string; payload: Record<string, string | number | boolean | null> };
}) {
  const p = n.payload;
  switch (n.type) {
    case "invite_received":
      return (
        <>
          You were invited to <b>{String(p.group_name ?? "a group")}</b>.
        </>
      );
    case "invite_accepted":
      return (
        <>
          <span className="font-mono">{String(p.invitee_edge_id ?? "")}</span> joined your group.
        </>
      );
    case "trade_shared":
      return (
        <>
          <span className="font-mono">{String(p.trader_edge_id ?? "")}</span> shared a trade on{" "}
          <b>{String(p.instrument ?? "")}</b>.
        </>
      );
    case "comment_added":
      return (
        <>
          <span className="font-mono">{String(p.author_edge_id ?? "")}</span> commented on your{" "}
          <b>{String(p.instrument ?? "")}</b> trade.
        </>
      );
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
  const tradesFn = useServerFn(listGroupTrades);
  const groupIds = useMemo(() => groups.map((g) => g.id).join("|"), [groups]);
  const { data: sharedTradeCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["group-shared-trade-counts", groupIds],
    enabled: groups.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        groups.map(async (g) => {
          const trades = await tradesFn({ data: { groupId: g.id } });
          return [g.id, trades.length] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const duplicateName = useMemo(() => {
    const nextName = normalizeGroupName(name);
    return nextName ? groups.some((group) => normalizeGroupName(group.name) === nextName) : false;
  }, [groups, name]);
  const createFn = useServerFn(createGroup);
  const create = useMutation({
    mutationFn: () => {
      if (duplicateName) throw new Error("You already have a group with this name.");
      return createFn({ data: { name: name.trim() } });
    },
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
      transition={{ duration: 0.22, ease: MOTION_EASE }}
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
        <PremiumEmptyState
          icon={Users}
          title="No groups yet"
          description="Create a private review circle, then invite traders by their EdgeScope ID."
          className="mt-6"
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => onOpen(g)}
              className="glow-card flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition hover:ring-white/[0.12]"
            >
              <div className="flex w-full items-center justify-between">
                <div className="min-w-0 truncate text-lg font-bold tracking-tight">{g.name}</div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1",
                    g.role === "owner"
                      ? "bg-primary/15 text-primary ring-primary/25"
                      : "bg-white/[0.04] text-muted-foreground ring-white/[0.08]",
                  )}
                >
                  {roleLabel(g.role)}
                </span>
              </div>
              <div className="w-full space-y-1 border-t border-white/[0.05] pt-3 text-xs text-muted-foreground">
                <div>
                  Shared trades <span className="text-muted-foreground/45">&mdash;</span>{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {sharedTradeCounts[g.id] ?? 0}
                  </span>
                </div>
                <div>
                  Members <span className="text-muted-foreground/45">&mdash;</span>{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {g.member_count}
                  </span>
                </div>
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
                if (duplicateName) {
                  toast.error("You already have a group with this name.");
                  return;
                }
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
                  maxLength={60}
                  className={cn(
                    "mt-1.5 w-full rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm ring-1 focus:outline-none focus:ring-2",
                    duplicateName
                      ? "ring-destructive/25 focus:ring-destructive/30"
                      : "ring-white/[0.06] focus:ring-primary/40",
                  )}
                />
                {duplicateName && (
                  <p className="mt-1.5 text-[11px] text-destructive/85">
                    You already have a group with this name.
                  </p>
                )}
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
                  disabled={!name.trim() || duplicateName || create.isPending}
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
      transition={MODAL_TRANSITION}
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
        </div>
        <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          {(["trades", "members", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition",
                tab === t
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "trades" ? "Shared Trades" : t}
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

// ============ Date / week / month helpers ============

function startOfWeekISO(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

function weekKey(d: Date): string {
  const start = startOfWeekISO(d);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function labelWeekRange(key: string): string {
  const start = new Date(key + "T00:00:00");
  const end = addDays(start, 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = sameYear ? fmt(start) : fmt(start);
  const endLabel = sameYear
    ? end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

function cleanMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function parseDateKey(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(value: string): string {
  const date = parseDateKey(value);
  return date
    ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "Select date";
}

type DateFilterMode = "all" | "date" | "week" | "month";

function generateWeekKeysFromTrades(trades: GroupTrade[]): string[] {
  const set = new Set<string>();
  for (const t of trades) {
    const d = new Date(t.trade_date + "T00:00:00");
    if (!isNaN(d.getTime())) set.add(weekKey(d));
  }
  const now = new Date();
  set.add(weekKey(now));
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function generateMonthKeysFromTrades(trades: GroupTrade[]): string[] {
  const set = new Set<string>();
  for (const t of trades) {
    const d = new Date(t.trade_date + "T00:00:00");
    if (!isNaN(d.getTime())) set.add(ymKey(d));
  }
  const now = new Date();
  set.add(ymKey(now));
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function PeriodPickerList({
  items,
  labelFor,
  selected,
  onSelect,
  onClose,
}: {
  items: string[];
  labelFor: (key: string) => string;
  selected: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(5);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((key) => `${labelFor(key)} ${key}`.toLowerCase().includes(q));
  }, [items, labelFor, query]);
  const visible = filtered.slice(0, visibleCount);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 8 }}
        transition={MODAL_TRANSITION}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="glow-card w-full max-w-md rounded-2xl p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Select period</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(5);
            }}
            placeholder="Search range"
            className="w-full rounded-xl bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 ring-1 ring-white/[0.06] transition focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {visible.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onSelect(key);
                onClose();
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left text-sm ring-1 transition",
                selected === key
                  ? "bg-primary/12 text-foreground ring-primary/35"
                  : "bg-white/[0.025] text-muted-foreground ring-white/[0.05] hover:bg-white/[0.045] hover:text-foreground",
              )}
            >
              <span>{labelFor(key)}</span>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-opacity duration-150",
                  selected === key ? "opacity-100" : "opacity-0",
                )}
                aria-hidden={selected !== key}
              >
                Selected
              </span>
            </button>
          ))}
          {visible.length === 0 && (
            <div className="rounded-xl bg-white/[0.025] px-3.5 py-6 text-center text-sm text-muted-foreground ring-1 ring-white/[0.05]">
              No periods found.
            </div>
          )}
        </div>
        {visibleCount < filtered.length && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 5)}
            className="mt-4 w-full rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition hover:text-foreground"
          >
            Show more
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

// ============ Trades tab ============

function TradesTab({ group, trades }: { group: GroupSummary; trades: GroupTrade[] }) {
  const [open, setOpen] = useState<GroupTrade | null>(null);
  const [limit, setLimit] = useState(6);
  const [filterMode, setFilterMode] = useState<DateFilterMode>("all");
  const [customDate, setCustomDate] = useState("");
  const [customWeekKey, setCustomWeekKey] = useState("");
  const [customMonthKey, setCustomMonthKey] = useState("");
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const weekKeys = useMemo(() => generateWeekKeysFromTrades(trades), [trades]);
  const monthKeys = useMemo(() => generateMonthKeysFromTrades(trades), [trades]);

  const { minYear, maxYear } = useMemo(() => {
    let min = Infinity,
      max = -Infinity;
    for (const t of trades) {
      const y = new Date(t.trade_date + "T00:00:00").getFullYear();
      if (y < min) min = y;
      if (y > max) max = y;
    }
    return trades.length > 0
      ? { minYear: min, maxYear: max }
      : { minYear: 2024, maxYear: new Date().getFullYear() + 1 };
  }, [trades]);

  const filteredTrades = useMemo(() => {
    if (filterMode === "all") return trades;
    if (filterMode === "date" && customDate) {
      return trades.filter((t) => t.trade_date === customDate);
    }
    if (filterMode === "week" && customWeekKey) {
      const start = new Date(customWeekKey + "T00:00:00");
      const end = addDays(start, 6);
      const endStr = formatDateKey(end);
      return trades.filter((t) => t.trade_date >= customWeekKey && t.trade_date <= endStr);
    }
    if (filterMode === "month" && customMonthKey) {
      return trades.filter((t) => t.trade_date.startsWith(customMonthKey));
    }
    return trades;
  }, [trades, filterMode, customDate, customWeekKey, customMonthKey]);

  const filterLabel = useMemo(() => {
    if (filterMode === "all") return "";
    if (filterMode === "date") return displayDate(customDate);
    if (filterMode === "week") return labelWeekRange(customWeekKey);
    if (filterMode === "month") return cleanMonthLabel(customMonthKey);
    return "";
  }, [filterMode, customDate, customWeekKey, customMonthKey]);

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const toggleFilter = (mode: DateFilterMode) => {
    if (filterMode === mode && mode === "all") return;
    setFilterMode(mode);
    setLimit(6);
    if (mode === "date") setDatePickerOpen(true);
    if (mode === "week") setWeekPickerOpen(true);
    if (mode === "month") setMonthPickerOpen(true);
    if (mode === "all") {
      setCustomDate("");
      setCustomWeekKey("");
      setCustomMonthKey("");
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {trades.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.04] pb-3">
          <div className="text-xs font-semibold text-muted-foreground">
            {filteredTrades.length} {filteredTrades.length === 1 ? "trade" : "trades"} shared
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-white/[0.02] p-1 ring-1 ring-white/[0.05]">
              {(
                [
                  { v: "all", l: "All" },
                  { v: "date", l: "Date" },
                  { v: "week", l: "Week" },
                  { v: "month", l: "Month" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => toggleFilter(opt.v)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition",
                    filterMode === opt.v
                      ? "bg-white/[0.06] text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            {filterMode !== "all" && filterLabel && (
              <button
                onClick={() => {
                  if (filterMode === "date") setDatePickerOpen(true);
                  if (filterMode === "week") setWeekPickerOpen(true);
                  if (filterMode === "month") setMonthPickerOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary ring-1 ring-primary/20 hover:bg-primary/15"
              >
                {filterLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {filteredTrades.length === 0 ? (
        <div className="glow-card rounded-2xl p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/78" />
          <h3 className="mt-3 text-base font-semibold">
            {trades.length === 0 ? "No shared trades yet." : "No trades match the filter."}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {trades.length === 0
              ? "When you share a trade, selected group members see its LTF screenshot when available, instrument, result, date, and available reasoning."
              : "Try switching back to All or choosing a different filter option."}
          </p>
          {trades.length === 0 && (
            <p className="mt-1 text-sm text-muted-foreground">Your full journal stays private.</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredTrades.slice(0, limit).map((t) => (
              <TradeCard key={t.id} trade={t} onOpen={() => setOpen(t)} />
            ))}
          </div>
          {filteredTrades.length > limit && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + 4)}
                className="rounded-xl bg-white/[0.04] px-4 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground transition duration-200"
              >
                Show more shared trades
              </button>
            </div>
          )}
        </>
      )}

      {/* Date picker popover */}
      <AnimatePresence>
        {datePickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDatePickerOpen(false)}
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.98, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: 8 }}
              transition={MODAL_TRANSITION}
              onClick={(e: MouseEvent) => e.stopPropagation()}
              className="glow-card w-auto rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold">Select date</h3>
                <button
                  onClick={() => setDatePickerOpen(false)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-white/[0.06]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Calendar
                mode="single"
                showOutsideDays={false}
                selected={parseDateKey(customDate)}
                onSelect={(date) => {
                  if (date) {
                    setCustomDate(formatDateKey(date));
                    setDatePickerOpen(false);
                  }
                }}
                captionLayout="dropdown"
                fromYear={minYear}
                toYear={maxYear}
                className="[--cell-size:1.9rem]"
              />
            </motion.div>
          </motion.div>
        )}
        {weekPickerOpen && (
          <PeriodPickerList
            items={weekKeys}
            labelFor={labelWeekRange}
            selected={customWeekKey}
            onSelect={(key) => {
              setCustomWeekKey(key);
              setWeekPickerOpen(false);
            }}
            onClose={() => setWeekPickerOpen(false)}
          />
        )}
        {monthPickerOpen && (
          <PeriodPickerList
            items={monthKeys}
            labelFor={cleanMonthLabel}
            selected={customMonthKey}
            onSelect={(key) => {
              setCustomMonthKey(key);
              setMonthPickerOpen(false);
            }}
            onClose={() => setMonthPickerOpen(false)}
          />
        )}
      </AnimatePresence>

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
        <div className="relative aspect-[2/1] w-full overflow-hidden bg-black/60">
          <img
            src={shot}
            alt={trade.instrument}
            className="h-full w-full object-contain opacity-90 transition group-hover:opacity-100"
          />
        </div>
      ) : (
        <div className="grid aspect-[2/1] w-full place-items-center bg-white/[0.02] text-[11px] text-muted-foreground">
          No screenshot
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-sm">{trade.instrument}</div>
          <div className="flex gap-1.5">
            {trade.result && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1",
                  trade.result === "win"
                    ? "bg-success/15 text-success ring-success/25"
                    : trade.result === "loss"
                      ? "bg-destructive/[0.055] text-destructive/80 ring-destructive/[0.12]"
                      : "bg-info/15 text-info ring-info/25",
                )}
              >
                {trade.result === "breakeven" ? "BE" : trade.result}
              </span>
            )}
          </div>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[12px] text-muted-foreground">
          {trade.reasoning || "No reasoning shared."}
        </p>
        <div className="mt-2 text-[10px] text-muted-foreground/80">
          {new Date(trade.trade_date).toLocaleDateString()}
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

  const reactionsFn = useServerFn(listTradeReactions);
  const { data: reactions = [], isFetched } = useQuery<TradeReaction[]>({
    queryKey: ["trade-reactions", trade.id, groupId],
    queryFn: () => reactionsFn({ data: { tradeId: trade.id, groupId } }),
  });

  const [localType, setLocalType] = useState<string | null>(null);
  const [localCounts, setLocalCounts] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const initRef = useRef(false);
  const rollbackRef = useRef<{ type: string | null; counts: Record<string, number> }>({
    type: null,
    counts: {},
  });

  // Reset init flag when modal opens a different trade
  useEffect(() => {
    initRef.current = false;
  }, [trade.id, groupId]);

  // Initialize local state from server data once when first fetch completes
  useEffect(() => {
    if (initRef.current) return;
    if (!isFetched) return;
    if (!myId) return;
    const my = reactions.find((r) => r.user_id === myId);
    setLocalType(my?.reaction_type ?? null);
    const m: Record<string, number> = {};
    for (const r of reactions) m[r.reaction_type] = (m[r.reaction_type] ?? 0) + 1;
    setLocalCounts(m);
    initRef.current = true;
  }, [isFetched, myId, reactions]);

  const REACTIONS = [
    { type: "reviewed", emoji: "👀", label: "Reviewed" },
    { type: "good_execution", emoji: "✅", label: "Good execution" },
    { type: "rule_break", emoji: "⚠️", label: "Rule break" },
    { type: "useful_note", emoji: "💡", label: "Useful note" },
    { type: "clean_setup", emoji: "🎯", label: "Clean setup" },
  ] as const;

  const upsertFn = useServerFn(upsertReaction);
  const deleteFn = useServerFn(deleteReaction);

  const reactMut = useMutation({
    mutationFn: (type: string) =>
      upsertFn({ data: { tradeId: trade.id, groupId, reactionType: type as any } }),
    onError: (e: Error) => {
      setLocalType(rollbackRef.current.type);
      setLocalCounts(rollbackRef.current.counts);
      toast.error(e.message);
    },
    onSettled: () => setSubmitting(false),
  });

  const unreactMut = useMutation({
    mutationFn: () => deleteFn({ data: { tradeId: trade.id, groupId } }),
    onError: (e: Error) => {
      setLocalType(rollbackRef.current.type);
      setLocalCounts(rollbackRef.current.counts);
      toast.error(e.message);
    },
    onSettled: () => setSubmitting(false),
  });

  function handleClick(type: string) {
    if (submitting) return;
    const next = localType === type ? null : type;

    rollbackRef.current = { type: localType, counts: { ...localCounts } };
    setLocalType(next);

    const newCounts = { ...localCounts };
    if (localType) {
      newCounts[localType] = Math.max(0, (newCounts[localType] ?? 0) - 1);
    }
    if (next) {
      newCounts[next] = (newCounts[next] ?? 0) + 1;
    }
    setLocalCounts(newCounts);
    setSubmitting(true);

    if (next === null) {
      unreactMut.mutate();
    } else {
      reactMut.mutate(type);
    }
  }

  return (
    <ModalShell onClose={onClose} title={trade.instrument} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            {new Date(trade.trade_date).toLocaleDateString()}
          </div>
          <div className="flex gap-1.5">
            {trade.result && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                  trade.result === "win"
                    ? "bg-success/15 text-success ring-success/25"
                    : trade.result === "loss"
                      ? "bg-destructive/[0.055] text-destructive/80 ring-destructive/[0.12]"
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
                <div
                  key={s.id}
                  className="flex items-center justify-center overflow-hidden rounded-xl bg-black/40"
                >
                  <img
                    src={s.url!}
                    alt={trade.instrument}
                    className="max-h-[55vh] w-full object-contain"
                  />
                </div>
              ))}
          </div>
        )}

        <div className="rounded-xl bg-white/[0.025] p-4 text-sm leading-relaxed ring-1 ring-white/[0.04] text-muted-foreground">
          {trade.reasoning ? (
            <span className="text-foreground">{trade.reasoning}</span>
          ) : (
            <span>No reasoning shared.</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {REACTIONS.map((r) => {
            const selected = localType === r.type;
            const count = localCounts[r.type] ?? 0;
            return (
              <button
                key={r.type}
                type="button"
                onClick={() => handleClick(r.type)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors duration-150",
                  selected
                    ? "border-purple-400/30 bg-purple-500/[0.07] text-purple-300/90"
                    : "border-transparent bg-white/[0.04] text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
                )}
              >
                <span className="text-base leading-none">{r.emoji}</span>
                <span className="text-xs font-medium">{r.label}</span>
                <span
                  className={cn(
                    "ml-0.5 min-w-3 text-right text-[11px] font-semibold tabular-nums text-muted-foreground/80 transition-opacity duration-150",
                    count > 0 ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden={count === 0}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}

// ============ Members tab ============

function MembersTab({
  group,
  members,
}: {
  group: GroupSummary;
  members: {
    user_id: string;
    edge_id: string;
    display_name: string | null;
    username: string;
    role: "owner" | "member";
  }[];
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
            onSubmit={(e) => {
              e.preventDefault();
              if (edgeId.trim()) invite.mutate();
            }}
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
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-white/[0.025] px-3 py-2 text-sm ring-1 ring-white/[0.04]"
                  >
                    <div>
                      <span className="font-mono text-foreground/80">{p.invitee_edge_id}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.invitee_display}
                      </span>
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
                  {roleLabel(m.role)}
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
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => profileFn(),
  });
  const groupsFn = useServerFn(listMyGroups);
  const { data: groups = [] } = useQuery({
    queryKey: ["my-groups"],
    queryFn: () => groupsFn(),
  });
  const duplicateName = useMemo(() => {
    const nextName = normalizeGroupName(name);
    return nextName
      ? groups.some((item) => item.id !== group.id && normalizeGroupName(item.name) === nextName)
      : false;
  }, [group.id, groups, name]);

  const copyEdgeId = () => {
    if (!profile?.edge_id) return;
    navigator.clipboard.writeText(profile.edge_id);
    toast.success("EdgeScope ID copied");
  };

  const renameFn = useServerFn(renameGroup);
  const rename = useMutation({
    mutationFn: () => {
      if (duplicateName) throw new Error("You already have a group with this name.");
      return renameFn({ data: { id: group.id, name: name.trim() } });
    },
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

  return (
    <div className="mt-6 space-y-4">
      {profile?.edge_id && (
        <div className="glow-card rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Your EdgeScope ID</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Share this ID with a group admin when they need to invite you.
              </p>
            </div>
            <button
              type="button"
              onClick={copyEdgeId}
              className="group inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs ring-1 ring-white/[0.06] transition hover:bg-white/[0.07]"
            >
              <span className="font-mono text-sm font-semibold">{profile.edge_id}</span>
              <Copy className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground" />
            </button>
          </div>
        </div>
      )}

      {!isOwner && (
        <div className="glow-card rounded-2xl p-6 text-sm text-muted-foreground">
          Only the group admin can manage settings.
        </div>
      )}

      {isOwner && (
        <>
          <div className="glow-card rounded-2xl p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <PencilLine className="h-4 w-4 text-primary" /> Group name
            </h3>
            <div className="mt-3 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className={cn(
                  "flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm ring-1 focus:outline-none focus:ring-2",
                  duplicateName
                    ? "ring-destructive/25 focus:ring-destructive/30"
                    : "ring-white/[0.06] focus:ring-primary/40",
                )}
              />
              <button
                onClick={() => {
                  if (duplicateName) {
                    toast.error("You already have a group with this name.");
                    return;
                  }
                  rename.mutate();
                }}
                disabled={
                  !name.trim() || duplicateName || name.trim() === group.name || rename.isPending
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Save
              </button>
            </div>
            {duplicateName && (
              <p className="mt-1.5 text-[11px] text-destructive/85">
                You already have a group with this name.
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-primary/[0.035] p-5 ring-1 ring-primary/10">
            <h3 className="text-sm font-semibold text-foreground">Group management</h3>
            <p className="mt-1 text-xs text-muted-foreground/75">
              Group deletion stays behind confirmation and cannot be undone.
            </p>
            <button
              onClick={() => setConfirmDelete(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-destructive/[0.04] px-3.5 py-2 text-xs font-semibold text-destructive/75 ring-1 ring-destructive/10 transition hover:bg-destructive/[0.065] hover:text-destructive/85 hover:ring-destructive/15"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete group
            </button>
          </div>

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete "${group.name}"?`}
            description="This cannot be undone."
            confirmLabel="Delete group"
            destructive
            onConfirm={() => {
              setConfirmDelete(false);
              del.mutate();
            }}
          />
        </>
      )}
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
        initial={{ scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 8 }}
        transition={MODAL_TRANSITION}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className={cn(
          "glow-card relative flex max-h-[90vh] w-full flex-col rounded-2xl p-6",
          wide ? "max-w-[90vw] md:max-w-[80vw] lg:max-w-[1100px]" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between shrink-0 mb-4 pb-2 border-b border-white/[0.04]">
          <h3 className="text-lg font-bold truncate pr-4">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">{children}</div>
      </motion.div>
    </motion.div>
  );
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeError } from "@/lib/server-errors";
import { checkRateLimitOrThrow } from "@/lib/rate-limiter";

// ============ Profile / Edge ID ============

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, edge_id, username, display_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw safeError(error);
    return data;
  });

// ============ Groups ============

export type GroupSummary = {
  id: string;
  name: string;
  owner_id: string;
  role: "owner" | "member";
  member_count: number;
  created_at: string;
};

export const listMyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GroupSummary[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships, error } = await supabaseAdmin
      .from("community_group_members")
      .select("group_id, role")
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    if (!memberships?.length) return [];
    const ids = memberships.map((m) => m.group_id);
    const [{ data: groups }, { data: counts }] = await Promise.all([
      supabaseAdmin.from("community_groups").select("id, name, owner_id, created_at").in("id", ids),
      supabaseAdmin.from("community_group_members").select("group_id").in("group_id", ids),
    ]);
    const countMap = new Map<string, number>();
    for (const r of counts ?? []) countMap.set(r.group_id, (countMap.get(r.group_id) ?? 0) + 1);
    const roleMap = new Map(memberships.map((m) => [m.group_id, m.role as "owner" | "member"]));
    return (groups ?? [])
      .map((g) => ({
        id: g.id,
        name: g.name,
        owner_id: g.owner_id,
        role: roleMap.get(g.id) ?? "member",
        member_count: countMap.get(g.id) ?? 0,
        created_at: g.created_at,
      }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("create-group", 10, 60_000);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: group, error } = await supabaseAdmin
      .from("community_groups")
      .insert({ name: data.name, owner_id: context.userId })
      .select()
      .single();
    if (error) throw safeError(error);
    const { error: mErr } = await supabaseAdmin
      .from("community_group_members")
      .insert({ group_id: group.id, user_id: context.userId, role: "owner" });
    if (mErr) throw safeError(mErr);
    return group;
  });

export const renameGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("community_groups")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("community_groups")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Owners cannot leave; they must delete the group instead.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: grp } = await supabaseAdmin
      .from("community_groups")
      .select("owner_id")
      .eq("id", data.groupId)
      .maybeSingle();
    if (grp?.owner_id === context.userId)
      throw new Error("Owners must delete the group instead of leaving");
    const { error } = await context.supabase
      .from("community_group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

// ============ Members ============

async function assertMember(supabaseAdmin: any, groupId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("community_group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Not a member of this group");
}

async function assertOwner(supabaseAdmin: any, groupId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("community_groups")
    .select("owner_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!data || data.owner_id !== userId) throw new Error("Only the group owner can do this");
}

export type GroupMember = {
  user_id: string;
  edge_id: string;
  username: string;
  display_name: string | null;
  role: "owner" | "member";
  joined_at: string;
};

export const listGroupMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<GroupMember[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.groupId, context.userId);
    const { data: members, error } = await supabaseAdmin
      .from("community_group_members")
      .select("user_id, role, joined_at")
      .eq("group_id", data.groupId);
    if (error) throw safeError(error);
    if (!members?.length) return [];
    const ids = members.map((m) => m.user_id);
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, edge_id, username, display_name")
      .in("id", ids);
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return members.map((m) => {
      const p = profMap.get(m.user_id);
      return {
        user_id: m.user_id,
        edge_id: p?.edge_id ?? "",
        username: p?.username ?? "",
        display_name: p?.display_name ?? null,
        role: m.role as "owner" | "member",
        joined_at: m.joined_at,
      };
    });
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ groupId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(supabaseAdmin, data.groupId, context.userId);
    if (data.userId === context.userId)
      throw new Error("Owner cannot be removed; delete the group instead");
    const { error } = await supabaseAdmin
      .from("community_group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("user_id", data.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

// ============ Invitations ============

export type IncomingInvitation = {
  id: string;
  group_id: string;
  group_name: string;
  inviter_edge_id: string;
  inviter_display: string;
  created_at: string;
};

export const inviteByEdgeId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ groupId: z.string().uuid(), edgeId: z.string().trim().min(4).max(32) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("invite-by-edge-id", 10, 60_000);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(supabaseAdmin, data.groupId, context.userId);

    const edge = data.edgeId.toUpperCase().replace(/\s+/g, "");
    const { data: invitee } = await supabaseAdmin
      .from("profiles")
      .select("id, edge_id")
      .eq("edge_id", edge)
      .maybeSingle();
    if (!invitee) throw new Error("No user found with that EdgeScope ID");
    if (invitee.id === context.userId) throw new Error("You cannot invite yourself");

    // Already a member?
    const { data: existing } = await supabaseAdmin
      .from("community_group_members")
      .select("user_id")
      .eq("group_id", data.groupId)
      .eq("user_id", invitee.id)
      .maybeSingle();
    if (existing) throw new Error("That trader is already in this group");

    // Existing pending invite?
    const { data: pending } = await supabaseAdmin
      .from("community_group_invitations")
      .select("id")
      .eq("group_id", data.groupId)
      .eq("invitee_id", invitee.id)
      .eq("status", "pending")
      .maybeSingle();
    if (pending) throw new Error("An invitation is already pending for that trader");

    const { data: inv, error: insErr } = await supabaseAdmin
      .from("community_group_invitations")
      .insert({ group_id: data.groupId, inviter_id: context.userId, invitee_id: invitee.id })
      .select()
      .single();
    if (insErr) throw safeError(insErr);

    // Notification
    const { data: grp } = await supabaseAdmin
      .from("community_groups")
      .select("name")
      .eq("id", data.groupId)
      .maybeSingle();
    await supabaseAdmin.from("community_notifications").insert({
      user_id: invitee.id,
      type: "invite_received",
      payload: { invitation_id: inv.id, group_id: data.groupId, group_name: grp?.name ?? "" },
    });

    return { ok: true };
  });

export const listMyInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IncomingInvitation[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invs, error } = await supabaseAdmin
      .from("community_group_invitations")
      .select("id, group_id, inviter_id, created_at")
      .eq("invitee_id", context.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw safeError(error);
    if (!invs?.length) return [];
    const groupIds = Array.from(new Set(invs.map((i) => i.group_id)));
    const inviterIds = Array.from(new Set(invs.map((i) => i.inviter_id)));
    const [{ data: groups }, { data: profs }] = await Promise.all([
      supabaseAdmin.from("community_groups").select("id, name").in("id", groupIds),
      supabaseAdmin
        .from("profiles")
        .select("id, edge_id, username, display_name")
        .in("id", inviterIds),
    ]);
    const gMap = new Map((groups ?? []).map((g) => [g.id, g.name]));
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return invs.map((i) => {
      const p = pMap.get(i.inviter_id);
      return {
        id: i.id,
        group_id: i.group_id,
        group_name: gMap.get(i.group_id) ?? "Group",
        inviter_edge_id: p?.edge_id ?? "",
        inviter_display: p?.display_name ?? p?.username ?? "Trader",
        created_at: i.created_at,
      };
    });
  });

export const listGroupPendingInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(supabaseAdmin, data.groupId, context.userId);
    const { data: invs, error } = await supabaseAdmin
      .from("community_group_invitations")
      .select("id, invitee_id, created_at")
      .eq("group_id", data.groupId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw safeError(error);
    if (!invs?.length) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, edge_id, username, display_name")
      .in(
        "id",
        invs.map((i) => i.invitee_id),
      );
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return invs.map((i) => {
      const p = pMap.get(i.invitee_id);
      return {
        id: i.id,
        invitee_edge_id: p?.edge_id ?? "",
        invitee_display: p?.display_name ?? p?.username ?? "Trader",
        created_at: i.created_at,
      };
    });
  });

export const respondInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin
      .from("community_group_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw safeError(error);
    if (!inv) throw new Error("Invitation not found");
    if (inv.invitee_id !== context.userId) throw new Error("Not your invitation");
    if (inv.status !== "pending") throw new Error("Invitation already responded to");

    const status = data.accept ? "accepted" : "declined";
    const { error: uErr } = await supabaseAdmin
      .from("community_group_invitations")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", data.id);
    if (uErr) throw safeError(uErr);

    if (data.accept) {
      await supabaseAdmin
        .from("community_group_members")
        .insert({ group_id: inv.group_id, user_id: context.userId, role: "member" });
      // notify inviter
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("edge_id, display_name, username")
        .eq("id", context.userId)
        .maybeSingle();
      await supabaseAdmin.from("community_notifications").insert({
        user_id: inv.inviter_id,
        type: "invite_accepted",
        payload: {
          group_id: inv.group_id,
          invitee_edge_id: prof?.edge_id ?? "",
          invitee_display: prof?.display_name ?? prof?.username ?? "Trader",
        },
      });
    }
    return { ok: true };
  });

export const cancelInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("community_group_invitations")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("inviter_id", context.userId)
      .eq("status", "pending");
    if (error) throw safeError(error);
    return { ok: true };
  });

// ============ Shared Trades ============

export type GroupTrade = {
  id: string;
  trade_date: string;
  instrument: string;
  direction: "long" | "short" | null;
  result: "win" | "loss" | "breakeven" | null;
  reasoning: string | null;
  user_id: string;
  trader_edge_id: string;
  trader_display: string;
  screenshots: { id: string; url: string | null }[];
  comment_count: number;
};

export const listGroupTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<GroupTrade[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.groupId, context.userId);

    const { data: memberRows } = await supabaseAdmin
      .from("community_group_members")
      .select("user_id")
      .eq("group_id", data.groupId);
    const memberIds = (memberRows ?? []).map((m) => m.user_id);
    if (!memberIds.length) return [];

    const { data: shares, error: shareErr } = await supabaseAdmin
      .from("community_trade_shares" as any)
      .select("trade_id")
      .eq("group_id", data.groupId);
    if (shareErr) throw safeError(shareErr);
    if (!shares?.length) return [];
    const sharedTradeIds = (shares as any[]).map((s) => s.trade_id);

    const { data: trades, error } = await supabaseAdmin
      .from("trades")
      .select("id, trade_date, instrument, direction, result, reasoning, user_id, created_at")
      .in("id", sharedTradeIds)
      .in("user_id", memberIds)
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw safeError(error);
    if (!trades?.length) return [];

    const tradeIds = trades.map((t) => t.id);
    const userIds = Array.from(new Set(trades.map((t) => t.user_id)));

    const [{ data: profs }, { data: shots }, { data: cmtCounts }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, edge_id, username, display_name")
        .in("id", userIds),
      supabaseAdmin
        .from("trade_screenshots")
        .select("id, trade_id, storage_path")
        .in("trade_id", tradeIds),
      supabaseAdmin
        .from("community_trade_comments")
        .select("trade_id")
        .eq("group_id", data.groupId)
        .in("trade_id", tradeIds),
    ]);

    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const signedByPath = new Map<string, string>();
    await Promise.all(
      (shots ?? []).map(async (s) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("trade-screenshots")
          .createSignedUrl(s.storage_path, 60 * 60);
        if (signed?.signedUrl) signedByPath.set(s.storage_path, signed.signedUrl);
      }),
    );
    const shotsByTrade = new Map<string, { id: string; storage_path: string }[]>();
    for (const s of shots ?? []) {
      if (!shotsByTrade.has(s.trade_id)) shotsByTrade.set(s.trade_id, []);
      shotsByTrade.get(s.trade_id)!.push({ id: s.id, storage_path: s.storage_path });
    }
    const cmtMap = new Map<string, number>();
    for (const c of cmtCounts ?? []) cmtMap.set(c.trade_id, (cmtMap.get(c.trade_id) ?? 0) + 1);

    return trades.map((t) => {
      const p = pMap.get(t.user_id);
      return {
        id: t.id,
        trade_date: t.trade_date,
        instrument: t.instrument,
        direction: (t.direction as "long" | "short" | null) ?? null,
        result: (t.result as "win" | "loss" | "breakeven" | null) ?? null,
        reasoning: t.reasoning ?? null,
        user_id: t.user_id,
        trader_edge_id: p?.edge_id ?? "",
        trader_display: p?.display_name ?? p?.username ?? "Trader",
        screenshots: (shotsByTrade.get(t.id) ?? []).map((s) => ({
          id: s.id,
          url: signedByPath.get(s.storage_path) ?? null,
        })),
        comment_count: cmtMap.get(t.id) ?? 0,
      };
    });
  });

// ============ Comments ============

export type TradeComment = {
  id: string;
  parent_id: string | null;
  body: string;
  user_id: string;
  author_edge_id: string;
  author_display: string;
  created_at: string;
  updated_at: string;
};

export const listTradeComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ tradeId: z.string().uuid(), groupId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<TradeComment[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.groupId, context.userId);
    const { data: cmts, error } = await supabaseAdmin
      .from("community_trade_comments")
      .select("id, parent_id, body, user_id, created_at, updated_at")
      .eq("trade_id", data.tradeId)
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw safeError(error);
    if (!cmts?.length) return [];
    const ids = Array.from(new Set(cmts.map((c) => c.user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, edge_id, username, display_name")
      .in("id", ids);
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return cmts.map((c) => {
      const p = pMap.get(c.user_id);
      return {
        id: c.id,
        parent_id: c.parent_id,
        body: c.body,
        user_id: c.user_id,
        author_edge_id: p?.edge_id ?? "",
        author_display: p?.display_name ?? p?.username ?? "Trader",
        created_at: c.created_at,
        updated_at: c.updated_at,
      };
    });
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tradeId: z.string().uuid(),
        groupId: z.string().uuid(),
        parentId: z.string().uuid().nullable().optional(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    checkRateLimitOrThrow("add-comment", 30, 60_000);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.groupId, context.userId);

    // Verify trade exists and is shared to this exact group via community_trade_shares
    const { data: shareExists } = await supabaseAdmin
      .from("community_trade_shares" as any)
      .select("id")
      .eq("trade_id", data.tradeId)
      .eq("group_id", data.groupId)
      .maybeSingle();
    if (!shareExists) {
      throw new Error("Trade is not shared with this group");
    }

    const { data: row, error } = await supabaseAdmin
      .from("community_trade_comments")
      .insert({
        trade_id: data.tradeId,
        group_id: data.groupId,
        user_id: context.userId,
        parent_id: data.parentId ?? null,
        body: data.body,
      })
      .select()
      .single();
    if (error) throw safeError(error);

    // Notify the trade owner if it's not the commenter
    const { data: trade } = await supabaseAdmin
      .from("trades")
      .select("user_id, instrument")
      .eq("id", data.tradeId)
      .maybeSingle();
    if (trade && trade.user_id !== context.userId) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("edge_id, display_name, username")
        .eq("id", context.userId)
        .maybeSingle();
      await supabaseAdmin.from("community_notifications").insert({
        user_id: trade.user_id,
        type: "comment_added",
        payload: {
          group_id: data.groupId,
          trade_id: data.tradeId,
          instrument: trade.instrument,
          author_edge_id: prof?.edge_id ?? "",
          author_display: prof?.display_name ?? prof?.username ?? "Trader",
        },
      });
    }
    return row;
  });

export const updateComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("community_trade_comments")
      .update({ body: data.body })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: comment, error } = await supabaseAdmin
      .from("community_trade_comments")
      .select("id, user_id, group_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw safeError(error);
    if (!comment) throw new Error("Comment not found");

    const { data: group } = await supabaseAdmin
      .from("community_groups")
      .select("owner_id")
      .eq("id", comment.group_id)
      .maybeSingle();

    const isAuthor = comment.user_id === context.userId;
    const isGroupOwner = group && group.owner_id === context.userId;

    if (!isAuthor && !isGroupOwner) {
      throw new Error("You are not authorized to delete this comment");
    }

    const { error: delErr } = await supabaseAdmin
      .from("community_trade_comments")
      .delete()
      .eq("id", data.id);
    if (delErr) throw safeError(delErr);
    return { ok: true };
  });

// ============ Notifications ============

export type Notification = {
  id: string;
  type: "invite_received" | "invite_accepted" | "trade_shared" | "comment_added";
  payload: Record<string, string | number | boolean | null>;
  read_at: string | null;
  created_at: string;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("community_notifications")
      .select("id, type, payload, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw safeError(error);
    return (data ?? []) as unknown as Notification[];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ ids: z.union([z.literal("all"), z.array(z.string().uuid())]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("community_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (data.ids !== "all") q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw safeError(error);
    return { ok: true };
  });

// ============ Trade Sharing ============

export const setTradeShared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tradeId: z.string().uuid(), shared: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: trade, error } = await supabaseAdmin
      .from("trades")
      .update({ is_shared: data.shared })
      .eq("id", data.tradeId)
      .eq("user_id", context.userId)
      .select("id, instrument")
      .maybeSingle();
    if (error) throw safeError(error);
    if (!trade) throw new Error("Trade not found");

    if (data.shared) {
      // Notify each group the user belongs to (excluding self).
      const { data: groups } = await supabaseAdmin
        .from("community_group_members")
        .select("group_id")
        .eq("user_id", context.userId);
      const groupIds = (groups ?? []).map((g) => g.group_id);
      if (groupIds.length) {
        const { data: others } = await supabaseAdmin
          .from("community_group_members")
          .select("user_id, group_id")
          .in("group_id", groupIds)
          .neq("user_id", context.userId);
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("edge_id, display_name, username")
          .eq("id", context.userId)
          .maybeSingle();
        const rows = (others ?? []).map((o) => ({
          user_id: o.user_id,
          type: "trade_shared" as const,
          payload: {
            group_id: o.group_id,
            trade_id: trade.id,
            instrument: trade.instrument,
            trader_edge_id: prof?.edge_id ?? "",
            trader_display: prof?.display_name ?? prof?.username ?? "Trader",
          },
        }));
        if (rows.length) await supabaseAdmin.from("community_notifications").insert(rows);
      }
    }
    return { ok: true };
  });

export const getTradeShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tradeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shares, error } = await supabaseAdmin
      .from("community_trade_shares" as any)
      .select("group_id")
      .eq("trade_id", data.tradeId)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return ((shares as any[]) ?? []).map((s) => s.group_id) as string[];
  });

export const shareTradeToGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tradeId: z.string().uuid(),
        groupIds: z.array(z.string().uuid()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify trade ownership
    const { data: trade } = await context.supabase
      .from("trades")
      .select("id, instrument, is_shared")
      .eq("id", data.tradeId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!trade) throw new Error("Trade not found");

    // Get current shares
    const { data: currentShares } = await supabaseAdmin
      .from("community_trade_shares" as any)
      .select("group_id")
      .eq("trade_id", data.tradeId)
      .eq("user_id", context.userId);
    const currentGroupIds = new Set(((currentShares as any[]) ?? []).map((s) => s.group_id));
    const nextGroupIds = new Set(data.groupIds);

    const toDelete = Array.from(currentGroupIds).filter((g) => !nextGroupIds.has(g));
    const toInsert = Array.from(nextGroupIds).filter((g) => !currentGroupIds.has(g));

    if (toDelete.length) {
      const { error: delErr } = await supabaseAdmin
        .from("community_trade_shares" as any)
        .delete()
        .eq("trade_id", data.tradeId)
        .eq("user_id", context.userId)
        .in("group_id", toDelete);
      if (delErr) throw safeError(delErr);
    }

    if (toInsert.length) {
      // Verify user is member of all groups in toInsert
      const { data: memberships } = await supabaseAdmin
        .from("community_group_members")
        .select("group_id")
        .eq("user_id", context.userId)
        .in("group_id", toInsert);
      const memberGroupIds = new Set((memberships ?? []).map((m) => m.group_id));
      const validInsert = toInsert.filter((g) => memberGroupIds.has(g));

      if (validInsert.length) {
        const insertRows = validInsert.map((g) => ({
          trade_id: data.tradeId,
          group_id: g,
          user_id: context.userId,
        }));
        const { error: insErr } = await supabaseAdmin
          .from("community_trade_shares" as any)
          .insert(insertRows);
        if (insErr) throw safeError(insErr);

        // Send notifications to group members
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("edge_id, display_name, username")
          .eq("id", context.userId)
          .maybeSingle();

        for (const gid of validInsert) {
          const { data: others } = await supabaseAdmin
            .from("community_group_members")
            .select("user_id")
            .eq("group_id", gid)
            .neq("user_id", context.userId);
          const notifyRows = (others ?? []).map((o) => ({
            user_id: o.user_id,
            type: "trade_shared" as const,
            payload: {
              group_id: gid,
              trade_id: data.tradeId,
              instrument: trade.instrument,
              trader_edge_id: prof?.edge_id ?? "",
              trader_display: prof?.display_name ?? prof?.username ?? "Trader",
            },
          }));
          if (notifyRows.length) {
            await supabaseAdmin.from("community_notifications").insert(notifyRows);
          }
        }
      }
    }

    // Update trades.is_shared flag for backwards compatibility/UI display
    const hasAnyShares = data.groupIds.length > 0;
    if (trade.is_shared !== hasAnyShares) {
      await supabaseAdmin.from("trades").update({ is_shared: hasAnyShares }).eq("id", data.tradeId);
    }

    return { ok: true };
  });

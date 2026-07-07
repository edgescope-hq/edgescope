import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw safeError(error);
  if (!data) throw new Error("Forbidden: admin only");
}

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const code = generateCode();
    const expires_at = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from("invites")
      .insert({ code, created_by: userId, expires_at })
      .select()
      .single();
    if (error) throw safeError(error);
    return data;
  });

export const listMyInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("invites")
      .select("*")
      .eq("created_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw safeError(error);
    return data;
  });

const validateSchema = z.object({ code: z.string().min(4).max(64) });

export const deleteInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("invites")
      .delete()
      .eq("id", data.id)
      .eq("created_by", context.userId)
      .is("used_at", null);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const setInviteDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), disabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("invites")
      .update({ disabled: data.disabled })
      .eq("id", data.id)
      .eq("created_by", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw safeError(error);
    return { admin: !!data };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersResp, error: uErr } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (uErr) throw safeError(uErr);

    const ids = usersResp.users.map((u) => u.id);
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, community_access, created_at")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    if (pErr) throw safeError(pErr);

    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return usersResp.users
      .map((u) => {
        const p = profMap.get(u.id);
        return {
          id: u.id,
          email: u.email ?? "",
          name: p?.display_name ?? p?.username ?? u.email?.split("@")[0] ?? "",
          join_date: u.created_at,
          profile_created_at: p?.created_at ?? null,
          community_access: !!p?.community_access,
        };
      })
      .sort((a, b) => (a.join_date < b.join_date ? 1 : -1));
  });

// Authenticated: redeem an invite to unlock Community access for the caller.
export const redeemInviteForCommunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(4).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("invites")
      .select("*")
      .eq("code", data.code.trim())
      .maybeSingle();
    if (error) throw safeError(error);
    const invalid = "Invalid or expired invite";
    if (!invite) throw new Error(invalid);
    if (invite.disabled) throw new Error(invalid);
    if (invite.used_at) throw new Error(invalid);
    if (new Date(invite.expires_at).getTime() < Date.now()) throw new Error(invalid);
    const { data: upRow, error: upErr } = await supabaseAdmin
      .from("invites")
      .update({ used_by: context.userId, used_at: new Date().toISOString() })
      .eq("id", invite.id)
      .is("used_at", null)
      .select()
      .maybeSingle();
    if (upErr) throw safeError(upErr);
    if (!upRow) throw new Error(invalid);
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ community_access: true })
      .eq("id", context.userId);
    if (profErr) throw safeError(profErr);
    return { ok: true };
  });

// Authenticated: validate an invite code WITHOUT mutating or revealing target.
// Used on the settings page to let auth'd users preview a code before redeeming it.
// Actual redemption happens via redeemInviteForCommunity.
export const validateInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => validateSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("invites")
      .select("id, disabled, used_at, expires_at")
      .eq("code", data.code.trim())
      .maybeSingle();
    if (error) throw safeError(error);
    if (!invite) return { valid: false as const };
    if (invite.disabled) return { valid: false as const };
    if (invite.used_at) return { valid: false as const };
    if (new Date(invite.expires_at).getTime() < Date.now()) return { valid: false as const };
    return { valid: true as const };
  });

import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, notification_preferences")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw safeError(error);
    const { data: userResp } = await context.supabase.auth.getUser();
    return data ? { ...data, email: userResp.user?.email ?? null } : null;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        username: z
          .string()
          .min(3)
          .max(32)
          .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only"),
        display_name: z.string().max(64).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ username: data.username, display_name: data.display_name ?? null })
      .eq("id", context.userId);
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken");
      throw safeError(error);
    }
    return { ok: true };
  });

export const updateNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        preferences: z.record(z.string().max(64), z.boolean()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ notification_preferences: data.preferences })
      .eq("id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

// Permanently deletes the signed-in user and all their data (cascades via FKs).
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Clean up storage files before deleting the user (DB rows cascade-delete but storage does not).
    const { data: shots } = await context.supabase
      .from("trade_screenshots")
      .select("storage_path")
      .eq("user_id", context.userId);
    if (shots?.length) {
      const paths = shots.map((s) => s.storage_path).filter(Boolean) as string[];
      if (paths.length) {
        await context.supabase.storage.from("trade-screenshots").remove(paths);
      }
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

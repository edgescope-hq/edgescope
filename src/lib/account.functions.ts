import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function isMissingIntroSeenColumn(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42703" && error.message?.toLowerCase().includes("profiles.has_seen_intro")
  );
}

function isMissingDeletionColumns(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42703" &&
    (message.includes("profiles.deletion_requested_at") ||
      message.includes("profiles.deletion_scheduled_for") ||
      message.includes("profiles.deletion_cancelled_at"))
  );
}

function isMissingProfileCompletedColumn(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42703" && error.message?.toLowerCase().includes("profiles.profile_completed")
  );
}

function deletionScheduledFor(from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + 15);
  return date.toISOString();
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profileWithIntro = await context.supabase
      .from("profiles")
      .select(
        "id, username, display_name, notification_preferences, has_seen_intro, deletion_requested_at, deletion_scheduled_for, deletion_cancelled_at, profile_completed",
      )
      .eq("id", context.userId)
      .maybeSingle();

    let data = profileWithIntro.data;
    let error = profileWithIntro.error;

    if (
      isMissingIntroSeenColumn(error) ||
      isMissingDeletionColumns(error) ||
      isMissingProfileCompletedColumn(error)
    ) {
      const profileWithoutIntro = await context.supabase
        .from("profiles")
        .select("id, username, display_name, notification_preferences")
        .eq("id", context.userId)
        .maybeSingle();

      data = profileWithoutIntro.data
        ? {
            ...profileWithoutIntro.data,
            has_seen_intro: true,
            deletion_requested_at: null,
            deletion_scheduled_for: null,
            deletion_cancelled_at: null,
            profile_completed: true,
          }
        : null;
      error = profileWithoutIntro.error;
    }

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
      .update({
        username: data.username,
        display_name: data.display_name ?? null,
        profile_completed: true,
      })
      .eq("id", context.userId);
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken");
      throw safeError(error);
    }
    return { ok: true };
  });

export const markIntroSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ has_seen_intro: true })
      .eq("id", context.userId);
    if (isMissingIntroSeenColumn(error)) return { ok: true };
    if (error) throw safeError(error);
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

export const scheduleAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const requestedAt = new Date().toISOString();
    const scheduledFor = deletionScheduledFor();
    const { error } = await context.supabase
      .from("profiles")
      .update({
        deletion_requested_at: requestedAt,
        deletion_scheduled_for: scheduledFor,
        deletion_cancelled_at: null,
      })
      .eq("id", context.userId);
    if (isMissingDeletionColumns(error)) {
      throw new Error("Account deletion scheduling requires the latest profile migration.");
    }
    if (error) throw safeError(error);
    return { ok: true, deletion_scheduled_for: scheduledFor };
  });

export const cancelAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        deletion_requested_at: null,
        deletion_scheduled_for: null,
        deletion_cancelled_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (isMissingDeletionColumns(error)) {
      throw new Error("Account deletion cancellation requires the latest profile migration.");
    }
    if (error) throw safeError(error);
    return { ok: true };
  });

// Immediate permanent deletion is intentionally disabled.
// Account deletion must use the scheduled 15-day grace-period flow.
export const deleteAccount = createServerFn({ method: "POST" }).handler(async () => {
  throw new Error(
    "Immediate account deletion is disabled. Use the scheduled account deletion flow instead.",
  );
});

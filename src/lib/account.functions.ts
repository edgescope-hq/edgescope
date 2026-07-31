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

function isMissingActivationGuideColumn(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42703" &&
    error.message?.toLowerCase().includes("profiles.activation_guide_completed_at")
  );
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profileWithIntro = await context.supabase
      .from("profiles")
      .select(
        "id, username, display_name, notification_preferences, has_seen_intro, deletion_requested_at, deletion_scheduled_for, deletion_cancelled_at, profile_completed, scope_discovery_seen_ids, activation_guide_completed_at",
      )
      .eq("id", context.userId)
      .maybeSingle();

    let data = profileWithIntro.data;
    let error = profileWithIntro.error;

    if (
      isMissingIntroSeenColumn(error) ||
      isMissingDeletionColumns(error) ||
      isMissingProfileCompletedColumn(error) ||
      isMissingActivationGuideColumn(error)
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
            scope_discovery_seen_ids: [],
            activation_guide_completed_at: null,
          }
        : null;
      error = profileWithoutIntro.error;
    }

    if (error) throw safeError(error);
    const { data: userResp } = await context.supabase.auth.getUser();
    const metadata = userResp.user?.user_metadata as
      | { full_name?: unknown; name?: unknown; display_name?: unknown }
      | undefined;
    const authDisplayName = [metadata?.full_name, metadata?.name, metadata?.display_name].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    return data
      ? {
          ...data,
          email: userResp.user?.email ?? null,
          auth_display_name: authDisplayName?.trim() ?? null,
        }
      : null;
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

export const markActivationGuideComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ activation_guide_completed_at: new Date().toISOString() })
      .eq("id", context.userId)
      .is("activation_guide_completed_at", null);
    if (isMissingActivationGuideColumn(error)) return { ok: true };
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

export const markScopeDiscoveriesSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ discoveryIds: z.array(z.string().min(1).max(180)).max(12) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile, error: selectError } = await context.supabase
      .from("profiles")
      .select("scope_discovery_seen_ids")
      .eq("id", context.userId)
      .maybeSingle();
    if (selectError) throw safeError(selectError);
    const next = Array.from(
      new Set([...(profile?.scope_discovery_seen_ids ?? []), ...data.discoveryIds]),
    );
    const { error } = await context.supabase
      .from("profiles")
      .update({ scope_discovery_seen_ids: next })
      .eq("id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const scheduleAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: scheduledFor, error } = await context.supabase.rpc("schedule_account_deletion");
    if (isMissingDeletionColumns(error) || error?.code === "PGRST202") {
      throw new Error("Account deletion scheduling requires the latest profile migration.");
    }
    if (error?.code === "55000") {
      throw new Error("Permanent account deletion is already in progress.");
    }
    if (error) throw safeError(error);
    if (!scheduledFor) throw new Error("Account deletion could not be scheduled.");
    return { ok: true, deletion_scheduled_for: scheduledFor };
  });

export const cancelAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("cancel_account_deletion");
    if (isMissingDeletionColumns(error) || error?.code === "PGRST202") {
      throw new Error("Account deletion cancellation requires the latest profile migration.");
    }
    if (error?.code === "55000") {
      throw new Error(
        "Permanent account deletion is already in progress and can no longer be cancelled.",
      );
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

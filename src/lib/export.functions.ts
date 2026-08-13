import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeError } from "@/lib/server-errors";

export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [
      trades,
      screenshots,
      accounts,
      accountGuardrails,
      preferences,
      profile,
      notebookEntries,
      legacyStickyNotes,
      categories,
      standards,
      standardVersions,
      improvementFocuses,
      improvementOccurrences,
    ] = await Promise.all([
      supabase
        .from("trades")
        .select("*")
        .eq("user_id", userId)
        .order("trade_date", { ascending: false }),
      supabase
        .from("trade_screenshots")
        .select("id, trade_id, kind, caption, annotations, created_at")
        .eq("user_id", userId),
      supabase.from("trading_accounts").select("*").eq("user_id", userId),
      supabase.from("account_guardrails").select("*").eq("user_id", userId),
      supabase.from("trading_preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select(
          "id, username, display_name, edge_id, notification_preferences, profile_completed, has_seen_intro, activation_guide_completed_at, scope_discovery_seen_ids, created_at, updated_at",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("notebook_entries")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      supabase.from("sticky_notes").select("*").eq("user_id", userId),
      supabase.from("trade_categories").select("*").eq("user_id", userId),
      supabase.from("playbook_standards").select("*").eq("user_id", userId),
      supabase
        .from("playbook_standard_versions")
        .select("*")
        .eq("user_id", userId)
        .order("effective_from", { ascending: false }),
      supabase
        .from("improvement_focuses")
        .select("*")
        .eq("user_id", userId)
        .order("activated_at", { ascending: false }),
      supabase
        .from("improvement_occurrences")
        .select("*")
        .eq("user_id", userId)
        .order("assessed_at", { ascending: false }),
    ]);

    const failed = [
      trades,
      screenshots,
      accounts,
      accountGuardrails,
      preferences,
      profile,
      notebookEntries,
      legacyStickyNotes,
      categories,
      standards,
      standardVersions,
      improvementFocuses,
      improvementOccurrences,
    ].find((result) => result.error);
    if (failed?.error) throw safeError(failed.error);

    return {
      export_format: "edgescope-core-data",
      schema_version: 2,
      exported_at: new Date().toISOString(),
      user_id: userId,
      exclusions: {
        screenshot_files:
          "Screenshot binaries are not embedded; metadata and annotations are included.",
        network_data: "Private groups, memberships, reactions, and other peer data are excluded.",
        service_data:
          "Authentication credentials, roles, and service-only deletion state are excluded.",
      },
      profile: profile.data ?? null,
      trades: trades.data ?? [],
      trade_screenshots: screenshots.data ?? [],
      trading_accounts: accounts.data ?? [],
      account_guardrails: accountGuardrails.data ?? [],
      trading_preferences: preferences.data ?? null,
      playbook: {
        ordinary_notes: notebookEntries.data ?? [],
        standards: standards.data ?? [],
        standard_versions: standardVersions.data ?? [],
      },
      trade_categories: categories.data ?? [],
      improvement: {
        focuses: improvementFocuses.data ?? [],
        occurrences: improvementOccurrences.data ?? [],
      },
      legacy_sticky_notes: legacyStickyNotes.data ?? [],
    };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeError } from "@/lib/server-errors";

export type PlaybookStandardVersion = {
  id: string;
  standard_id: string;
  user_id: string;
  version_number: number;
  title: string;
  content: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export type PlaybookStandard = {
  id: string;
  user_id: string;
  source_entry_id: string | null;
  title: string;
  status: "active" | "retired";
  created_at: string;
  updated_at: string;
  current_version: PlaybookStandardVersion | null;
  versions: PlaybookStandardVersion[];
};

export const listPlaybookStandards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: standards, error: standardsError }, { data: versions, error: versionsError }] =
      await Promise.all([
        context.supabase
          .from("playbook_standards")
          .select("*")
          .eq("user_id", context.userId)
          .order("updated_at", { ascending: false }),
        context.supabase
          .from("playbook_standard_versions")
          .select("*")
          .eq("user_id", context.userId)
          .order("version_number", { ascending: false }),
      ]);
    if (standardsError) throw safeError(standardsError);
    if (versionsError) throw safeError(versionsError);

    const allVersions = (versions ?? []) as PlaybookStandardVersion[];
    return (standards ?? []).map((standard) => {
      const standardVersions = allVersions.filter((version) => version.standard_id === standard.id);
      return {
        ...standard,
        current_version: standardVersions.find((version) => version.effective_to === null) ?? null,
        versions: standardVersions,
      } as PlaybookStandard;
    });
  });

export const adoptPlaybookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ entry_id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    const { data: entry, error: entryError } = await context.supabase
      .from("notebook_entries")
      .select("id, title, content, note_type")
      .eq("id", data.entry_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (entryError) throw safeError(entryError);
    if (!entry) throw new Error("Playbook note not found.");
    if (entry.note_type !== "setup") {
      throw new Error("Only a Setup note can be deliberately adopted as a current standard.");
    }
    const title = entry.title?.trim() || "Untitled setup";
    const now = new Date().toISOString();

    const { data: existing, error: existingError } = await context.supabase
      .from("playbook_standards")
      .select("*")
      .eq("user_id", context.userId)
      .eq("source_entry_id", entry.id)
      .maybeSingle();
    if (existingError) throw safeError(existingError);

    let standard = existing;
    let createdStandard = false;
    if (!standard) {
      const { data: inserted, error } = await context.supabase
        .from("playbook_standards")
        .insert({
          user_id: context.userId,
          source_entry_id: entry.id,
          title,
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw safeError(error);
      standard = inserted;
      createdStandard = true;
    }

    const { data: versions, error: versionError } = await context.supabase
      .from("playbook_standard_versions")
      .select("*")
      .eq("standard_id", standard.id)
      .eq("user_id", context.userId)
      .order("version_number", { ascending: false });
    if (versionError) throw safeError(versionError);
    const typedVersions = (versions ?? []) as PlaybookStandardVersion[];
    const current = typedVersions.find((version) => version.effective_to === null) ?? null;
    if (
      standard.status === "active" &&
      current &&
      current.title === title &&
      current.content === entry.content
    ) {
      return { standard, version: current, changed: false };
    }

    if (current) {
      const { error } = await context.supabase
        .from("playbook_standard_versions")
        .update({ effective_to: now })
        .eq("id", current.id)
        .eq("user_id", context.userId);
      if (error) throw safeError(error);
    }

    const versionNumber = (typedVersions[0]?.version_number ?? 0) + 1;
    const { data: version, error: insertError } = await context.supabase
      .from("playbook_standard_versions")
      .insert({
        standard_id: standard.id,
        user_id: context.userId,
        version_number: versionNumber,
        title,
        content: entry.content,
        effective_from: now,
      })
      .select("*")
      .single();
    if (insertError) {
      if (current) {
        await context.supabase
          .from("playbook_standard_versions")
          .update({ effective_to: null })
          .eq("id", current.id)
          .eq("user_id", context.userId);
      }
      throw safeError(insertError);
    }

    const { data: updatedStandard, error: standardError } = await context.supabase
      .from("playbook_standards")
      .update({ title, status: "active" })
      .eq("id", standard.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (standardError) {
      // The immutable version is still safely stored. Surface the partial state
      // truthfully rather than deleting historical evidence.
      throw new Error(
        createdStandard
          ? "The standard version was saved, but its current-status marker could not be confirmed. Retry adoption."
          : "The new standard version was saved, but reactivation could not be confirmed. Retry adoption.",
      );
    }

    return { standard: updatedStandard, version, changed: true };
  });

export const retirePlaybookStandard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ standard_id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: standard, error: fetchError } = await context.supabase
      .from("playbook_standards")
      .select("id, status")
      .eq("id", data.standard_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (fetchError) throw safeError(fetchError);
    if (!standard) throw new Error("Current standard not found.");
    if (standard.status === "retired") return { ok: true };

    const { error: closeError } = await context.supabase
      .from("playbook_standard_versions")
      .update({ effective_to: now })
      .eq("standard_id", standard.id)
      .eq("user_id", context.userId)
      .is("effective_to", null);
    if (closeError) throw safeError(closeError);

    const { error } = await context.supabase
      .from("playbook_standards")
      .update({ status: "retired" })
      .eq("id", standard.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

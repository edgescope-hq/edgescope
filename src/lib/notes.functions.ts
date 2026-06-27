import { safeError } from "@/lib/server-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const noteInput = z.object({
  title: z.string().max(200).nullable().optional(),
  content: z.string().max(20000).default(""),
  color: z.string().max(32).default("default"),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
  kind: z.string().max(32).nullable().optional(),
});

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sticky_notes")
      .select("*")
      .eq("user_id", context.userId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw safeError(error);
    return data;
  });

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => noteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sticky_notes")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), patch: noteInput.partial() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sticky_notes")
      .update(data.patch)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw safeError(error);
    return row;
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sticky_notes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

export const ensureMeditationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing } = await context.supabase
      .from("sticky_notes")
      .select("id")
      .eq("user_id", context.userId)
      .eq("kind", "meditation")
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };
    const { data: row, error } = await context.supabase
      .from("sticky_notes")
      .insert({
        user_id: context.userId,
        title: "Meditation",
        content: "Take a moment to breathe. Pick a duration and start a calm reset before your next trade.",
        color: "blue",
        pinned: true,
        archived: false,
        kind: "meditation",
      })
      .select("id")
      .single();
    if (error) throw safeError(error);
    return { id: row.id, created: true };
  });

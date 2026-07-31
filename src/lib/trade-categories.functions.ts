import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeError } from "@/lib/server-errors";

const categoryName = z.string().trim().min(1).max(64);
const normalize = (name: string) => name.trim().toLocaleLowerCase();

export const listTradeCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trade_categories")
      .select("id, name, normalized_name, archived_at, created_at")
      .eq("user_id", context.userId)
      .order("archived_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false });
    if (error) throw safeError(error);
    return data ?? [];
  });

export const createTradeCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => categoryName.parse(data))
  .handler(async ({ data: name, context }) => {
    const normalizedName = normalize(name);
    const { data: existing, error: existingError } = await context.supabase
      .from("trade_categories")
      .select("id, name, archived_at")
      .eq("user_id", context.userId)
      .eq("normalized_name", normalizedName)
      .maybeSingle();
    if (existingError) throw safeError(existingError);
    if (existing?.archived_at) {
      const { data, error } = await context.supabase
        .from("trade_categories")
        .update({ name, archived_at: null })
        .eq("id", existing.id)
        .eq("user_id", context.userId)
        .select("id, name, archived_at")
        .single();
      if (error) throw safeError(error);
      return data;
    }
    if (existing) return existing;
    const { data, error } = await context.supabase
      .from("trade_categories")
      .insert({ user_id: context.userId, name, normalized_name: normalizedName })
      .select("id, name, archived_at")
      .single();
    if (error) throw safeError(error);
    return data;
  });

export const archiveTradeCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trade_categories")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw safeError(error);
    return { ok: true };
  });

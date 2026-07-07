import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeError } from "@/lib/server-errors";

export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [trades, screenshots, notes] = await Promise.all([
      supabase
        .from("trades")
        .select("*")
        .eq("user_id", userId)
        .order("trade_date", { ascending: false }),
      supabase.from("trade_screenshots").select("*").eq("user_id", userId),
      supabase.from("sticky_notes").select("*").eq("user_id", userId),
    ]);
    if (trades.error) throw safeError(trades.error);
    if (screenshots.error) throw safeError(screenshots.error);
    if (notes.error) throw safeError(notes.error);
    return {
      exported_at: new Date().toISOString(),
      user_id: userId,
      trades: trades.data ?? [],
      trade_screenshots: screenshots.data ?? [],
      sticky_notes: notes.data ?? [],
    };
  });

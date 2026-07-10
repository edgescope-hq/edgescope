import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BATCH_SIZE = 25;
const SCREENSHOT_BUCKET = "trade-screenshots";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/account-purge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const authorization = request.headers.get("authorization");

        if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
          return json({ error: "Unauthorized" }, 401);
        }

        const now = new Date().toISOString();

        const { data: dueProfiles, error: dueProfilesError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .not("deletion_requested_at", "is", null)
          .not("deletion_scheduled_for", "is", null)
          .is("deletion_cancelled_at", null)
          .lte("deletion_scheduled_for", now)
          .order("deletion_scheduled_for", { ascending: true })
          .limit(BATCH_SIZE);

        if (dueProfilesError) {
          console.error("[account-purge] Failed to load due profiles", dueProfilesError);
          return json({ error: "Failed to load due accounts" }, 500);
        }

        const deleted: string[] = [];
        const failed: Array<{ userId: string; reason: string }> = [];

        for (const profile of dueProfiles ?? []) {
          const userId = profile.id;

          try {
            const { data: screenshots, error: screenshotsError } = await supabaseAdmin
              .from("trade_screenshots")
              .select("storage_path")
              .eq("user_id", userId);

            if (screenshotsError) throw screenshotsError;

            const paths = (screenshots ?? [])
              .map((row) => row.storage_path)
              .filter((path): path is string => Boolean(path));

            if (paths.length > 0) {
              const { error: storageError } = await supabaseAdmin.storage
                .from(SCREENSHOT_BUCKET)
                .remove(paths);

              if (storageError) throw storageError;
            }

            const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

            if (deleteUserError) throw deleteUserError;

            deleted.push(userId);
          } catch (error) {
            const reason = error instanceof Error ? error.message : "Unknown purge failure";
            console.error("[account-purge] Failed to purge user", {
              userId,
              reason,
            });
            failed.push({ userId, reason });
          }
        }

        return json({
          processed: dueProfiles?.length ?? 0,
          deleted: deleted.length,
          failed: failed.length,
        });
      },
    },
  },
});

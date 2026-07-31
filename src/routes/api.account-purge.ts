import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { joinUserStoragePath } from "@/lib/screenshot-storage";

const BATCH_SIZE = 25;
const CLAIM_LEASE_SECONDS = 15 * 60;
const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;
const SCREENSHOT_BUCKET = "trade-screenshots";

type PurgeFailureCode =
  | "storage_list_failed"
  | "storage_path_invalid"
  | "storage_delete_failed"
  | "storage_delete_incomplete"
  | "claim_finalize_failed"
  | "auth_delete_failed"
  | "unknown";

class PurgeFailure extends Error {
  constructor(readonly code: PurgeFailureCode) {
    super(code);
  }
}

function failureCode(error: unknown): PurgeFailureCode {
  return error instanceof PurgeFailure ? error.code : "unknown";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function listAllUserScreenshotObjects(userId: string): Promise<string[]> {
  const bucket = supabaseAdmin.storage.from(SCREENSHOT_BUCKET);
  const pendingDirectories = [userId];
  const seenDirectories = new Set<string>();
  const objectPaths: string[] = [];

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.shift()!;
    if (seenDirectories.has(directory)) continue;
    seenDirectories.add(directory);

    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data: entries, error } = await bucket.list(directory, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new PurgeFailure("storage_list_failed");

      for (const entry of entries ?? []) {
        const childPath = joinUserStoragePath(directory, entry.name, userId);
        if (!childPath) throw new PurgeFailure("storage_path_invalid");

        if (entry.id) objectPaths.push(childPath);
        else pendingDirectories.push(childPath);
      }

      if (!entries || entries.length < LIST_PAGE_SIZE) break;
    }
  }

  return objectPaths;
}

async function deleteAllUserScreenshotObjects(userId: string): Promise<void> {
  const bucket = supabaseAdmin.storage.from(SCREENSHOT_BUCKET);
  const paths = await listAllUserScreenshotObjects(userId);

  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const { error } = await bucket.remove(paths.slice(index, index + REMOVE_BATCH_SIZE));
    if (error) throw new PurgeFailure("storage_delete_failed");
  }

  const remaining = await listAllUserScreenshotObjects(userId);
  if (remaining.length > 0) throw new PurgeFailure("storage_delete_incomplete");
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

        const summary = {
          claimed: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
        };

        const { data: claims, error: claimError } = await supabaseAdmin.rpc(
          "claim_due_account_purges",
          { p_limit: BATCH_SIZE, p_lease_seconds: CLAIM_LEASE_SECONDS },
        );

        if (claimError) {
          console.error("[account-purge] Failed to claim due accounts", { code: "claim_failed" });
          return json({ error: "claim_failed", ...summary }, 500);
        }

        summary.claimed = claims?.length ?? 0;

        for (const claim of claims ?? []) {
          summary.processed += 1;

          try {
            const { data: mayStartDeleting, error: beginError } = await supabaseAdmin.rpc(
              "begin_account_purge_deletion",
              { p_user_id: claim.user_id, p_claim_token: claim.claim_token },
            );
            if (beginError) throw new PurgeFailure("claim_finalize_failed");
            if (!mayStartDeleting) {
              summary.skipped += 1;
              continue;
            }

            await deleteAllUserScreenshotObjects(claim.user_id);

            const { data: mayDelete, error: validateError } = await supabaseAdmin.rpc(
              "validate_account_purge_claim",
              { p_user_id: claim.user_id, p_claim_token: claim.claim_token },
            );
            if (validateError || !mayDelete) throw new PurgeFailure("claim_finalize_failed");

            const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(
              claim.user_id,
            );
            if (deleteUserError) throw new PurgeFailure("auth_delete_failed");

            summary.succeeded += 1;
          } catch (error) {
            const code = failureCode(error);
            const { data: retryRecorded, error: retryError } = await supabaseAdmin.rpc(
              "mark_account_purge_failure",
              {
                p_user_id: claim.user_id,
                p_claim_token: claim.claim_token,
                p_error_code: code,
              },
            );

            console.error("[account-purge] Account purge failed", {
              code,
              retryRecorded: !retryError && retryRecorded === true,
            });
            summary.failed += 1;
          }
        }

        return json(summary, summary.failed > 0 ? 500 : 200);
      },
    },
  },
});

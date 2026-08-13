import type { QueryClient } from "@tanstack/react-query";

export function authTransitionResetsUserCache(
  previousUserId: string | null,
  nextUserId: string | null,
  event: string,
): boolean {
  if (event === "SIGNED_OUT" || event === "USER_DELETED") return previousUserId !== null;
  return previousUserId !== null && nextUserId !== null && previousUserId !== nextUserId;
}

/** Cancel user work and synchronously remove cached rows before navigation can
 * expose them to a replacement session. Query keys can remain domain-oriented
 * because this central boundary runs for every end/replacement transition. */
export async function resetUserSessionCache(queryClient: QueryClient): Promise<void> {
  const cancellation = queryClient.cancelQueries();
  queryClient.clear();
  await cancellation;
}

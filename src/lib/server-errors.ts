// Safe error mapping for server functions. Never forwards raw DB error
// messages (which can leak table/column/constraint/enum names) to clients.
// Logs the full error server-side for debugging and throws a generic,
// user-safe message based on common Postgres SQLSTATE codes.

type MaybePgError =
  | {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    }
  | null
  | undefined;

const SAFE_MESSAGES: Record<string, string> = {
  "23505": "That value is already taken.",
  "23503": "Referenced record was not found.",
  "23502": "A required field is missing.",
  "23514": "The provided value is not allowed.",
  "22P02": "One of the provided values has an invalid format.",
  "22001": "One of the provided values is too long.",
  "42501": "You do not have permission to perform this action.",
  P0001: "The request was rejected by a server rule.",
  PGRST301: "You do not have permission to perform this action.",
  PGRST205: "Database table not found. Please ensure all migrations are applied.",
};

export function safeError(
  error: MaybePgError,
  fallback = "An unexpected error occurred. Please try again.",
): Error {
  // Always log the full error server-side for diagnostics.
  console.error("[server-fn]", error);
  const code = error?.code;
  if (code && SAFE_MESSAGES[code]) return new Error(SAFE_MESSAGES[code]);
  return new Error(fallback);
}

// Convenience: throw if a Supabase response has an error, else return data.
export function unwrap<T>(resp: { data: T; error: MaybePgError }, fallback?: string): T {
  if (resp.error) throw safeError(resp.error, fallback);
  return resp.data;
}

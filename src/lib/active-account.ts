export const ALL_ACCOUNTS = "ALL";

export type ActiveAccountCandidate = {
  id: string;
  status?: string | null;
};

export function activeAccountStorageKey(userId: string): string {
  return `edgescope.active-account.v1:${userId}`;
}

export function normalizeActiveAccountId(
  value: string | null | undefined,
  accounts: readonly ActiveAccountCandidate[],
): string {
  if (!value || value === ALL_ACCOUNTS) return ALL_ACCOUNTS;
  return accounts.some((account) => account.id === value && account.status !== "archived")
    ? value
    : ALL_ACCOUNTS;
}

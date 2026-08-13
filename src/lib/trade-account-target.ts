export type QuickCaptureAccount = {
  id: string;
  is_active?: boolean | null;
  status?: string | null;
};

export function resolveQuickCaptureAccountId(
  accounts: readonly QuickCaptureAccount[],
  preferredAccountId?: string | null,
): string | null {
  const available = accounts.filter((account) => account.status !== "archived");
  const preferred = preferredAccountId
    ? available.find((account) => account.id === preferredAccountId)
    : undefined;
  if (preferred) return preferred.id;
  return available.find((account) => account.is_active)?.id ?? null;
}

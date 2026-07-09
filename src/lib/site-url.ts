const DEFAULT_SITE_URL = "https://edgescope.app";

export function normalizeSiteUrl(value: string | null | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_SITE_URL;
}

export function getPublicSiteUrl(): string {
  return normalizeSiteUrl(import.meta.env.VITE_SITE_URL || process.env.SITE_URL);
}

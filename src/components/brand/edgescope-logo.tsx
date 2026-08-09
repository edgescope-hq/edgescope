import type { ComponentPropsWithoutRef } from "react";

export const edgeScopeBrandAssets = {
  mark: {
    light: "/brand/edgescope-mark-light.png",
    dark: "/brand/edgescope-mark-dark.png",
  },
  lockup: {
    light: "/brand/edgescope-lockup-light.png",
    dark: "/brand/edgescope-lockup-dark.png",
  },
} as const;

type EdgeScopeLogoProps = Omit<ComponentPropsWithoutRef<"img">, "src"> & {
  variant?: keyof typeof edgeScopeBrandAssets;
  tone?: keyof (typeof edgeScopeBrandAssets)["mark"];
};

/**
 * Uses the finalized EdgeScope artwork without recoloring or rebuilding it in CSS.
 * Choose the light artwork for dark surfaces and the dark artwork for light surfaces.
 */
export function EdgeScopeLogo({
  alt = "EdgeScope",
  tone = "light",
  variant = "lockup",
  ...props
}: EdgeScopeLogoProps) {
  return <img src={edgeScopeBrandAssets[variant][tone]} alt={alt} {...props} />;
}

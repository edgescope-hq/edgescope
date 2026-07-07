import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/[0.12] text-primary shadow-[0_0_18px_-14px_oklch(0.68_0.23_295/0.9)] hover:bg-primary/[0.16]",
        secondary:
          "border-white/[0.07] bg-white/[0.045] text-muted-foreground hover:bg-white/[0.065] hover:text-foreground",
        destructive:
          "border-destructive/[0.18] bg-destructive/[0.09] text-destructive/90 hover:bg-destructive/[0.13]",
        outline: "border-white/[0.08] bg-white/[0.025] text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

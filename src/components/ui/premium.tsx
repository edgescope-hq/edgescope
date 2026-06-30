import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-6 py-8 md:px-10 md:py-10", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease }}
      className={cn("flex flex-wrap items-start justify-between gap-4", className)}
    >
      <div className="min-w-0">
        {(eyebrow || Icon) && (
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/85">
            {Icon && (
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            {eyebrow && <span>{eyebrow}</span>}
          </div>
        )}
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          {title}
        </h2>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function MotionCard({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function PremiumEmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.025] text-center",
        compact ? "gap-3 px-5 py-8" : "gap-4 px-6 py-12",
        className,
      )}
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

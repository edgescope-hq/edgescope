import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * Reusable confirmation dialog. Matches EdgeScope dark UI. Use for any
 * destructive or non-reversible action.
 *
 * <ConfirmDialog
 *   open={open} onOpenChange={setOpen}
 *   title="Delete trade #12?"
 *   description="This trade and its screenshots will be permanently removed."
 *   confirmLabel="Delete trade"
 *   destructive
 *   onConfirm={() => mutate()}
 * />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  loading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-white/[0.08]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-bold">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            type="button"
            className="rounded-xl border-white/[0.06] bg-white/[0.04] text-muted-foreground ring-1 ring-white/[0.06] hover:bg-white/[0.07] hover:text-foreground"
            disabled={loading}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
            disabled={loading}
            className={cn(
              "rounded-xl font-semibold",
              destructive
                ? "bg-destructive/[0.42] text-destructive-foreground ring-1 ring-destructive/[0.18] hover:bg-destructive/[0.55]"
                : "bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110",
            )}
          >
            {loading ? "Working..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

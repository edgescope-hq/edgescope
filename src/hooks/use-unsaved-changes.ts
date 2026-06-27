import { useEffect } from "react";

/**
 * Warn before browser navigation (refresh / close / back) when there are
 * unsaved edits. For in-app close intents, callers should use
 * `confirmDiscard(dirty)` before dismissing a modal.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required for some browsers to actually show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/**
 * Returns true if it is safe to discard (either nothing is dirty, or the
 * user confirmed leaving). Use inside event handlers that close edit modals.
 */
export function confirmDiscard(dirty: boolean): boolean {
  if (!dirty) return true;
  return typeof window === "undefined"
    ? true
    : window.confirm("You have unsaved changes. Leave without saving?");
}

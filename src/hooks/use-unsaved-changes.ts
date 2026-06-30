import { useEffect } from "react";

/**
 * Warn before browser navigation (refresh / close / back) when there are
 * unsaved edits. In-app close/reset intents should use an app-styled
 * confirmation modal instead of browser-native dialogs.
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

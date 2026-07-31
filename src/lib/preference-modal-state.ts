import type { ScreenshotSlotPreferences } from "./journal-tracking.ts";

export function shouldIgnoreParentDialogClose(
  nextOpen: boolean,
  nestedConfirmationOpen: boolean,
): boolean {
  return !nextOpen && nestedConfirmationOpen;
}

export function screenshotDraftAfterDialogChange(
  nextOpen: boolean,
  persisted: ScreenshotSlotPreferences,
  draft: ScreenshotSlotPreferences,
): ScreenshotSlotPreferences {
  return nextOpen ? draft : persisted;
}

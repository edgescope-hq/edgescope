import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  getTradingPreferences,
  updateJournalTrackingPreferences,
} from "@/lib/trading-preferences.functions";
import {
  journalPreferencesWithScreenshotSlots,
  screenshotSlotsFromPreferences,
  SCREENSHOT_TIMEFRAMES,
  type ScreenshotSlotPreferences,
} from "@/lib/journal-tracking";
import { screenshotDraftAfterDialogChange } from "@/lib/preference-modal-state";

export function ScreenshotSlotSettingsButton({
  label = "Configure screenshots",
}: {
  label?: string;
}) {
  const qc = useQueryClient();
  const getPreferences = useServerFn(getTradingPreferences);
  const savePreferences = useServerFn(updateJournalTrackingPreferences);
  const { data: preferences } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => getPreferences(),
  });
  const persisted = useMemo(
    () => screenshotSlotsFromPreferences(preferences?.journal_tracking),
    [preferences?.journal_tracking],
  );
  const [slots, setSlots] = useState(persisted);
  const [open, setOpen] = useState(false);
  useEffect(() => setSlots(persisted), [persisted]);
  const dirty = JSON.stringify(slots) !== JSON.stringify(persisted);
  const valid =
    SCREENSHOT_TIMEFRAMES.some((timeframe) => slots[timeframe].enabled) &&
    SCREENSHOT_TIMEFRAMES.every((timeframe) => slots[timeframe].label.trim().length > 0);

  const save = useMutation({
    mutationFn: (next: ScreenshotSlotPreferences) =>
      savePreferences({
        data: journalPreferencesWithScreenshotSlots(preferences?.journal_tracking, next),
      }),
    onSuccess: (row, next) => {
      setSlots(next);
      qc.setQueryData(["trading-preferences"], row);
      toast.success("Screenshot slots saved");
      setOpen(false);
    },
    onError: () => toast.error("Couldn’t save screenshot settings. Try again."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSlots((current) => screenshotDraftAfterDialogChange(next, persisted, current));
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.07] transition hover:bg-white/[0.04] hover:text-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" /> {label}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure screenshots</DialogTitle>
          <DialogDescription>
            Choose which chart slots appear and how they are labelled.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]">
          {SCREENSHOT_TIMEFRAMES.map((timeframe) => (
            <div key={timeframe} className="flex items-center gap-3 px-3 py-2.5">
              <Switch
                checked={slots[timeframe].enabled}
                onCheckedChange={(enabled) => {
                  if (
                    !enabled &&
                    SCREENSHOT_TIMEFRAMES.filter((item) => slots[item].enabled).length === 1
                  ) {
                    toast.error("Keep at least one screenshot slot enabled");
                    return;
                  }
                  setSlots({ ...slots, [timeframe]: { ...slots[timeframe], enabled } });
                }}
                aria-label={`${slots[timeframe].enabled ? "Disable" : "Enable"} ${timeframe} slot`}
              />
              <span className="w-9 shrink-0 text-xs font-semibold text-muted-foreground">
                {timeframe}
              </span>
              <input
                value={slots[timeframe].label}
                maxLength={32}
                aria-label={`${timeframe} display label`}
                onChange={(event) =>
                  setSlots({
                    ...slots,
                    [timeframe]: { ...slots[timeframe], label: event.target.value },
                  })
                }
                className="min-w-0 flex-1 rounded-lg bg-black/20 px-2.5 py-1.5 text-sm ring-1 ring-white/[0.07] focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!dirty || !valid || save.isPending}
            onClick={() =>
              save.mutate(
                Object.fromEntries(
                  SCREENSHOT_TIMEFRAMES.map((timeframe) => [
                    timeframe,
                    { ...slots[timeframe], label: slots[timeframe].label.trim() },
                  ]),
                ) as ScreenshotSlotPreferences,
              )
            }
            className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

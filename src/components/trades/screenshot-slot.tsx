import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScreenshotSlotProps {
  timeframe: string;
  label: string;
  previewUrl: string | null;
  fileName?: string | null;
  uploading?: boolean;
  disabled?: boolean;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  onPreview: () => void;
}

export function ScreenshotSlot({
  timeframe,
  label,
  previewUrl,
  fileName,
  uploading,
  disabled,
  onUpload,
  onRemove,
  onPreview,
}: ScreenshotSlotProps) {
  return (
    <div className="flex flex-col rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.05]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground/80">{label}</div>
          {label !== timeframe && (
            <div className="text-[10px] text-muted-foreground/60">{timeframe}</div>
          )}
        </div>
        {previewUrl && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Delete ${label} screenshot`}
            title="Delete screenshot"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.04] text-muted-foreground/70 ring-1 ring-white/10 transition-all hover:bg-destructive/20 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {previewUrl ? (
        <div>
          <button
            type="button"
            onClick={onPreview}
            className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-white/[0.025] text-left ring-1 ring-white/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:ring-primary/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <img
              src={previewUrl}
              alt={`${timeframe} screenshot`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </button>
          {fileName && (
            <span className="mt-1 block truncate text-[10px] text-muted-foreground">
              {fileName}
            </span>
          )}
        </div>
      ) : (
        <label
          className={cn(
            "grid aspect-video cursor-pointer place-items-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.025] text-center text-xs text-muted-foreground transition-all duration-200 hover:border-primary/35 hover:bg-primary/[0.035] hover:text-foreground",
            (uploading || disabled) &&
              "cursor-not-allowed opacity-50 hover:border-white/[0.12] hover:bg-white/[0.025] hover:text-muted-foreground",
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {uploading ? "Uploading..." : `Upload ${timeframe}`}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading || disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUpload(file);
              }
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EMOTIONS } from "@/lib/emotions";
import { updateTrade } from "@/lib/trades.functions";

/**
 * Lightweight bottom-right popup shown after Quick Capture save.
 * Lets the user tag a single emotion and dismiss the prompt at any time.
 */
export function EmotionPopup({
  tradeId,
  existingTags = [],
  onClose,
}: {
  tradeId: string;
  existingTags?: string[];
  onClose: () => void;
}) {
  const update = useServerFn(updateTrade);
  const [selected, setSelected] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (key: string) => {
      const next = Array.from(new Set([...(existingTags ?? []), key]));
      return update({ data: { id: tradeId, patch: { emotion_tags: next } } });
    },
    onSuccess: () => {
      toast.success("Emotion saved");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not save emotion"),
  });

  // Auto-dismiss after 20s if untouched
  useEffect(() => {
    const t = setTimeout(() => {
      if (!selected && !save.isPending) onClose();
    }, 20000);
    return () => clearTimeout(t);
  }, [selected, save.isPending, onClose]);

  const handlePick = (key: string) => {
    setSelected(key);
    save.mutate(key);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="fixed bottom-6 right-6 z-[60] w-[min(92vw,360px)] rounded-2xl border border-white/[0.06] bg-[oklch(0.1_0.014_270/0.96)] p-4 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        role="dialog"
        aria-label="How did you feel?"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-primary">
              JUST LOGGED
            </div>
            <h3 className="mt-0.5 text-sm font-semibold">How did you feel?</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Tap an emotion or dismiss.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Dismiss"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EMOTIONS.map((e) => {
            const active = selected === e.key;
            return (
              <button
                key={e.key}
                onClick={() => handlePick(e.key)}
                disabled={save.isPending}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium ring-1 transition-all duration-200",
                  active
                    ? "bg-primary/15 text-foreground ring-primary/40"
                    : "bg-white/[0.03] text-muted-foreground ring-white/[0.06] hover:text-foreground hover:ring-white/[0.12]",
                  save.isPending && !active && "opacity-50",
                )}
              >
                <span className="text-sm leading-none">{e.emoji}</span>
                <span>{e.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

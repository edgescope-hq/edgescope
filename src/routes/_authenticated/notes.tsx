import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Plus, Pin, Trash2, Play, Square, Sparkles } from "lucide-react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  ensureMeditationNote,
} from "@/lib/notes.functions";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Trading Desk — EdgeScope" },
      { name: "description", content: "Quick reminders, mantras, and pre-trade checklists." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NotesPage,
});

type NoteColor = "purple" | "green" | "amber" | "blue" | "rose" | "default";

// Whole-card tinted surface (background + border) for each color choice.
const cardTint: Record<NoteColor, string> = {
  default: "bg-primary/10 ring-primary/25 border-primary/20",
  purple: "bg-primary/10 ring-primary/25 border-primary/20",
  green: "bg-success/10 ring-success/25 border-success/20",
  amber: "bg-warning/10 ring-warning/25 border-warning/20",
  blue: "bg-info/10 ring-info/25 border-info/20",
  rose: "bg-destructive/10 ring-destructive/25 border-destructive/20",
};

const colorSwatch: Record<NoteColor, string> = {
  default: "bg-primary",
  purple: "bg-primary",
  green: "bg-success",
  amber: "bg-warning",
  blue: "bg-info",
  rose: "bg-destructive",
};

const PALETTE: NoteColor[] = ["purple", "green", "amber", "blue", "rose"];

type Note = {
  id: string;
  title: string | null;
  content: string;
  color: string;
  pinned: boolean;
  kind?: string | null;
};

function NotesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listNotes);
  const create = useServerFn(createNote);
  const upd = useServerFn(updateNote);
  const del = useServerFn(deleteNote);
  const ensureMed = useServerFn(ensureMeditationNote);

  const { data } = useSuspenseQuery({ queryKey: ["notes"], queryFn: () => list() });
  const notes = (data ?? []) as Note[];

  // Seed the default Meditation sticky once per user.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    ensureMed()
      .then((r) => {
        if (r?.created) qc.invalidateQueries({ queryKey: ["notes"] });
      })
      .catch(() => {});
  }, [ensureMed, qc]);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; content: string }>({
    title: "",
    content: "",
  });
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const addM = useMutation({
    mutationFn: (color: NoteColor) =>
      create({ data: { title: "", content: "", color, pinned: false, archived: false } }),
    onSuccess: (created) => {
      invalidate();
      if (created && typeof created === "object" && "id" in created) {
        const id = (created as { id: string }).id;
        setEditing(id);
        setDraft({ title: "", content: "" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const togglePinM = useMutation({
    mutationFn: (n: { id: string; pinned: boolean }) =>
      upd({ data: { id: n.id, patch: { pinned: !n.pinned } } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const removeM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const saveM = useMutation({
    mutationFn: (p: { id: string; title: string; content: string }) =>
      upd({ data: { id: p.id, patch: { title: p.title, content: p.content } } }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const colorM = useMutation({
    mutationFn: (p: { id: string; color: NoteColor }) =>
      upd({ data: { id: p.id, patch: { color: p.color } } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const beginEdit = (n: Note) => {
    setEditing(n.id);
    setDraft({ title: n.title ?? "", content: n.content ?? "" });
  };

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl font-bold tracking-tight md:text-4xl"
          >
            Trading Desk
          </motion.h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Mantras, checklists, reminders and pre-trade tools — your daily desk.
          </p>
        </div>
        <button
          onClick={() => addM.mutate(PALETTE[notes.length % PALETTE.length])}
          disabled={addM.isPending}
          className="group inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-300 hover:shadow-[var(--shadow-glow-lg)] hover:brightness-110 disabled:opacity-50"
        >
          <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" /> New
          note
        </button>
      </div>

      {sorted.length === 0 && (
        <div className="mt-12 rounded-2xl border border-dashed border-white/[0.08] p-12 text-center text-sm text-muted-foreground">
          No notes yet. Create your first note above.
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((n, i) => {
          const color = (PALETTE.includes(n.color as NoteColor) ? n.color : "default") as NoteColor;
          const isEditing = editing === n.id;
          const isMeditation = n.kind === "meditation";
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.03 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "group relative rounded-2xl p-5 border ring-1 transition-all duration-200 shadow-[0_8px_24px_-12px_oklch(0_0_0/0.5)]",
                cardTint[color],
              )}
            >
              <div className="flex items-start justify-between gap-2">
                {isEditing ? (
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className="w-full rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-base font-semibold tracking-tight outline-none ring-1 ring-white/[0.1] focus:ring-primary/40"
                  />
                ) : (
                  <h3 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
                    {isMeditation && <Sparkles className="h-4 w-4 text-info" />}
                    {n.title || (isMeditation ? "Meditation" : "Untitled")}
                  </h3>
                )}
                <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {!isMeditation && (
                    <div className="mr-1 flex items-center gap-0.5 rounded-lg bg-white/[0.06] px-1.5 py-1 ring-1 ring-white/[0.08]">
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          title={c}
                          onClick={() => colorM.mutate({ id: n.id, color: c })}
                          className={cn(
                            "h-3.5 w-3.5 rounded-full ring-1 ring-white/20 transition-all duration-200",
                            colorSwatch[c],
                            color === c ? "ring-2 ring-white/80 scale-110" : "hover:scale-110",
                          )}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => togglePinM.mutate({ id: n.id, pinned: n.pinned })}
                    aria-label={n.pinned ? "Unpin note" : "Pin note"}
                    aria-pressed={n.pinned}
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-lg ring-1 ring-white/[0.08] transition-all duration-200",
                      n.pinned
                        ? "bg-primary/15 text-primary"
                        : "bg-white/[0.06] text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Pin className={cn("h-3.5 w-3.5", n.pinned && "fill-current")} />
                  </button>
                  {!isMeditation && (
                    <button
                      onClick={() => setConfirmDelId(n.id)}
                      aria-label="Delete note"
                      className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06] text-muted-foreground ring-1 ring-white/[0.08] transition-all duration-200 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {isMeditation ? (
                <MeditationBody />
              ) : isEditing ? (
                <>
                  <textarea
                    value={draft.content}
                    onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                    rows={6}
                    placeholder="Write your note…"
                    className="mt-3 w-full whitespace-pre-wrap rounded-lg bg-white/[0.06] px-2.5 py-2 text-sm leading-relaxed text-foreground/80 outline-none ring-1 ring-white/[0.1] focus:ring-primary/40"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() =>
                        saveM.mutate({ id: n.id, title: draft.title, content: draft.content })
                      }
                      disabled={saveM.isPending}
                      className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <pre
                  onClick={() => beginEdit(n)}
                  className="mt-3 cursor-text whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/80"
                >
                  {n.content || (
                    <span className="text-muted-foreground/60">Click to add content…</span>
                  )}
                </pre>
              )}
              {n.pinned && !isMeditation && (
                <div className="mt-4 inline-flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-bold tracking-wider text-foreground/80">
                  <Pin className="h-3 w-3 fill-current" /> PINNED
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
      <ConfirmDialog
        open={confirmDelId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelId(null);
        }}
        title="Delete this note?"
        description="The note will be permanently removed. This action cannot be undone."
        confirmLabel="Delete note"
        destructive
        loading={removeM.isPending}
        onConfirm={() => {
          if (confirmDelId) {
            removeM.mutate(confirmDelId);
            setConfirmDelId(null);
          }
        }}
      />
    </div>
  );
}

/* ---------- Meditation timer ---------- */

function MeditationBody() {
  const [duration, setDuration] = useState<5 | 10>(5);
  const [remaining, setRemaining] = useState<number>(5 * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) setRemaining(duration * 60);
  }, [duration, running]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setRunning(false);
          playDoneSound();
          toast.success("Meditation complete — welcome back.");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="mt-4">
      <div className="grid place-items-center rounded-xl bg-white/[0.06] py-5 ring-1 ring-white/[0.08]">
        <div className="font-display text-4xl font-bold tabular-nums tracking-tight">
          {mm}:{ss}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {running ? "Breathe…" : "Ready"}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg bg-white/[0.06] p-1 ring-1 ring-white/[0.08]">
          {([5, 10] as const).map((d) => (
            <button
              key={d}
              disabled={running}
              onClick={() => setDuration(d)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-all duration-200 disabled:opacity-40",
                duration === d
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d} min
            </button>
          ))}
        </div>
        {running ? (
          <button
            onClick={() => {
              setRunning(false);
              setRemaining(duration * 60);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive ring-1 ring-destructive/20 hover:bg-destructive/20"
          >
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
        ) : (
          <button
            onClick={() => {
              setRemaining(duration * 60);
              setRunning(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
          >
            <Play className="h-3.5 w-3.5" /> Start
          </button>
        )}
      </div>
    </div>
  );
}

function playDoneSound() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    };
    playTone(528, 0, 0.6);
    playTone(660, 0.35, 0.8);
    setTimeout(() => ctx.close().catch(() => {}), 1800);
  } catch {
    /* no-op */
  }
}

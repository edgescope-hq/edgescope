import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, NotebookPen, Save, X, FileText, Copy, Play, Square, Sparkles, BookOpen } from "lucide-react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listEntries, createEntry, updateEntry, deleteEntry } from "@/lib/notebook.functions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { confirmDiscard, useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { NOTE_TEMPLATES, templateToPlainText, type NoteTemplate } from "@/lib/note-templates";

export const Route = createFileRoute("/_authenticated/playbook")({
  head: () => ({
    meta: [
      { title: "Playbook — EdgeScope" },
      { name: "description", content: "Your personal trading rules, notes, templates and mindset space." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PlaybookPage,
});

type NoteType = "setup" | "lesson" | "review" | "general";
type Entry = {
  id: string;
  title: string | null;
  content: string;
  tags: string[] | null;
  note_type?: NoteType | null;
  updated_at: string;
};

const TYPE_OPTIONS: { v: NoteType; l: string }[] = [
  { v: "setup", l: "Setup" },
  { v: "lesson", l: "Lesson" },
  { v: "review", l: "Review" },
  { v: "general", l: "General" },
];

type Tab = "notes" | "templates" | "meditation";

function PlaybookPage() {
  const [tab, setTab] = useState<Tab>("notes");

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl font-bold tracking-tight md:text-4xl"
        >
          Playbook
        </motion.h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your personal rules, notes, templates and mindset — the trader's quiet workspace.
        </p>
      </div>

      <div className="mt-6 inline-flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
        {([
          { v: "notes", l: "Notes", icon: NotebookPen },
          { v: "templates", l: "Templates", icon: FileText },
          { v: "meditation", l: "Meditation", icon: Sparkles },
        ] as const).map((t) => {
          const Icon = t.icon;
          const active = tab === t.v;
          return (
            <button
              key={t.v}
              onClick={() => setTab(t.v as Tab)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
                active ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.l}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "notes" && <NotesTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "meditation" && <MeditationTab />}
      </div>
    </div>
  );
}

/* ============ Notes tab ============ */

function NotesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listEntries);
  const create = useServerFn(createEntry);
  const upd = useServerFn(updateEntry);
  const del = useServerFn(deleteEntry);

  const { data } = useSuspenseQuery({ queryKey: ["notebook"], queryFn: () => list() });
  const entries = (data ?? []) as Entry[];

  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const selected = entries.find((e) => e.id === selectedId) ?? entries[0] ?? null;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notebook"] });

  const addM = useMutation({
    mutationFn: (init?: { title: string; content: string; tags: string[]; note_type: NoteType }) =>
      create({ data: init ?? { title: "Untitled note", content: "", tags: [], note_type: "general" } }),
    onSuccess: (row) => {
      invalidate();
      if (row && "id" in row) setSelectedId(row.id as string);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { setSelectedId(null); setConfirmDelete(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">Personal notes — setups, market observations and your own ideas.</p>
        <button
          onClick={() => addM.mutate(undefined)}
          disabled={addM.isPending}
          className="group inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-300 hover:brightness-110 disabled:opacity-50"
        >
          <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" /> New note
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="glow-card rounded-2xl p-2">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No notes yet. Create your first one.</div>
          ) : (
            <ul className="space-y-1">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => setSelectedId(e.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
                      selected?.id === e.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    <NotebookPen className={cn("mt-0.5 h-4 w-4 shrink-0", selected?.id === e.id ? "text-primary" : "text-muted-foreground/60")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.title || "Untitled"}</div>
                      <div className="truncate text-[11px] text-muted-foreground/70">
                        {e.content.slice(0, 60) || "Empty"}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {selected ? (
          <NoteEditor
            key={selected.id}
            entry={selected}
            onSave={async (patch) => {
              await upd({ data: { id: selected.id, patch } });
              invalidate();
              toast.success("Saved");
            }}
            onDelete={() => setConfirmDelete(true)}
          />
        ) : (
          <div className="glow-card grid place-items-center rounded-2xl p-12 text-center text-sm text-muted-foreground">
            Select or create a note to begin.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this note?"
        description="This note will be permanently removed. This action cannot be undone."
        confirmLabel="Delete note"
        destructive
        loading={delM.isPending}
        onConfirm={() => selected && delM.mutate(selected.id)}
      />
    </div>
  );
}

function NoteEditor({
  entry,
  onSave,
  onDelete,
}: {
  entry: Entry;
  onSave: (p: { title: string | null; content: string; tags: string[]; note_type: NoteType }) => Promise<void>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(entry.title ?? "");
  const [content, setContent] = useState(entry.content ?? "");
  const [tagsText, setTagsText] = useState((entry.tags ?? []).join(", "));
  const [noteType, setNoteType] = useState<NoteType>((entry.note_type ?? "general") as NoteType);
  const [saving, setSaving] = useState(false);
  const dirty = title !== (entry.title ?? "") || content !== (entry.content ?? "") || tagsText !== (entry.tags ?? []).join(", ") || noteType !== (entry.note_type ?? "general");
  useUnsavedChanges(dirty);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="glow-card rounded-2xl p-5"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title"
        className="w-full bg-transparent text-xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
      />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setNoteType(t.v)}
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 transition-all",
              noteType === t.v ? "bg-primary/15 text-primary ring-primary/30" : "bg-white/[0.04] text-muted-foreground ring-white/[0.06] hover:text-foreground",
            )}
          >
            {t.l}
          </button>
        ))}
      </div>
      <input
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
        placeholder="Tags (comma separated)"
        className="mt-2 w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={18}
        placeholder="Setup description, trading lessons, observations…"
        className="mt-4 w-full resize-y rounded-xl bg-white/[0.03] px-3.5 py-3 text-sm leading-relaxed outline-none ring-1 ring-white/[0.06] focus:ring-primary/40"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!confirmDiscard(dirty)) return;
              setTitle(entry.title ?? "");
              setContent(entry.content ?? "");
              setTagsText((entry.tags ?? []).join(", "));
              setNoteType((entry.note_type ?? "general") as NoteType);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.06] transition-all duration-200 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Reset
          </button>
          <button
            disabled={saving || !dirty}
            onClick={async () => {
              setSaving(true);
              try {
                const tags = tagsText.split(",").map((s) => s.trim()).filter(Boolean);
                await onSave({ title: title.trim() || null, content, tags, note_type: noteType });
              } finally {
                setSaving(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ============ Templates tab ============ */

function TemplatesTab() {
  const qc = useQueryClient();
  const create = useServerFn(createEntry);
  const [selectedId, setSelectedId] = useState<string>(NOTE_TEMPLATES[0]?.id ?? "");
  const selected = NOTE_TEMPLATES.find((t) => t.id === selectedId) ?? NOTE_TEMPLATES[0];

  const dupM = useMutation({
    mutationFn: (t: NoteTemplate) =>
      create({ data: { title: t.title, content: templateToPlainText(t), tags: t.tags, note_type: t.note_type } }),
    onSuccess: (_row, t) => {
      qc.invalidateQueries({ queryKey: ["notebook"] });
      toast.success(`Duplicated "${t.title}" into your notes`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="glow-card rounded-2xl p-2">
        <ul className="space-y-1">
          {NOTE_TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
                  selected?.id === t.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                <BookOpen className={cn("mt-0.5 h-4 w-4 shrink-0", selected?.id === t.id ? "text-primary" : "text-muted-foreground/60")} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.title}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {selected ? (
        <motion.div
          key={selected.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="glow-card rounded-2xl p-6 md:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Built-in template
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">{selected.title}</h2>
            </div>
            <button
              onClick={() => dupM.mutate(selected)}
              disabled={dupM.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110 disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate to my notes
            </button>
          </div>

          <article className="mt-6 max-w-2xl space-y-5 text-[15px] leading-[1.75] text-foreground/85">
            {selected.blocks.map((b, i) => {
              if (b.type === "heading") {
                return (
                  <h3 key={i} className="pt-2 text-base font-semibold text-foreground">
                    {b.text}
                  </h3>
                );
              }
              if (b.type === "ifthen") {
                return (
                  <div key={i} className="space-y-2">
                    <p className="font-semibold text-foreground">• {b.ifText}</p>
                    <p className="pl-5 text-foreground/75">
                      <span className="font-semibold text-foreground">{b.thenLabel}</span> {b.thenText}
                    </p>
                  </div>
                );
              }
              return (
                <p key={i} className="text-foreground/80">{b.text}</p>
              );
            })}
          </article>

          <p className="mt-8 text-xs text-muted-foreground">
            Built-in templates are read-only. Duplicate one to edit your own copy.
          </p>
        </motion.div>
      ) : null}
    </div>
  );
}

/* ============ Meditation tab ============ */

function MeditationTab() {
  const [duration, setDuration] = useState<5 | 10>(5);
  const [remaining, setRemaining] = useState<number>(5 * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastDay, setLastDay] = useState<string | null>(null);

  // Load meditation streak from localStorage (user-scoped enough for this lightweight use)
  useEffect(() => {
    try {
      const s = Number(localStorage.getItem("edgescope.meditation.streak") ?? "0");
      const d = localStorage.getItem("edgescope.meditation.lastDay");
      setStreak(Number.isFinite(s) ? s : 0);
      setLastDay(d);
    } catch { /* ignore */ }
  }, []);

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
          // streak logic — only Meditation owns this counter
          const today = new Date().toISOString().slice(0, 10);
          const yesterday = (() => {
            const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
          })();
          let newStreak = 1;
          if (lastDay === today) newStreak = streak; // already counted today
          else if (lastDay === yesterday) newStreak = streak + 1;
          try {
            localStorage.setItem("edgescope.meditation.streak", String(newStreak));
            localStorage.setItem("edgescope.meditation.lastDay", today);
          } catch { /* ignore */ }
          setStreak(newStreak);
          setLastDay(today);
          toast.success("Meditation complete — welcome back.");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, streak, lastDay]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="glow-card rounded-2xl p-8"
      >
        <h2 className="text-xl font-bold tracking-tight">Daily Meditation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A short, focused pause before you trade. Calm mind, clean decisions.
        </p>

        <div className="mt-8 grid place-items-center rounded-2xl bg-white/[0.04] py-10 ring-1 ring-white/[0.06]">
          <div className="font-display text-6xl font-bold tabular-nums tracking-tight">{mm}:{ss}</div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {running ? "Breathe…" : "Ready"}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
            {([5, 10] as const).map((d) => (
              <button
                key={d}
                disabled={running}
                onClick={() => setDuration(d)}
                className={cn(
                  "rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 disabled:opacity-40",
                  duration === d ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d} min
              </button>
            ))}
          </div>
          {running ? (
            <button
              onClick={() => { setRunning(false); setRemaining(duration * 60); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 px-4 py-2 text-xs font-semibold text-destructive ring-1 ring-destructive/20 hover:bg-destructive/20"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          ) : (
            <button
              onClick={() => { setRemaining(duration * 60); setRunning(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
            >
              <Play className="h-3.5 w-3.5" /> Start
            </button>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glow-card rounded-2xl p-6"
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Daily streak</div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-5xl font-bold tabular-nums text-primary">{streak}</div>
          <div className="text-sm text-muted-foreground">day{streak === 1 ? "" : "s"}</div>
        </div>
      </motion.div>
    </div>
  );
}

function playDoneSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      osc.connect(gain); gain.connect(ctx.destination);
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    };
    playTone(528, 0, 0.6);
    playTone(660, 0.35, 0.8);
    setTimeout(() => ctx.close().catch(() => {}), 1800);
  } catch { /* no-op */ }
}

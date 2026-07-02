import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  Brain,
  BookOpen,
  Check,
  CircleDot,
  ClipboardCheck,
  Crosshair,
  FilePlus2,
  FileText,
  GitBranch,
  Lightbulb,
  ListChecks,
  NotebookPen,
  Play,
  Plus,
  Radar,
  Save,
  Search,
  SearchCheck,
  Sparkles,
  Square,
  Target,
  Trash2,
  X,
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
} from "lucide-react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listEntries, createEntry, updateEntry, deleteEntry } from "@/lib/notebook.functions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { NOTE_TEMPLATES } from "@/lib/note-templates";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/playbook")({
  head: () => ({
    meta: [
      { title: "Playbook — EdgeScope" },
      {
        name: "description",
        content: "Your personal trading rules, notes, templates and mindset space.",
      },
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
    <PageShell>
      <PageHeader
        icon={BookOpen}
        eyebrow="Process"
        title="Playbook"
        description="Your personal rules, notes, templates, and mindset space for quieter review."
      />

      <div className="mt-6 inline-flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
        {(
          [
            { v: "notes", l: "Notes", icon: NotebookPen },
            { v: "templates", l: "Templates", icon: FileText },
            { v: "meditation", l: "Meditation", icon: Sparkles },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.v;
          return (
            <button
              key={t.v}
              onClick={() => setTab(t.v as Tab)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                  : "text-muted-foreground hover:text-foreground",
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
    </PageShell>
  );
}

/* ============ Notes tab ============ */

const NOTE_TYPE_ICONS: Record<NoteType, typeof NotebookPen> = {
  setup: Target,
  lesson: Lightbulb,
  review: ClipboardCheck,
  general: NotebookPen,
};

function noteTypeIcon(type: NoteType | null | undefined) {
  return NOTE_TYPE_ICONS[type ?? "general"] ?? NotebookPen;
}

function NotesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listEntries);
  const create = useServerFn(createEntry);
  const upd = useServerFn(updateEntry);
  const del = useServerFn(deleteEntry);

  const { data } = useSuspenseQuery({ queryKey: ["notebook"], queryFn: () => list() });
  const entries = (data ?? []) as Entry[];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [typeFilter, setTypeFilter] = useState<NoteType | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    let result = entries;
    if (typeFilter !== "ALL") result = result.filter((e) => e.note_type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (e) =>
          (e.title ?? "").toLowerCase().includes(q) ||
          (e.content ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [entries, typeFilter, searchQuery]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notebook"] });

  const addM = useMutation({
    mutationFn: (init?: { title: string; content: string; tags: string[]; note_type: NoteType }) =>
      create({
        data: init ?? { title: "Untitled note", content: "", tags: [], note_type: "general" },
      }),
    onSuccess: (row) => {
      invalidate();
      if (row && "id" in row) {
        setSelectedId(row.id as string);
        setShowEditor(true);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      setSelectedId(null);
      setShowEditor(false);
      setConfirmDelete(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-48 rounded-xl bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 ring-1 ring-white/[0.06] transition focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
            {(["ALL", "setup", "lesson", "review", "general"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
                  typeFilter === f
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f === "ALL" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="group inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-300 hover:brightness-110"
        >
          <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" /> New note
        </button>
      </div>

      {filtered.length === 0 ? (
        <PremiumEmptyState
          icon={NotebookPen}
          title={entries.length === 0 ? "No notes yet" : "No matching notes"}
          description={
            entries.length === 0
              ? "Create your first setup note, lesson, or review entry."
              : "Try a different search or filter."
          }
          className="mt-6"
        />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => {
            const Icon = noteTypeIcon(e.note_type);
            return (
              <button
                key={e.id}
                onClick={() => {
                  setSelectedId(e.id);
                  setShowEditor(true);
                }}
                className="glow-card group flex flex-col items-start justify-between rounded-2xl p-4 text-left border border-white/[0.04] bg-white/[0.01] transition-all duration-200 hover:border-primary/20 hover:ring-1 hover:ring-primary/10"
              >
                <div className="space-y-3 w-full">
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="shrink-0 rounded-full bg-white/[0.04] border border-white/[0.05] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      {e.note_type ?? "general"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {e.title?.trim() || "Untitled note"}
                    </h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/60 line-clamp-2">
                      {e.content?.trim() || "No content"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 text-[10px] text-muted-foreground/50 w-full flex items-center justify-between">
                  <span>
                    {e.updated_at
                      ? new Date(e.updated_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </span>
                  <div className="flex gap-1.5 flex-wrap">
                    {(e.tags ?? []).slice(0, 2).map((t, tid) => (
                      <span key={tid} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.03] text-muted-foreground/70">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Note Editor sliding sheet */}
      <Sheet open={showEditor} onOpenChange={(open) => { if (!open) { setShowEditor(false); setSelectedId(null); } }}>
        <SheetContent className="rounded-l-2xl border-l border-white/[0.08] bg-[oklch(0.09_0.015_270)] sm:max-w-xl p-6 overflow-y-auto z-50">
          {selected && (
            <NoteEditor
              entry={selected}
              onSave={async (patch) => {
                await upd({ data: { id: selected.id, patch } });
                invalidate();
                toast.success("Saved");
              }}
              onDelete={() => setConfirmDelete(true)}
              onClose={() => {
                setShowEditor(false);
                setSelectedId(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Create Note modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-md p-6">
          <CreateNoteModal
            onClose={() => setShowCreateModal(false)}
            onCreate={(init) => addM.mutate(init)}
            loading={addM.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal */}
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
  onClose,
}: {
  entry: Entry;
  onSave: (p: { title: string | null; content: string; tags: string[]; note_type: NoteType }) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(entry.title ?? "");
  const [content, setContent] = useState(entry.content ?? "");
  const [tagsText, setTagsText] = useState((entry.tags ?? []).join(", "));
  const [noteType, setNoteType] = useState<NoteType>((entry.note_type ?? "general") as NoteType);
  const [saving, setSaving] = useState(false);

  const dirty =
    title !== (entry.title ?? "") ||
    content !== (entry.content ?? "") ||
    tagsText !== (entry.tags ?? []).join(", ") ||
    noteType !== (entry.note_type ?? "general");

  useUnsavedChanges(dirty);

  return (
    <div className="flex flex-col h-full gap-5">
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <ChevronLeft className="h-4 w-4" /> Back to library
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 flex-1 flex flex-col min-h-0">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="w-full bg-transparent text-xl font-bold tracking-tight outline-none border-b border-white/[0.05] pb-2 placeholder:text-muted-foreground/30 focus:border-primary/40 transition"
        />

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Type
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setNoteType(t.v)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-semibold ring-1 transition-all",
                  noteType === t.v
                    ? "bg-primary/20 text-primary ring-primary/30"
                    : "bg-white/[0.03] text-muted-foreground ring-white/[0.05] hover:text-foreground",
                )}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Tags (comma separated)
          </label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="e.g. dynamic-structure, pullback"
            className="w-full rounded-xl bg-white/[0.03] px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 ring-1 ring-white/[0.05] focus:outline-none focus:ring-1 focus:ring-primary/35 transition-all"
          />
        </div>

        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full flex-1 min-h-[200px] resize-none rounded-xl bg-white/[0.02] px-3.5 py-3 text-sm leading-relaxed outline-none ring-1 ring-white/[0.05] focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-white/[0.04] pt-4">
        <button
          onClick={onClose}
          className="rounded-xl bg-white/[0.04] px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground border border-white/[0.06] transition"
        >
          Cancel
        </button>
        <button
          disabled={saving || !dirty}
          onClick={async () => {
            setSaving(true);
            try {
              const tags = tagsText
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              await onSave({ title: title.trim() || null, content, tags, note_type: noteType });
            } finally {
              setSaving(false);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50 transition"
        >
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function CreateNoteModal({
  onClose,
  onCreate,
  loading,
}: {
  onClose: () => void;
  onCreate: (init: { title: string; content: string; tags: string[]; note_type: NoteType }) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [content, setContent] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      title: title.trim(),
      content: content.trim(),
      tags: [],
      note_type: noteType,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <NotebookPen className="h-4 w-4" />
          </div>
          <h2 className="text-base font-bold text-foreground">Create note</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            TITLE
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder=""
            autoFocus
            className="mt-1.5 block w-full rounded-xl border-0 bg-white/[0.04] px-4 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] transition focus:outline-none focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            TYPE
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setNoteType(opt.v)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition",
                  noteType === opt.v
                    ? "bg-primary text-primary-foreground ring-primary/30 shadow-[var(--shadow-glow)]"
                    : "bg-white/[0.03] text-muted-foreground ring-white/[0.05] hover:text-foreground",
                )}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            CONTENT
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder=""
            className="mt-1.5 block w-full resize-none rounded-xl border-0 bg-white/[0.04] px-4 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] transition focus:outline-none focus:ring-primary/30"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground border border-white/[0.06] hover:text-foreground disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50 transition"
          >
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============ Templates tab ============ */

const TEMPLATE_ICONS: Record<string, typeof BookOpen> = {
  "trading-in-the-zone": Brain,
  "if-then-cheat-sheet": GitBranch,
  "only-patterns-you-should-spot": Radar,
};

function templateIcon(id: string) {
  return TEMPLATE_ICONS[id] ?? BookOpen;
}

function TemplatesTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = NOTE_TEMPLATES.find((t) => t.id === selectedId) ?? null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NOTE_TEMPLATES.map((t) => {
          const Icon = templateIcon(t.id);
          return (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className="glow-card group flex flex-col justify-between items-start rounded-2xl p-5 text-left border border-white/[0.04] bg-white/[0.01] hover:border-primary/20 transition-all duration-200"
            >
              <div className="space-y-3 w-full">
                <div className="flex justify-between items-start gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="rounded-full bg-white/[0.04] border border-white/[0.05] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Process template
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">{t.title}</h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/60 line-clamp-2">
                    {t.blocks
                      .filter((b) => b.type === "paragraph")
                      .map((b) => b.text)
                      .join(" ")}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex w-full justify-end text-xs text-primary/80 font-bold group-hover:text-primary transition-colors items-center gap-1">
                <span>Open template</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        {selected && (
          <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-2xl max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/75">
                  Process template
                </span>
                <h2 className="mt-1 text-xl font-bold text-foreground">{selected.title}</h2>
              </div>
            </div>
            <article className="mt-6 space-y-4 text-sm leading-relaxed text-foreground/85">
              {selected.blocks.map((b, i) => {
                if (b.type === "heading") {
                  return (
                    <h3 key={i} className="pt-2 text-sm font-bold text-foreground">
                      {b.text}
                    </h3>
                  );
                }
                if (b.type === "ifthen") {
                  return (
                    <div key={i} className="space-y-2 rounded-xl bg-white/[0.02] p-4 border border-white/[0.04]">
                      <p className="font-semibold text-foreground">• {b.ifText}</p>
                      <p className="pl-5 text-foreground/75">
                        <span className="font-semibold text-foreground">{b.thenLabel}</span>{" "}
                        {b.thenText}
                      </p>
                    </div>
                  );
                }
                return (
                  <p key={i} className="text-foreground/80 leading-relaxed">
                    {b.text}
                  </p>
                );
              })}
            </article>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedId(null)}
                className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-white/[0.06] transition"
              >
                Close
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
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

  useEffect(() => {
    try {
      const s = Number(localStorage.getItem("edgescope.meditation.streak") ?? "0");
      const d = localStorage.getItem("edgescope.meditation.lastDay");
      setStreak(Number.isFinite(s) ? s : 0);
      setLastDay(d);
    } catch {
      /* ignore */
    }
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
          const today = new Date().toISOString().slice(0, 10);
          const yesterday = (() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
          })();
          let newStreak = 1;
          if (lastDay === today)
            newStreak = streak;
          else if (lastDay === yesterday) newStreak = streak + 1;
          try {
            localStorage.setItem("edgescope.meditation.streak", String(newStreak));
            localStorage.setItem("edgescope.meditation.lastDay", today);
          } catch {
            /* ignore */
          }
          setStreak(newStreak);
          setLastDay(today);
          toast.success("Meditation complete — welcome back.");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, streak, lastDay]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="glow-card rounded-2xl p-6 border border-white/[0.04] bg-white/[0.01]">
        <h3 className="text-base font-bold tracking-tight">Daily Meditation</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A short, focused pause before you trade. Calm mind, clean decisions.
        </p>

        <div className="mt-6 grid place-items-center rounded-2xl bg-white/[0.02] border border-white/[0.04] py-8">
          <div className="font-display text-5xl font-bold tabular-nums tracking-tight">
            {mm}:{ss}
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 px-4 py-2 text-xs font-semibold text-destructive ring-1 ring-destructive/20 hover:bg-destructive/20"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          ) : (
            <button
              onClick={() => {
                setRemaining(duration * 60);
                setRunning(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110"
            >
              <Play className="h-3.5 w-3.5" /> Start
            </button>
          )}
        </div>
      </div>

      <div className="glow-card rounded-2xl p-6 border border-white/[0.04] bg-white/[0.01]">
        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/75">
          Daily streak
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-4xl font-bold tabular-nums text-primary">{streak}</div>
          <div className="text-xs text-muted-foreground">day{streak === 1 ? "" : "s"}</div>
        </div>
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

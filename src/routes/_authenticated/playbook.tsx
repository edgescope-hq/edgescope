import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
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
  Plus,
  Radar,
  Save,
  Search,
  SearchCheck,
  Target,
  Trash2,
  X,
  ChevronRight,
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
import { Dialog, DialogContent } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/playbook")({
  head: () => ({
    meta: [
      { title: "Playbook — EdgeScope" },
      {
        name: "description",
        content: "Your personal trading rules, notes, and templates.",
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
  { v: "general", l: "General" },
  { v: "setup", l: "Setup" },
  { v: "lesson", l: "Lesson" },
  { v: "review", l: "Review" },
];

type Tab = "notes" | "templates";

function PlaybookPage() {
  const [tab, setTab] = useState<Tab>("notes");

  return (
    <PageShell>
      <PageHeader
        icon={BookOpen}
        eyebrow="Process"
        title="Playbook"
        description="Your personal rules, notes, and templates for structured review."
      />

      <div className="mt-6 inline-flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
        {(
          [
            { v: "notes", l: "Notes", icon: NotebookPen },
            { v: "templates", l: "Templates", icon: FileText },
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

function noteContentPlaceholder(type: NoteType) {
  switch (type) {
    case "setup":
      return "Describe the setup, entry conditions, and invalidation rules.";
    case "lesson":
      return "Capture the lesson, mistake, or improvement to remember.";
    case "review":
      return "Summarize what worked, what failed, and what to adjust.";
    default:
      return "Write a trading note, reminder, or observation.";
  }
}

function normalizeTitle(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function notePreview(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

const TEMPLATE_PREVIEWS: Record<string, string> = {
  "trading-in-the-zone": "Edge is statistical. Trust the process, not one result.",
  "if-then-cheat-sheet": "If a repeated mistake appears, then define one execution rule.",
  "only-patterns-you-should-spot": "Track only patterns tied to entries, exits, and behavior.",
};

function NotesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listEntries);
  const create = useServerFn(createEntry);
  const upd = useServerFn(updateEntry);
  const del = useServerFn(deleteEntry);

  const { data } = useSuspenseQuery({ queryKey: ["notebook"], queryFn: () => list() });
  const entries = useMemo(() => (data ?? []) as Entry[], [data]);

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
          (e.title ?? "").toLowerCase().includes(q) || (e.content ?? "").toLowerCase().includes(q),
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
            {(["ALL", "general", "setup", "lesson", "review"] as const).map((f) => (
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
          <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" /> New
          note
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
            const preview = notePreview(e.content);
            const tags = e.tags ?? [];
            return (
              <button
                key={e.id}
                onClick={() => {
                  setSelectedId(e.id);
                  setShowEditor(true);
                }}
                className="glow-card interactive-card group flex min-h-[180px] flex-col items-start justify-between rounded-2xl p-4 text-left"
              >
                <div className="space-y-3 w-full">
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="max-w-[9rem] shrink-0 truncate rounded-full bg-white/[0.04] border border-white/[0.05] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      {e.note_type ?? "general"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="line-clamp-2 break-words text-sm font-bold leading-snug text-foreground transition-colors [overflow-wrap:anywhere]">
                      {e.title?.trim() || "Untitled note"}
                    </h4>
                    {preview ? (
                      <p className="mt-2 max-h-[3.75rem] overflow-hidden break-words text-xs leading-5 text-muted-foreground [mask-image:linear-gradient(to_bottom,black_72%,transparent_100%)] [overflow-wrap:anywhere]">
                        {preview}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs italic leading-5 text-muted-foreground/78">
                        No note content yet
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex w-full flex-col gap-3 text-[10px] text-muted-foreground/72">
                  {tags.length > 0 && (
                    <div className="flex max-w-full flex-wrap gap-1.5">
                      {tags.slice(0, 4).map((t, tid) => (
                        <span
                          key={tid}
                          className="max-w-full truncate rounded-lg bg-white/[0.045] px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground/84 ring-1 ring-white/[0.065]"
                          title={t}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="text-muted-foreground/72">
                    {e.updated_at
                      ? new Date(e.updated_at).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Note Editor modal */}
      <Dialog
        open={showEditor}
        onOpenChange={(open) => {
          if (!open) {
            setShowEditor(false);
            setSelectedId(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] p-0 [&>button]:hidden">
          {selected && (
            <NoteEditor
              entry={selected}
              isDuplicateTitle={(title) => {
                const nextTitle = normalizeTitle(title);
                return nextTitle
                  ? entries.some(
                      (entry) =>
                        entry.id !== selected.id && normalizeTitle(entry.title) === nextTitle,
                    )
                  : false;
              }}
              onSave={async (patch) => {
                if (
                  patch.title &&
                  entries.some(
                    (entry) =>
                      entry.id !== selected.id &&
                      normalizeTitle(entry.title) === normalizeTitle(patch.title),
                  )
                ) {
                  toast.error("You already have a note with this title.");
                  return;
                }
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
        </DialogContent>
      </Dialog>

      {/* Create Note modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-md p-6 [&>button]:hidden">
          <CreateNoteModal
            onClose={() => setShowCreateModal(false)}
            onCreate={(init) => {
              if (
                entries.some((entry) => normalizeTitle(entry.title) === normalizeTitle(init.title))
              ) {
                toast.error("You already have a note with this title.");
                return;
              }
              addM.mutate(init);
            }}
            isDuplicateTitle={(title) => {
              const nextTitle = normalizeTitle(title);
              return nextTitle
                ? entries.some((entry) => normalizeTitle(entry.title) === nextTitle)
                : false;
            }}
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
        onConfirm={() => {
          if (selected) delM.mutate(selected.id);
        }}
      />
    </div>
  );
}

function NoteEditor({
  entry,
  isDuplicateTitle,
  onSave,
  onDelete,
  onClose,
}: {
  entry: Entry;
  isDuplicateTitle: (title: string) => boolean;
  onSave: (p: {
    title: string | null;
    content: string;
    tags: string[];
    note_type: NoteType;
  }) => Promise<void>;
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
  const duplicateTitle = isDuplicateTitle(title);

  useUnsavedChanges(dirty);

  return (
    <div className="flex max-h-[88vh] flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.04] px-6 py-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Playbook note
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-foreground">
            <NotebookPen className="h-4 w-4 text-primary" /> Edit note
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close note"
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="w-full border-b border-primary/25 bg-transparent pb-2 text-xl font-bold tracking-tight outline-none transition placeholder:text-muted-foreground/30 focus:border-primary/60"
        />
        {duplicateTitle && (
          <p className="-mt-2 text-[11px] text-destructive/85">
            You already have a note with this title.
          </p>
        )}

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
            Tags
          </label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="Tags separated by commas"
            className="w-full rounded-xl bg-white/[0.04] px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/55 ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-primary/35 transition-all"
          />
        </div>

        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={noteContentPlaceholder(noteType)}
            className="w-full flex-1 min-h-[200px] resize-none rounded-xl bg-white/[0.02] px-3.5 py-3 text-sm leading-relaxed outline-none ring-1 ring-white/[0.05] focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.04] px-6 py-4">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-xl bg-destructive/[0.045] px-3.5 py-2 text-xs font-semibold text-destructive/78 ring-1 ring-destructive/[0.08] transition hover:bg-destructive/[0.07] hover:text-destructive/85"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete note
        </button>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            Cancel
          </button>
          <button
            disabled={saving || !dirty || duplicateTitle}
            onClick={async () => {
              if (duplicateTitle) {
                toast.error("You already have a note with this title.");
                return;
              }
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateNoteModal({
  onClose,
  onCreate,
  isDuplicateTitle,
  loading,
}: {
  onClose: () => void;
  onCreate: (init: { title: string; content: string; tags: string[]; note_type: NoteType }) => void;
  isDuplicateTitle: (title: string) => boolean;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [content, setContent] = useState("");
  const duplicateTitle = isDuplicateTitle(title);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateTitle) {
      toast.error("You already have a note with this title.");
      return;
    }
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
            placeholder="Note title"
            autoFocus
            className={cn(
              "mt-1.5 block w-full rounded-xl border-0 bg-white/[0.04] px-4 py-2.5 text-sm text-foreground ring-1 transition focus:outline-none",
              duplicateTitle
                ? "ring-destructive/25 focus:ring-destructive/30"
                : "ring-white/[0.06] focus:ring-primary/30",
            )}
          />
          {duplicateTitle && (
            <p className="mt-1.5 text-[11px] text-destructive/85">
              You already have a note with this title.
            </p>
          )}
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
            placeholder={noteContentPlaceholder(noteType)}
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
            disabled={!title.trim() || loading || duplicateTitle}
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

function templateBlockText(block: (typeof NOTE_TEMPLATES)[number]["blocks"][number]): string {
  if (block.type === "ifthen") return `${block.ifText} ${block.thenLabel} ${block.thenText}`;
  return block.text;
}

function templatePreview(template: (typeof NOTE_TEMPLATES)[number]): string {
  if (TEMPLATE_PREVIEWS[template.id]) return TEMPLATE_PREVIEWS[template.id];
  const preview = template.blocks.map(templateBlockText).join(" ").replace(/\s+/g, " ").trim();
  if (preview.length < 20) return "Template details for review.";
  return preview.replace(/\.\.\.$/, "");
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
              className="glow-card interactive-card group flex flex-col justify-between items-start rounded-2xl p-5 text-left"
            >
              <div className="space-y-3 w-full">
                <div className="flex justify-between items-start gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground transition-colors line-clamp-1">
                    {t.title}
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/86 line-clamp-2">
                    {templatePreview(t)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex w-full items-center justify-end text-muted-foreground/70 transition-colors group-hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        {selected && (
          <DialogContent className="rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] max-w-2xl max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">{selected.title}</h2>
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
                    <div
                      key={i}
                      className="space-y-2 rounded-xl bg-white/[0.02] p-4 border border-white/[0.04]"
                    >
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

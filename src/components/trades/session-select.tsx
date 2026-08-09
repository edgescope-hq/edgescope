import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getTradingPreferences,
  updateJournalTrackingPreferences,
} from "@/lib/trading-preferences.functions";
import { listTrades } from "@/lib/trades.functions";
import {
  DEFAULT_JOURNAL_SESSIONS,
  journalPreferencesWithSessions,
  journalSessionsFromPreferences,
  type JournalSession,
} from "@/lib/journal-tracking";
import type { DbTrade } from "@/lib/trade-mappers";
import { cn } from "@/lib/utils";
import { SearchInput } from "@/components/ui/search-input";
import { shouldIgnoreParentDialogClose } from "@/lib/preference-modal-state";

function activeSessions(sessions: JournalSession[], recentSessionIds: string[]) {
  const recent = new Map(recentSessionIds.map((id, index) => [id, index]));
  return sessions
    .filter((session) => !session.archivedAt)
    .sort((a, b) => {
      const aRecent = recent.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRecent = recent.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return (
        aRecent - bRecent ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.label.localeCompare(b.label)
      );
    });
}

export function SessionSelect({
  value,
  onValueChange,
  recentSessionIds = [],
  triggerClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  recentSessionIds?: string[];
  triggerClassName?: string;
}) {
  const getPreferences = useServerFn(getTradingPreferences);
  const { data: preferences } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => getPreferences(),
  });
  const sessions = journalSessionsFromPreferences(preferences?.journal_tracking);
  const options = activeSessions(sessions, recentSessionIds);
  const selected = sessions.find((session) => session.id === value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = options.filter((session) =>
    session.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <div className="min-w-0">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-left text-sm ring-1 ring-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              triggerClassName,
            )}
          >
            <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground/65")}>
              {selected?.label ?? "Select session"}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] rounded-xl border-white/[0.08] bg-popover p-1"
        >
          {options.length > 8 && (
            <SearchInput
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder="Search sessions"
              wrapperClassName="mb-1"
              className="rounded-lg py-2 text-xs"
            />
          )}
          <div className="max-h-40 overflow-y-auto">
            {value && (
              <div className="mb-1 border-b border-white/[0.07] pb-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onValueChange("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground/75 hover:bg-white/[0.06] hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear selection
                </button>
              </div>
            )}
            {filtered.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  onValueChange(session.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none"
              >
                <span className="min-w-0 truncate">{session.label}</span>
                {session.id === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function SessionManagerButton({ label = "Sessions" }: { label?: string }) {
  const qc = useQueryClient();
  const getPreferences = useServerFn(getTradingPreferences);
  const savePreferences = useServerFn(updateJournalTrackingPreferences);
  const listTradesFn = useServerFn(listTrades);
  const { data: preferences } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => getPreferences(),
  });
  const { data: trades = [] } = useQuery({
    queryKey: ["trades"],
    queryFn: () => listTradesFn(),
  });
  const persistedSessions = useMemo(
    () => journalSessionsFromPreferences(preferences?.journal_tracking),
    [preferences?.journal_tracking],
  );
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState(persistedSessions);
  const [search, setSearch] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [removeTarget, setRemoveTarget] = useState<JournalSession | null>(null);
  const nestedConfirmOpenRef = useRef(false);

  useEffect(() => setSessions(persistedSessions), [persistedSessions]);

  const save = useMutation({
    mutationFn: (next: JournalSession[]) =>
      savePreferences({
        data: journalPreferencesWithSessions(preferences?.journal_tracking, next),
      }),
    onSuccess: (row, next) => {
      setSessions(next);
      qc.setQueryData(["trading-preferences"], row);
      toast.success("Sessions saved");
    },
    onError: (error: Error) => {
      setSessions(persistedSessions);
      toast.error(error.message);
    },
  });

  const normalizedNew = newLabel.trim().replace(/\s+/g, " ");
  const duplicateNew = sessions.some(
    (session) => !session.archivedAt && session.label.toLowerCase() === normalizedNew.toLowerCase(),
  );
  const editingSession = sessions.find((session) => session.id === editingId);
  const normalizedEdit = editingLabel.trim().replace(/\s+/g, " ");
  const duplicateEdit = sessions.some(
    (session) =>
      !session.archivedAt &&
      session.id !== editingId &&
      session.label.toLowerCase() === normalizedEdit.toLowerCase(),
  );
  const editDirty = Boolean(editingSession && normalizedEdit !== editingSession.label);
  const canSaveEdit = Boolean(normalizedEdit && editDirty && !duplicateEdit && !save.isPending);
  const usedSessionIds = useMemo(
    () => new Set((trades as DbTrade[]).map((trade) => trade.session).filter(Boolean)),
    [trades],
  );

  const filtered = sessions
    .filter((session) => !session.archivedAt)
    .filter((session) =>
      session.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.label.localeCompare(b.label));

  const commit = (next: JournalSession[]) => {
    setSessions(next);
    save.mutate(next);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingLabel("");
  };
  const saveEdit = () => {
    if (!canSaveEdit || !editingId) return;
    commit(sessions.map((row) => (row.id === editingId ? { ...row, label: normalizedEdit } : row)));
    cancelEdit();
  };
  const isDefault = (id: string) => DEFAULT_JOURNAL_SESSIONS.some((session) => session.id === id);
  const isUsed = (session: JournalSession) =>
    usedSessionIds.has(session.id) || usedSessionIds.has(session.label);
  const closeAndReset = () => {
    setSearch("");
    setNewLabel("");
    cancelEdit();
    setRemoveTarget(null);
    nestedConfirmOpenRef.current = false;
  };
  const finishRemoveConfirmation = () => {
    setRemoveTarget(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        nestedConfirmOpenRef.current = false;
      });
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (shouldIgnoreParentDialogClose(next, nestedConfirmOpenRef.current)) return;
          setOpen(next);
          if (!next) closeAndReset();
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-3 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.07] transition hover:bg-white/[0.07] hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[min(34rem,calc(100vh-2rem))] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Sessions</DialogTitle>
            <DialogDescription>Create and manage session options.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && normalizedNew && !duplicateNew && !save.isPending) {
                  event.preventDefault();
                  const next = [
                    ...sessions,
                    {
                      id: `custom_${crypto.randomUUID()}`,
                      label: normalizedNew,
                      createdAt: new Date().toISOString(),
                      archivedAt: null,
                    },
                  ];
                  setNewLabel("");
                  commit(next);
                }
              }}
              placeholder="New session name"
              maxLength={80}
              className="min-w-0 flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/[0.07] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              disabled={!normalizedNew || duplicateNew || save.isPending}
              onClick={() => {
                const next = [
                  ...sessions,
                  {
                    id: `custom_${crypto.randomUUID()}`,
                    label: normalizedNew,
                    createdAt: new Date().toISOString(),
                    archivedAt: null,
                  },
                ];
                setNewLabel("");
                commit(next);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          {duplicateNew && (
            <p className="text-xs text-warning" role="status">
              That session already exists.
            </p>
          )}
          {sessions.filter((session) => !session.archivedAt).length > 8 && (
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search sessions"
              className="py-2 text-sm"
            />
          )}
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {filtered.map((session) => (
              <div
                key={session.id}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-white/[0.025] px-3 py-2 ring-1 ring-white/[0.05]"
              >
                {editingId === session.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingLabel}
                      maxLength={80}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") cancelEdit();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveEdit();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-lg bg-black/20 px-2 py-1.5 text-sm ring-1 ring-primary/35 focus:outline-none focus:ring-2 focus:ring-primary/45"
                    />
                    <button
                      type="button"
                      disabled={!canSaveEdit}
                      onClick={saveEdit}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{session.label}</span>
                    {!isDefault(session.id) && (
                      <>
                        <button
                          type="button"
                          aria-label={`Rename ${session.label}`}
                          onClick={() => {
                            setEditingId(session.id);
                            setEditingLabel(session.label);
                          }}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${session.label}`}
                          onClick={() => {
                            nestedConfirmOpenRef.current = true;
                            setRemoveTarget(session);
                          }}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(next) => {
          if (!next) finishRemoveConfirmation();
        }}
        title="Remove session?"
        description={
          removeTarget && isUsed(removeTarget)
            ? "This hides the session from future selection. Existing trades keep it."
            : "This removes the unused session."
        }
        confirmLabel="Remove session"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (!removeTarget) return;
          const next = isUsed(removeTarget)
            ? sessions.map((row) =>
                row.id === removeTarget.id ? { ...row, archivedAt: new Date().toISOString() } : row,
              )
            : sessions.filter((row) => row.id !== removeTarget.id);
          commit(next);
          finishRemoveConfirmation();
        }}
      />
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Focus,
  History,
  Lightbulb,
  Plus,
  SearchCheck,
  Sparkles,
  Square,
} from "lucide-react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listTrades } from "@/lib/trades.functions";
import { listTradingAccounts } from "@/lib/trading-accounts.functions";
import {
  buildScopeDiscoveries,
  buildStandardChallenges,
  CONFIDENCE_LABEL,
  type ScopeDiscovery,
  type StandardChallenge,
} from "@/lib/scope-discovery";
import { primaryTradeCategory, realizedR, type DbTrade } from "@/lib/trade-mappers";
import { actualJournalTrades, evidenceOccurrencesForTrades } from "@/lib/evidence-population";
import {
  activateImprovementFocus,
  listImprovementFocuses,
  resolveImprovementFocus,
  type ImprovementFocus,
  type ImprovementOccurrence,
} from "@/lib/improvement.functions";
import {
  IMPROVEMENT_RESOLUTION_LABEL,
  improvementAssessmentCounts,
  type ImprovementResolution,
} from "@/lib/improvement";
import { listPlaybookStandards, type PlaybookStandard } from "@/lib/playbook.functions";
import { cn } from "@/lib/utils";
import { PageHeader, PageShell } from "@/components/ui/premium";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

export const Route = createFileRoute("/_authenticated/edge-discovery")({
  head: () => ({
    meta: [
      { title: "Scope — EdgeScope" },
      {
        name: "description",
        content: "Trader-wide interpretation and one evidence-led improvement focus.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ScopePage,
});

type FocusDraft = {
  origin: "scope" | "trader";
  behavior: string;
  trigger_situation: string;
  intended_behavior: string;
  grounding: string;
  relevant_evidence_definition: string;
  source_discovery_id: string | null;
  source_trade_ids: string[];
};

const EMPTY_FOCUS: FocusDraft = {
  origin: "trader",
  behavior: "",
  trigger_situation: "",
  intended_behavior: "",
  grounding: "Deliberate trader-originated focus.",
  relevant_evidence_definition:
    "Future genuinely relevant situations assessed as Followed, Deviated, or Unassessable.",
  source_discovery_id: null,
  source_trade_ids: [],
};

function ScopePage() {
  const queryClient = useQueryClient();
  const listTradesFn = useServerFn(listTrades);
  const listAccountsFn = useServerFn(listTradingAccounts);
  const listStandardsFn = useServerFn(listPlaybookStandards);
  const listFocusesFn = useServerFn(listImprovementFocuses);
  const activateFocusFn = useServerFn(activateImprovementFocus);
  const resolveFocusFn = useServerFn(resolveImprovementFocus);
  const { data: tradeData } = useSuspenseQuery({
    queryKey: ["trades"],
    queryFn: () => listTradesFn(),
  });
  const { data: accounts = [] } = useSuspenseQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => listAccountsFn(),
  });
  const { data: standardsData } = useSuspenseQuery({
    queryKey: ["playbook-standards"],
    queryFn: () => listStandardsFn(),
  });
  const { data: improvementData } = useSuspenseQuery({
    queryKey: ["improvement-focuses"],
    queryFn: () => listFocusesFn(),
  });

  const trades = useMemo(
    () => actualJournalTrades((tradeData ?? []) as DbTrade[], accounts),
    [accounts, tradeData],
  );
  const standards = useMemo(() => (standardsData ?? []) as PlaybookStandard[], [standardsData]);
  const focuses = improvementData.focuses as ImprovementFocus[];
  const occurrences = improvementData.occurrences as ImprovementOccurrence[];
  const measurementOccurrences = useMemo(
    () => evidenceOccurrencesForTrades(occurrences, trades),
    [occurrences, trades],
  );
  const activeFocus = focuses.find((focus) => focus.state === "active") ?? null;
  const scan = useMemo(() => buildScopeDiscoveries(trades), [trades]);
  const standardChallenges = useMemo(
    () => buildStandardChallenges(trades, standards),
    [trades, standards],
  );
  const [draft, setDraft] = useState<FocusDraft | null>(null);
  const [evidence, setEvidence] = useState<{
    title: string;
    tradeIds: string[];
  } | null>(null);
  const [resolutionOpen, setResolutionOpen] = useState(false);

  const activate = useMutation({
    mutationFn: (next: FocusDraft) => activateFocusFn({ data: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["improvement-focuses"] });
      await queryClient.invalidateQueries({ queryKey: ["active-improvement-focus"] });
      setDraft(null);
      toast.success("Improvement focus activated. Only future relevant situations will assess it.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolve = useMutation({
    mutationFn: (input: {
      resolution: ImprovementResolution | null;
      closure_note: string | null;
    }) =>
      resolveFocusFn({
        data: {
          focus_id: activeFocus!.id,
          resolution: input.resolution,
          closure_note: input.closure_note,
        },
      }),
    onSuccess: async (_row, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["improvement-focuses"] });
      await queryClient.invalidateQueries({ queryKey: ["active-improvement-focus"] });
      setResolutionOpen(false);
      toast.success(
        variables.resolution ? "Focus resolved and added to history." : "Focus stopped.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openCandidate = (discovery: ScopeDiscovery) => {
    const candidate = discovery.focusCandidate;
    if (!candidate || activeFocus) return;
    setDraft({
      origin: "scope",
      behavior: candidate.behavior,
      trigger_situation: candidate.triggerSituation,
      intended_behavior: candidate.intendedBehavior,
      grounding: `${discovery.title}. ${discovery.matchingTradeCount} stored cases were compared with ${discovery.baseline.sampleSize} baseline cases.`,
      relevant_evidence_definition: candidate.evidenceDefinition,
      source_discovery_id: discovery.id,
      source_trade_ids: discovery.matchingTradeIds,
    });
  };

  return (
    <PageShell>
      <div className="w-full max-w-6xl">
        <PageHeader
          icon={Sparkles}
          eyebrow="Trader-wide improvement"
          title="Scope"
          description="Interprets your evidence, challenges weak assumptions, and holds one trader-approved behavioral focus. Scope never changes your Playbook."
        />

        <div className="mt-5 rounded-xl bg-info/[0.055] px-4 py-3 text-xs leading-5 text-muted-foreground ring-1 ring-info/15">
          Scope is trader-wide even when Dashboard, My Trades, or Analytics is showing one Account
          View. It avoids cross-account risk comparisons unless the evidence is normalized within
          the same account. Only actual journal evidence enters Scope; practice, backtest, Paper,
          and unclassified history remain available elsewhere for deliberate inspection.
        </div>

        <section className="mt-6">
          {activeFocus ? (
            <ActiveFocusCard
              focus={activeFocus}
              occurrences={measurementOccurrences.filter(
                (item) => item.focus_id === activeFocus.id,
              )}
              onResolve={() => setResolutionOpen(true)}
            />
          ) : (
            <NoActiveFocus onCreate={() => setDraft({ ...EMPTY_FOCUS })} />
          )}
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <SearchCheck className="h-4 w-4 text-primary" /> Deterministic evidence
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {scan.evidenceTradeCount} trades have result or realized-R evidence ·{" "}
                {scan.rEvidenceCount} have realized R · {scan.reviewedCount} have completed reviews.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              Baseline: {formatPct(scan.baselineWinRate)} · {formatR(scan.baselineAvgR)}
            </div>
          </div>

          {scan.discoveries.length === 0 ? (
            <QuietScope evidenceCount={scan.evidenceTradeCount} />
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {scan.discoveries.map((discovery) => (
                <DiscoveryCard
                  key={discovery.id}
                  discovery={discovery}
                  focusActive={Boolean(activeFocus)}
                  onEvidence={() =>
                    setEvidence({ title: discovery.title, tradeIds: discovery.matchingTradeIds })
                  }
                  onActivate={() => openCandidate(discovery)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <BookOpenCheck className="h-4 w-4 text-primary" /> Current-standard challenges
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              This sibling branch requires an explicit current standard, explicit setup intent,
              trader-assessed adherence, and comparable realized evidence. Category alone cannot
              create a challenge.
            </p>
          </div>
          {standardChallenges.length === 0 ? (
            <div className="surface-card mt-3 rounded-2xl p-5 text-sm text-muted-foreground">
              No evidence-backed challenge to a current Playbook standard. Scope remains uncertain
              when the evidence cannot distinguish trader behavior from the standard itself.
            </div>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {standardChallenges.map((challenge) => (
                <StandardChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onEvidence={() =>
                    setEvidence({ title: challenge.title, tradeIds: challenge.matchingTradeIds })
                  }
                />
              ))}
            </div>
          )}
        </section>

        <FocusHistory focuses={focuses} occurrences={measurementOccurrences} />
      </div>

      <FocusEditor
        draft={draft}
        busy={activate.isPending}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onActivate={() => draft && activate.mutate(draft)}
      />
      <ResolutionDialog
        open={resolutionOpen}
        busy={resolve.isPending}
        onClose={() => setResolutionOpen(false)}
        onResolve={(resolution, note) => resolve.mutate({ resolution, closure_note: note })}
      />
      <EvidenceDialog evidence={evidence} trades={trades} onClose={() => setEvidence(null)} />
    </PageShell>
  );
}

function ActiveFocusCard({
  focus,
  occurrences,
  onResolve,
}: {
  focus: ImprovementFocus;
  occurrences: ImprovementOccurrence[];
  onResolve: () => void;
}) {
  const counts = improvementAssessmentCounts(occurrences);
  return (
    <div className="glow-card rounded-2xl border border-primary/20 p-5 ring-1 ring-primary/10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            <Focus className="h-4 w-4" /> Active improvement focus
          </div>
          <h2 className="mt-2 text-xl font-bold">{focus.behavior}</h2>
          <p className="mt-2 text-sm leading-6 text-foreground/85">
            When <span className="font-semibold">{focus.trigger_situation}</span>, do{" "}
            <span className="font-semibold">{focus.intended_behavior}</span>.
          </p>
          <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">
            {focus.grounding}
          </p>
          <div className="mt-3 rounded-xl bg-white/[0.025] px-3.5 py-3 text-xs leading-5 text-muted-foreground ring-1 ring-white/[0.05]">
            <span className="font-semibold text-foreground/85">Future evidence:</span>{" "}
            {focus.relevant_evidence_definition}
          </div>
        </div>
        <button
          type="button"
          onClick={onResolve}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-foreground ring-1 ring-white/[0.08] hover:bg-white/[0.07]"
        >
          Resolve or stop
        </button>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <AssessmentMetric label="Followed" value={counts.followed} tone="good" />
        <AssessmentMetric label="Deviated" value={counts.deviated} tone="risk" />
        <AssessmentMetric label="Unassessable" value={counts.unassessable} tone="neutral" />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        Activated {new Date(focus.activated_at).toLocaleString()}. Historical grounding does not
        count as subsequent improvement; Unassessable is neutral, and P/L never determines these
        assessments.
      </p>
    </div>
  );
}

function AssessmentMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "risk" | "neutral";
}) {
  return (
    <div className="rounded-xl bg-white/[0.025] px-4 py-3 ring-1 ring-white/[0.05]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          tone === "good" && "text-success",
          tone === "risk" && "text-warning",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function NoActiveFocus({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="glow-card rounded-2xl p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Focus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">No active improvement focus</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Activate one deliberate behavioral change from a Scope candidate below, or define your
              own. EdgeScope recommends; you decide.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
        >
          <Plus className="h-4 w-4" /> Define my own
        </button>
      </div>
    </div>
  );
}

function QuietScope({ evidenceCount }: { evidenceCount: number }) {
  return (
    <div className="surface-card mt-4 rounded-2xl p-6">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h3 className="font-bold">No reliable interpretation to surface</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Scope found no comparison that clears its evidence bar across {evidenceCount} eligible
            trades. A quiet Scope is valid and more trustworthy than a forced insight.
          </p>
        </div>
      </div>
    </div>
  );
}

function DiscoveryCard({
  discovery,
  focusActive,
  onEvidence,
  onActivate,
}: {
  discovery: ScopeDiscovery;
  focusActive: boolean;
  onEvidence: () => void;
  onActivate: () => void;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glow-card flex flex-col rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-white/[0.045] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground ring-1 ring-white/[0.08]">
          {discovery.conditionChips[0]?.label}
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground">
          {CONFIDENCE_LABEL[discovery.confidence]}
        </span>
      </div>
      <h3 className="mt-3 text-base font-bold leading-snug">{discovery.title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{discovery.description}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniMetric label="Cases" value={String(discovery.matchingTradeCount)} />
        <MiniMetric
          label={`Win rate · ${discovery.matchingResultCount}`}
          value={formatPct(discovery.winRate)}
        />
        <MiniMetric label={`Avg R · ${discovery.matchingRCount}`} value={formatR(discovery.avgR)} />
      </div>
      <div className="mt-3 rounded-xl bg-white/[0.025] px-3 py-2.5 text-xs leading-5 text-muted-foreground ring-1 ring-white/[0.05]">
        {discovery.baseline.label}: {discovery.baseline.sampleSize} cases · win rate from{" "}
        {discovery.baseline.resultCount} · R from {discovery.baseline.rCount} ·{" "}
        {formatPct(discovery.baseline.winRate)} · {formatR(discovery.baseline.avgR)}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <button
          type="button"
          onClick={onEvidence}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          Supporting trades <ArrowRight className="h-3.5 w-3.5" />
        </button>
        {discovery.focusCandidate && (
          <button
            type="button"
            disabled={focusActive}
            onClick={onActivate}
            title={focusActive ? "Resolve or stop the active focus first" : undefined}
            className="rounded-xl bg-primary/12 px-3 py-2 text-xs font-semibold text-primary ring-1 ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Review as focus
          </button>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground/75">{discovery.caution}</p>
    </motion.article>
  );
}

function StandardChallengeCard({
  challenge,
  onEvidence,
}: {
  challenge: StandardChallenge;
  onEvidence: () => void;
}) {
  return (
    <article className="glow-card rounded-2xl border border-warning/15 p-5">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-warning">
        <AlertTriangle className="h-4 w-4" /> Standard challenge
      </div>
      <h3 className="mt-2 text-base font-bold">{challenge.title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{challenge.description}</p>
      <div className="mt-3 text-xs text-muted-foreground">
        {challenge.sampleSize} explicitly followed cases · {formatR(challenge.avgR)} average
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={onEvidence} className="text-xs font-semibold text-primary hover:underline">
          Review supporting trades
        </button>
        <Link to="/playbook" className="text-xs font-semibold text-foreground hover:underline">
          Open Playbook
        </Link>
      </div>
    </article>
  );
}

function FocusHistory({
  focuses,
  occurrences,
}: {
  focuses: ImprovementFocus[];
  occurrences: ImprovementOccurrence[];
}) {
  const history = focuses.filter((focus) => focus.state !== "active");
  return (
    <section className="mt-8 pb-8">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <History className="h-4 w-4 text-primary" /> Improvement history
      </h2>
      {history.length === 0 ? (
        <div className="surface-card mt-3 rounded-2xl p-5 text-sm text-muted-foreground">
          Resolved or stopped focuses will remain here with their context and evidence definition.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {history.map((focus) => {
            const focusOccurrences = occurrences.filter((item) => item.focus_id === focus.id);
            const counts = improvementAssessmentCounts(focusOccurrences);
            return (
              <div key={focus.id} className="surface-card rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">{focus.behavior}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      When {focus.trigger_situation}, {focus.intended_behavior}.
                    </p>
                  </div>
                  <span className="rounded-full bg-white/[0.045] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground ring-1 ring-white/[0.08]">
                    {focus.resolution
                      ? IMPROVEMENT_RESOLUTION_LABEL[focus.resolution]
                      : "Stopped without conclusion"}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {focus.grounding} Evidence: {focus.relevant_evidence_definition}
                </p>
                <div className="mt-2 text-[11px] text-muted-foreground/75">
                  {counts.followed} followed · {counts.deviated} deviated · {counts.unassessable}{" "}
                  unassessable · {new Date(focus.activated_at).toLocaleDateString()} –{" "}
                  {focus.closed_at ? new Date(focus.closed_at).toLocaleDateString() : "—"}
                </div>
                {focus.closure_note && (
                  <p className="mt-2 text-xs leading-5 text-foreground/80">{focus.closure_note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FocusEditor({
  draft,
  busy,
  onChange,
  onClose,
  onActivate,
}: {
  draft: FocusDraft | null;
  busy: boolean;
  onChange: (draft: FocusDraft | null) => void;
  onClose: () => void;
  onActivate: () => void;
}) {
  const initialDraftRef = useRef<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  useEffect(() => {
    if (!draft) {
      initialDraftRef.current = null;
      setDiscardOpen(false);
    } else if (initialDraftRef.current === null) {
      initialDraftRef.current = JSON.stringify(draft);
    }
  }, [draft]);
  const dirty = Boolean(
    draft && initialDraftRef.current && JSON.stringify(draft) !== initialDraftRef.current,
  );
  useUnsavedChanges(dirty);
  const requestClose = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };
  if (!draft) return null;
  const valid =
    draft.behavior.trim() &&
    draft.trigger_situation.trim() &&
    draft.intended_behavior.trim() &&
    draft.grounding.trim() &&
    draft.relevant_evidence_definition.trim();
  const field = (
    key: keyof Pick<
      FocusDraft,
      | "behavior"
      | "trigger_situation"
      | "intended_behavior"
      | "grounding"
      | "relevant_evidence_definition"
    >,
    label: string,
    rows = 2,
  ) => (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <textarea
        rows={rows}
        value={draft[key]}
        onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
        className="mt-1.5 w-full resize-none rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm leading-5 ring-1 ring-white/[0.07] focus:outline-none focus:ring-2 focus:ring-primary/35"
      />
    </label>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] p-6">
        <DialogHeader>
          <DialogTitle>Activate one improvement focus</DialogTitle>
        </DialogHeader>
        <p className="text-xs leading-5 text-muted-foreground">
          EdgeScope will only measure genuinely relevant future situations. You remain the decision
          maker, and you can mark ambiguous evidence Unassessable.
        </p>
        <div className="mt-4 space-y-4">
          {field("behavior", "Problem / behavior")}
          {field("trigger_situation", "When this happens")}
          {field("intended_behavior", "Do this instead")}
          {field("grounding", "Why this focus")}
          {field("relevant_evidence_definition", "What future evidence can assess it", 3)}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={requestClose}
            className="rounded-xl px-4 py-2.5 text-sm text-muted-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onActivate}
            disabled={!valid || busy}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? "Activating…" : "Activate focus"}
          </button>
        </div>
        <ConfirmDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title="Discard this improvement focus draft?"
          description="Your changes have not been activated or saved."
          confirmLabel="Discard draft"
          destructive
          onConfirm={() => {
            setDiscardOpen(false);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ResolutionDialog({
  open,
  busy,
  onClose,
  onResolve,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onResolve: (resolution: ImprovementResolution | null, note: string | null) => void;
}) {
  const [resolution, setResolution] = useState<ImprovementResolution | null>(null);
  const [note, setNote] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = open && (resolution !== null || note !== "");
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!open) {
      setResolution(null);
      setNote("");
      setDiscardOpen(false);
    }
  }, [open]);
  const requestClose = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogContent className="max-w-xl rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] p-6">
        <DialogHeader>
          <DialogTitle>Resolve or stop this focus</DialogTitle>
        </DialogHeader>
        <p className="text-xs leading-5 text-muted-foreground">
          Review repeated genuine opportunities, assessability, consistency, recent evidence, and
          context. EdgeScope does not impose one universal occurrence threshold.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(Object.entries(IMPROVEMENT_RESOLUTION_LABEL) as [ImprovementResolution, string][]).map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setResolution(value)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-left text-xs font-semibold ring-1",
                  resolution === value
                    ? "bg-primary/15 text-primary ring-primary/30"
                    : "bg-white/[0.035] text-muted-foreground ring-white/[0.07]",
                )}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Closure context (optional)"
          className="mt-4 w-full resize-none rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm ring-1 ring-white/[0.07] focus:outline-none focus:ring-2 focus:ring-primary/35"
        />
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <button
            disabled={busy}
            onClick={() => onResolve(null, note.trim() || null)}
            className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.07]"
          >
            <Square className="h-3.5 w-3.5" /> Stop without conclusion
          </button>
          <div className="flex gap-2">
            <button onClick={requestClose} className="px-4 py-2.5 text-xs text-muted-foreground">
              Continue focus
            </button>
            <button
              disabled={!resolution || busy}
              onClick={() => resolution && onResolve(resolution, note.trim() || null)}
              className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              Confirm resolution
            </button>
          </div>
        </div>
        <ConfirmDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title="Discard this resolution draft?"
          description="The focus will remain active and your unsaved resolution note will be lost."
          confirmLabel="Discard draft"
          destructive
          onConfirm={() => {
            setDiscardOpen(false);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function EvidenceDialog({
  evidence,
  trades,
  onClose,
}: {
  evidence: { title: string; tradeIds: string[] } | null;
  trades: DbTrade[];
  onClose: () => void;
}) {
  if (!evidence) return null;
  const ids = new Set(evidence.tradeIds);
  const matching = trades.filter((trade) => ids.has(trade.id));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto rounded-2xl border-white/[0.08] bg-[oklch(0.09_0.015_270)] p-6">
        <DialogHeader>
          <DialogTitle>{evidence.title}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Supporting private evidence. Open a trade to inspect its canonical record and Detailed
          Review.
        </p>
        <div className="mt-4 space-y-2">
          {matching.map((trade) => {
            const r = realizedR(trade);
            return (
              <Link
                key={trade.id}
                to="/trades"
                search={{ trade: trade.id }}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white/[0.035] px-3.5 py-3 text-xs ring-1 ring-white/[0.06] hover:bg-white/[0.055]"
              >
                <span className="font-semibold">{trade.instrument || "Unknown instrument"}</span>
                <span className="text-muted-foreground">{trade.trade_date}</span>
                <span className="text-muted-foreground">
                  {trade.direction === "long"
                    ? "Long"
                    : trade.direction === "short"
                      ? "Short"
                      : "Direction unknown"}
                </span>
                <span className="text-muted-foreground">
                  {primaryTradeCategory(trade) ?? "No category"}
                </span>
                <span className="font-semibold tabular-nums">{formatR(r)}</span>
                <span className="ml-auto inline-flex items-center gap-1 font-semibold text-primary">
                  Open review <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.025] px-3 py-2.5 ring-1 ring-white/[0.05]">
      <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function formatPct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(0)}%`;
}

function formatR(value: number | null): string {
  return value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}R`;
}

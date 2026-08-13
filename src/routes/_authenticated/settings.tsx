import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  User,
  Shield,
  Palette,
  Info,
  LogOut,
  Trash2,
  SlidersHorizontal,
  BarChart3,
  BadgePercent,
  BriefcaseBusiness,
  Calculator,
  ClipboardCheck,
  LayoutGrid,
  ListChecks,
  Scale,
  Sigma,
  TrendingUp,
  ChevronDown,
  Lock,
  MoreHorizontal,
} from "lucide-react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EdgeScopeLogo } from "@/components/brand/edgescope-logo";
import {
  cancelAccountDeletion,
  getProfile,
  scheduleAccountDeletion,
  updateProfile,
} from "@/lib/account.functions";
import {
  getTradingPreferences,
  updateJournalPreferences,
  updateAnalyticsPreferences,
} from "@/lib/trading-preferences.functions";
import {
  DEFAULT_REVIEW_REQUIREMENTS,
  type ReviewRequirements,
  requirementsFromPreferences,
} from "@/lib/review-requirements";
import {
  JOURNAL_TRACKING_FIELDS,
  JOURNAL_FIELD_META,
  DEFAULT_JOURNAL_TRACKING,
  DEFAULT_JOURNAL_SESSIONS,
  DEFAULT_SCREENSHOT_SLOT_PREFERENCES,
  TRADE_COMPLETENESS_ELIGIBLE_FIELDS,
  appearsInPlacement,
  journalTrackingWithTradeCompletenessRequirements,
  journalPreferencesWithScreenshotSlots,
  journalPreferencesWithSessions,
  journalTrackingFromPreferences,
  tradeCompletenessRequirementsFromPreferences,
  validateTrackingConfiguration,
  type JournalTrackingConfig,
  type JournalTrackingField,
  type JournalPlacement,
  type TradeCompletenessRequirements,
} from "@/lib/journal-tracking";
import { PageHeader, PageShell } from "@/components/ui/premium";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SessionManagerButton } from "@/components/trades/session-select";
import { ScreenshotSlotSettingsButton } from "@/components/trades/screenshot-slot-settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ANALYTICS_REPORT_GROUPS,
  ANALYTICS_SECTION_DEFINITIONS,
  DEFAULT_ANALYTICS_PREFERENCES,
  DEFAULT_ANALYTICS_SUMMARY_CARDS,
  analyticsPreferencesForStorage,
  analyticsPreferencesFromStored,
  analyticsSectionAvailability,
  setAnalyticsSectionVisible,
  type AnalyticsSectionId,
  type AnalyticsKpiId,
  type AnalyticsPreferences,
} from "@/lib/analytics-sections";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { resetUserSessionCache } from "@/lib/session-cache-boundary";
import { DataExportSection } from "@/components/settings/data-export";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — EdgeScope" },
      {
        name: "description",
        content: "Manage your profile, journal, analytics, appearance, and security.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

type SectionId = "profile" | "journal" | "analytics" | "appearance" | "security" | "about";
type JournalTab = "tracking" | "requirements" | "sessions" | "screenshots";

const ANALYTICS_GROUP_ICONS = {
  overview: BarChart3,
  process_review: ClipboardCheck,
  performance_patterns: TrendingUp,
  trade_context: SlidersHorizontal,
} as const;

const ANALYTICS_KPI_ICONS: Record<AnalyticsKpiId, typeof BarChart3> = {
  total_trades: BriefcaseBusiness,
  win_rate: BadgePercent,
  net_r: Sigma,
  avg_r: Scale,
  completed_reviews: ClipboardCheck,
  profit_factor: Calculator,
};

function Field({
  label,
  value,
  type = "text",
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-1.5 w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] transition-all duration-200 focus:outline-none focus:ring-primary/40 focus:ring-2 disabled:opacity-50"
      />
    </label>
  );
}

function RequirementToggle({
  label,
  description,
  checked,
  onChange,
  required = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  required?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-xl px-4 py-3")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      {required ? (
        <span className="shrink-0 text-xs font-semibold text-primary">Required</span>
      ) : (
        <Switch
          aria-label={`${checked ? "Disable" : "Enable"} ${label} requirement`}
          checked={checked}
          onCheckedChange={onChange}
        />
      )}
    </div>
  );
}

function LockedRequirementRow({ label, onTrack }: { label: string; onTrack: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Field hidden
        </span>
        <button
          type="button"
          onClick={onTrack}
          className="text-xs font-semibold text-primary transition-colors hover:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
        >
          Track field
        </button>
      </span>
    </div>
  );
}

const JOURNAL_FIELD_GROUPS: { label: string; fields: JournalTrackingField[] }[] = [
  {
    label: "Trade details",
    fields: [
      "r_performance",
      "planned_rr",
      "session",
      "category",
      "killzone",
      "grade",
      "entry_model",
      "market_condition",
      "entry_timeframe",
      "news_involvement",
      "custom_tags",
    ],
  },
  {
    label: "Process & review",
    fields: ["emotions", "reasoning", "mistakes", "exit_reason", "trade_management"],
  },
  { label: "Evidence & sharing", fields: ["screenshots", "community"] },
];

function placementLabel(field: JournalTrackingField, placement: JournalPlacement) {
  if (placement === "quick_capture") return "Quick Capture";
  if (placement === "detailed_review") return "Detailed Review";
  if (placement === "both") return "Both";
  return "Hidden";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function SettingsPage() {
  const [active, setActive] = useState<SectionId>("profile");
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (window.location.hash === "#analytics") setActive("analytics");
  }, []);

  const getProfileFn = useServerFn(getProfile);
  const updateProfileFn = useServerFn(updateProfile);
  const scheduleAccountDeletionFn = useServerFn(scheduleAccountDeletion);
  const cancelAccountDeletionFn = useServerFn(cancelAccountDeletion);
  const getTradingPreferencesFn = useServerFn(getTradingPreferences);
  const saveJournalPreferencesFn = useServerFn(updateJournalPreferences);
  const saveAnalyticsPreferencesFn = useServerFn(updateAnalyticsPreferences);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfileFn(),
  });
  const { data: tradingPreferences, isLoading: reviewRequirementsLoading } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => getTradingPreferencesFn(),
  });

  const sections = useMemo(() => {
    const base: { id: SectionId; label: string; icon: typeof User }[] = [
      { id: "profile", label: "Profile", icon: User },
      { id: "journal", label: "Journal preferences", icon: SlidersHorizontal },
      { id: "analytics", label: "Analytics preferences", icon: BarChart3 },
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "security", label: "Security", icon: Shield },
      { id: "about", label: "About", icon: Info },
    ];
    return base;
  }, []);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [providerLabel, setProviderLabel] = useState("Google");
  const [reviewRequirements, setReviewRequirements] = useState<ReviewRequirements>(
    DEFAULT_REVIEW_REQUIREMENTS,
  );
  const [reviewSaveState, setReviewSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [tracking, setTracking] = useState<JournalTrackingConfig>(
    journalTrackingFromPreferences(null),
  );
  const [trackingSaveState, setTrackingSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [tradeCompletenessRequirements, setTradeCompletenessRequirements] =
    useState<TradeCompletenessRequirements>({});
  const [journalTab, setJournalTab] = useState<JournalTab>("tracking");
  const [restoreDefaultsOpen, setRestoreDefaultsOpen] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState<"summary" | "reports">("summary");
  const [analyticsSummaryCards, setAnalyticsSummaryCards] = useState<AnalyticsKpiId[]>(
    DEFAULT_ANALYTICS_PREFERENCES.summaryCards,
  );
  const [analyticsReportHidden, setAnalyticsReportHidden] = useState<AnalyticsSectionId[]>(
    DEFAULT_ANALYTICS_PREFERENCES.hidden,
  );
  const [analyticsRestoreOpen, setAnalyticsRestoreOpen] = useState(false);
  const trackingDraftDirtyRef = useRef(false);
  const requirementsDraftDirtyRef = useRef(false);
  const lastStoredAnalyticsRef = useRef<AnalyticsPreferences>(DEFAULT_ANALYTICS_PREFERENCES);
  const lastStoredProfileRef = useRef({ username: "", displayName: "" });

  useEffect(() => {
    if (!profile) return;
    const stored = {
      username: profile.username ?? "",
      displayName: profile.display_name ?? "",
    };
    const previous = lastStoredProfileRef.current;
    setUsername((current) => (current === previous.username ? stored.username : current));
    setDisplayName((current) => (current === previous.displayName ? stored.displayName : current));
    lastStoredProfileRef.current = stored;
  }, [profile]);

  useEffect(() => {
    if (tradingPreferences === undefined) return;
    const storedReview = requirementsFromPreferences(tradingPreferences);
    const storedTracking = journalTrackingFromPreferences(tradingPreferences?.journal_tracking);
    const storedCompleteness = tradeCompletenessRequirementsFromPreferences(
      tradingPreferences?.journal_tracking,
    );
    if (!requirementsDraftDirtyRef.current) {
      setReviewRequirements(storedReview);
      setTradeCompletenessRequirements(storedCompleteness);
    }
    if (!trackingDraftDirtyRef.current) setTracking(storedTracking);
    const storedAnalytics = analyticsPreferencesFromStored(
      tradingPreferences?.analytics_preferences,
    );
    const previousStored = lastStoredAnalyticsRef.current;
    setAnalyticsSummaryCards((current) =>
      JSON.stringify(current) === JSON.stringify(previousStored.summaryCards)
        ? storedAnalytics.summaryCards
        : current,
    );
    setAnalyticsReportHidden((current) =>
      JSON.stringify([...current].sort()) === JSON.stringify([...previousStored.hidden].sort())
        ? storedAnalytics.hidden
        : current,
    );
    lastStoredAnalyticsRef.current = storedAnalytics;
  }, [tradingPreferences]);

  const saveAnalyticsPreferences = useMutation({
    mutationFn: (tab: "summary" | "reports") => {
      const stored = analyticsPreferencesFromStored(tradingPreferences?.analytics_preferences);
      const next: AnalyticsPreferences =
        tab === "summary"
          ? { ...stored, summaryCards: analyticsSummaryCards }
          : { ...stored, hidden: analyticsReportHidden };
      return saveAnalyticsPreferencesFn({
        data: analyticsPreferencesForStorage(next),
      });
    },
    onSuccess: (row, tab) => {
      qc.setQueryData(["trading-preferences"], row);
      const stored = analyticsPreferencesFromStored(row.analytics_preferences);
      if (tab === "summary") setAnalyticsSummaryCards(stored.summaryCards);
      else setAnalyticsReportHidden(stored.hidden);
      toast.success("Analytics preferences saved");
    },
    onError: () => toast.error("Couldn't save Analytics preferences. Try again."),
  });

  const trackingDirty =
    JSON.stringify(tracking) !==
    JSON.stringify(journalTrackingFromPreferences(tradingPreferences?.journal_tracking));
  const requirementsDirty =
    JSON.stringify(reviewRequirements) !==
      JSON.stringify(requirementsFromPreferences(tradingPreferences)) ||
    JSON.stringify(tradeCompletenessRequirements) !==
      JSON.stringify(
        tradeCompletenessRequirementsFromPreferences(tradingPreferences?.journal_tracking),
      );
  const storedAnalyticsPreferences = analyticsPreferencesFromStored(
    tradingPreferences?.analytics_preferences,
  );
  const analyticsSummaryDirty =
    JSON.stringify(analyticsSummaryCards) !==
    JSON.stringify(storedAnalyticsPreferences.summaryCards);
  const analyticsReportsDirty =
    JSON.stringify([...analyticsReportHidden].sort()) !==
    JSON.stringify([...storedAnalyticsPreferences.hidden].sort());
  const profileDirty = Boolean(
    profile &&
    (username !== (profile.username ?? "") || displayName !== (profile.display_name ?? "")),
  );
  const settingsDirty =
    profileDirty ||
    trackingDirty ||
    requirementsDirty ||
    analyticsSummaryDirty ||
    analyticsReportsDirty;
  useUnsavedChanges(settingsDirty);
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => settingsDirty,
    disabled: !settingsDirty,
    enableBeforeUnload: false,
    withResolver: true,
  });

  const tradeRequirementRow = (field: JournalTrackingField) => {
    const meta = JOURNAL_FIELD_META[field];
    return (
      <RequirementToggle
        key={field}
        label={meta.label}
        checked={tradeCompletenessRequirements[field] === true}
        onChange={(checked) => {
          requirementsDraftDirtyRef.current = true;
          setReviewSaveState("idle");
          setTradeCompletenessRequirements((current) => ({
            ...current,
            [field]: checked,
          }));
        }}
      />
    );
  };

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const providers = data.user?.app_metadata?.providers as string[] | undefined;
        setProviderLabel(providers?.includes("google") ? "Google" : "Google");
      })
      .catch(() => {
        setProviderLabel("Google");
      });
  }, []);

  const saveProfile = useMutation({
    mutationFn: () =>
      updateProfileFn({
        data: { username: username.trim(), display_name: displayName.trim() || null },
      }),
    onSuccess: () => {
      const savedUsername = username.trim();
      const savedDisplayName = displayName.trim();
      setUsername(savedUsername);
      setDisplayName(savedDisplayName);
      qc.setQueryData(["profile"], (current: typeof profile) =>
        current
          ? {
              ...current,
              username: savedUsername,
              display_name: savedDisplayName || null,
              profile_completed: true,
            }
          : current,
      );
      toast.success("Profile saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveReviewRequirements = useMutation({
    mutationFn: () => {
      const issues = validateTrackingConfiguration(
        tracking,
        reviewRequirements,
        tradeCompletenessRequirements,
      );
      if (issues.length) throw new Error(issues[0].message);
      return saveJournalPreferencesFn({
        data: {
          review_require_screenshot: reviewRequirements.screenshot,
          review_require_reasoning: reviewRequirements.reasoning,
          review_require_category: reviewRequirements.category,
          review_require_grade: reviewRequirements.grade,
          review_require_entry_model: reviewRequirements.entry_model,
          review_require_market_condition: reviewRequirements.market_condition,
          review_require_entry_timeframe: reviewRequirements.entry_timeframe,
          review_require_news_involvement: reviewRequirements.news_involvement,
          review_require_exit_reason: reviewRequirements.exit_reason,
          review_require_trade_management: reviewRequirements.trade_management,
          review_require_custom_tags: reviewRequirements.custom_tags,
          journal_tracking: journalTrackingWithTradeCompletenessRequirements(
            tracking,
            tradeCompletenessRequirements,
            tradingPreferences?.journal_tracking,
          ),
        },
      });
    },
    onSuccess: (row) => {
      requirementsDraftDirtyRef.current = false;
      qc.setQueryData(["trading-preferences"], row);
      setReviewSaveState("saved");
      toast.success("Review requirements saved");
    },
    onError: () => {
      setReviewSaveState("error");
      toast.error("Couldn’t save status requirements. Try again.");
    },
  });

  const saveTracking = useMutation({
    mutationFn: () => {
      const issues = validateTrackingConfiguration(
        tracking,
        reviewRequirements,
        tradeCompletenessRequirements,
      );
      if (issues.length) throw new Error(issues[0].message);
      return saveJournalPreferencesFn({
        data: {
          journal_tracking: journalTrackingWithTradeCompletenessRequirements(
            tracking,
            tradeCompletenessRequirements,
            tradingPreferences?.journal_tracking,
          ),
        },
      });
    },
    onSuccess: (row) => {
      trackingDraftDirtyRef.current = false;
      qc.setQueryData(["trading-preferences"], row);
      setTrackingSaveState("saved");
      toast.success("Journal tracking saved");
    },
    onError: () => {
      setTrackingSaveState("error");
      toast.error("Couldn’t save Journal preferences. Try again.");
    },
  });

  const restoreJournalDefaults = useMutation({
    mutationFn: () =>
      saveJournalPreferencesFn({
        data: {
          journal_tracking: journalPreferencesWithSessions(
            journalPreferencesWithScreenshotSlots(
              journalTrackingWithTradeCompletenessRequirements(
                { ...DEFAULT_JOURNAL_TRACKING },
                {},
                tradingPreferences?.journal_tracking,
              ),
              DEFAULT_SCREENSHOT_SLOT_PREFERENCES,
            ),
            [...DEFAULT_JOURNAL_SESSIONS],
          ),
          review_require_screenshot: DEFAULT_REVIEW_REQUIREMENTS.screenshot,
          review_require_reasoning: DEFAULT_REVIEW_REQUIREMENTS.reasoning,
          review_require_category: DEFAULT_REVIEW_REQUIREMENTS.category,
          review_require_grade: DEFAULT_REVIEW_REQUIREMENTS.grade,
          review_require_entry_model: DEFAULT_REVIEW_REQUIREMENTS.entry_model,
          review_require_market_condition: DEFAULT_REVIEW_REQUIREMENTS.market_condition,
          review_require_entry_timeframe: DEFAULT_REVIEW_REQUIREMENTS.entry_timeframe,
          review_require_news_involvement: DEFAULT_REVIEW_REQUIREMENTS.news_involvement,
          review_require_exit_reason: DEFAULT_REVIEW_REQUIREMENTS.exit_reason,
          review_require_trade_management: DEFAULT_REVIEW_REQUIREMENTS.trade_management,
          review_require_custom_tags: DEFAULT_REVIEW_REQUIREMENTS.custom_tags,
        },
      }),
    onSuccess: (row) => {
      trackingDraftDirtyRef.current = false;
      requirementsDraftDirtyRef.current = false;
      qc.setQueryData(["trading-preferences"], row);
      setTracking({ ...DEFAULT_JOURNAL_TRACKING });
      setTradeCompletenessRequirements({});
      setReviewRequirements({ ...DEFAULT_REVIEW_REQUIREMENTS });
      setTrackingSaveState("saved");
      setReviewSaveState("saved");
      setRestoreDefaultsOpen(false);
      toast.success("Journal preferences restored");
    },
    onError: () => toast.error("Couldn’t restore Journal preferences. Try again."),
  });

  const restoreAnalyticsDefaults = useMutation({
    mutationFn: () =>
      saveAnalyticsPreferencesFn({
        data: analyticsPreferencesForStorage({
          ...DEFAULT_ANALYTICS_PREFERENCES,
          summaryCards: [...DEFAULT_ANALYTICS_PREFERENCES.summaryCards],
          hidden: [...DEFAULT_ANALYTICS_PREFERENCES.hidden],
          order: [...DEFAULT_ANALYTICS_PREFERENCES.order],
        }),
      }),
    onSuccess: (row) => {
      qc.setQueryData(["trading-preferences"], row);
      const stored = analyticsPreferencesFromStored(row.analytics_preferences);
      setAnalyticsSummaryCards(stored.summaryCards);
      setAnalyticsReportHidden(stored.hidden);
      setAnalyticsRestoreOpen(false);
      toast.success("Analytics preferences restored");
    },
    onError: () => toast.error("Couldn’t restore Analytics preferences. Try again."),
  });

  const updatePlacement = (field: JournalTrackingField, placement: JournalPlacement) => {
    const next = { ...tracking, [field]: placement };
    const issues = validateTrackingConfiguration(
      next,
      reviewRequirements,
      tradeCompletenessRequirements,
    );
    if (issues.length) {
      setTrackingSaveState("error");
      toast.error(issues[0].message);
      return;
    }
    trackingDraftDirtyRef.current = true;
    setTrackingSaveState("idle");
    setTracking(next);
  };

  const openTrackingField = (field: JournalTrackingField) => {
    setActive("journal");
    setJournalTab("tracking");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const row = document.getElementById(`tracking-field-${field}`);
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        row?.querySelector<HTMLElement>("[role='combobox']")?.focus();
      });
    });
  };

  const scheduleDeletionM = useMutation({
    mutationFn: () => scheduleAccountDeletionFn(),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      setDeleteOpen(false);
      toast.success(
        `Your EdgeScope account is scheduled for permanent deletion on ${formatDate(result.deletion_scheduled_for)}. You can cancel before processing begins.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelDeletionM = useMutation({
    mutationFn: () => cancelAccountDeletionFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Account deletion cancelled. Your EdgeScope account is active again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyEdgeId = async () => {
    const edgeId = (profile as { edge_id?: string | null } | undefined)?.edge_id;
    if (!edgeId) return;
    try {
      await navigator.clipboard.writeText(edgeId);
      toast.success("Edge ID copied");
    } catch {
      /* ignore */
    }
  };

  const performSignOut = async () => {
    setSignOutConfirmOpen(false);
    await resetUserSessionCache(qc);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, ignoreBlocker: true });
  };

  const initial = (displayName || username || "?").charAt(0).toUpperCase();
  const edgeId = (profile as { edge_id?: string | null } | undefined)?.edge_id ?? null;
  const deletionScheduledFor =
    (profile as { deletion_scheduled_for?: string | null } | undefined)?.deletion_scheduled_for ??
    null;

  return (
    <PageShell>
      <PageHeader
        icon={User}
        eyebrow="Workspace"
        title="Settings"
        description="Manage your profile, journal, analytics, appearance, and security."
      />

      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="mt-6 flex w-full items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-sm font-semibold ring-1 ring-white/[0.07] lg:hidden"
          >
            {sections.find((section) => section.id === active)?.label}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="border-white/[0.08] bg-background">
          <DrawerHeader>
            <DrawerTitle>Settings</DrawerTitle>
          </DrawerHeader>
          <div className="grid gap-1 px-4 pb-6">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <DrawerClose asChild key={section.id}>
                  <button
                    type="button"
                    onClick={() => setActive(section.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium",
                      active === section.id
                        ? "bg-primary/12 text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                </DrawerClose>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="glow-card sticky top-6 hidden h-fit rounded-2xl p-1.5 lg:block">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="glow-card rounded-2xl p-6">
          {active === "profile" && (
            <div>
              <h2 className="text-lg font-bold">Profile</h2>
              <div className="mt-5 flex items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-xl font-bold text-primary-foreground shadow-[var(--shadow-glow)]">
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {profile?.display_name || profile?.username || (isLoading ? "Loading..." : "—")}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {profile?.email ?? ""}
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Display name"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Only you see this"
                />
                <Field
                  label="Username"
                  value={username}
                  onChange={setUsername}
                  placeholder="trader_handle"
                />
                <Field label="Email" value={profile?.email ?? ""} type="email" disabled />
                <Field label="Sign-in method" value={providerLabel} disabled />
                {edgeId && (
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      EdgeScope ID
                    </span>
                    <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm ring-1 ring-white/[0.06]">
                      <span className="tabular-nums">{edgeId}</span>
                      <button
                        type="button"
                        onClick={copyEdgeId}
                        className="ml-auto rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground"
                      >
                        Copy
                      </button>
                    </div>
                  </label>
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => saveProfile.mutate()}
                  disabled={saveProfile.isPending || username.trim().length < 3}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
                >
                  {saveProfile.isPending ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          )}

          {active === "journal" && (
            <div className="mb-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold">Journal preferences</h2>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Journal preference actions"
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground ring-1 ring-white/[0.07] hover:bg-white/[0.04] hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRestoreDefaultsOpen(true)}>
                      Restore defaults
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-4 grid max-w-4xl grid-cols-2 gap-2 xl:grid-cols-4">
                {(
                  [
                    ["tracking", "Tracking fields", "Fields"],
                    ["requirements", "Status requirements", "Status"],
                    ["sessions", "Sessions", "Sessions"],
                    ["screenshots", "Screenshots", "Screenshots"],
                  ] as const
                ).map(([value, label, compactLabel]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setJournalTab(value)}
                    className={cn(
                      "min-h-11 rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                      journalTab === value
                        ? "bg-primary/14 text-foreground ring-primary/25"
                        : "bg-white/[0.025] text-muted-foreground ring-white/[0.06] hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    <span className="sm:hidden">{compactLabel}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {active === "journal" && journalTab === "tracking" && (
            <div>
              {reviewRequirementsLoading ? (
                <div
                  className="mt-5 h-48 animate-pulse rounded-xl bg-white/[0.035]"
                  aria-label="Loading journal tracking"
                />
              ) : (
                <div className="mt-6 max-w-4xl space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Choose where each field appears when capturing and reviewing trades.
                  </p>
                  {JOURNAL_FIELD_GROUPS.map((group) => (
                    <section
                      key={group.label}
                      className="overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]"
                    >
                      <h3 className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        {group.label}
                      </h3>
                      <div className="divide-y divide-white/[0.06]">
                        {group.fields.map((field) => {
                          const meta = JOURNAL_FIELD_META[field];
                          return (
                            <div
                              key={field}
                              id={`tracking-field-${field}`}
                              className="flex items-center justify-between gap-4 px-4 py-3.5"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{meta.label}</span>
                                {meta.description ? (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {meta.description}
                                  </span>
                                ) : null}
                              </span>
                              <Select
                                value={tracking[field]}
                                onValueChange={(value) =>
                                  updatePlacement(field, value as JournalPlacement)
                                }
                              >
                                <SelectTrigger className="h-8 w-[9.75rem] shrink-0 rounded-lg px-2.5 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {meta.allowed.map((placement) => (
                                    <SelectItem key={placement} value={placement}>
                                      {placementLabel(field, placement)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {trackingSaveState === "error" ? "Could not save tracking. Try again." : ""}
                </p>
                <button
                  type="button"
                  onClick={() => saveTracking.mutate()}
                  disabled={reviewRequirementsLoading || saveTracking.isPending || !trackingDirty}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
                >
                  {saveTracking.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {active === "journal" && journalTab === "requirements" && (
            <div>
              {reviewRequirementsLoading ? (
                <div className="mt-4 space-y-2" aria-label="Loading review requirements">
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="h-12 animate-pulse rounded-xl bg-white/[0.035]" />
                  ))}
                </div>
              ) : (
                <div className="mt-6 grid max-w-4xl gap-4 xl:grid-cols-2">
                  <section className="overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]">
                    <div className="border-b border-white/[0.06] px-4 py-3">
                      <h3 className="text-sm font-semibold">Trade completeness</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Choose what a trade needs before it can move beyond Incomplete.
                      </p>
                    </div>
                    <div className="divide-y divide-white/[0.06]">
                      {appearsInPlacement(tracking, "r_performance", "quick_capture") ? (
                        <RequirementToggle label="Risk & P/L" checked required />
                      ) : tracking.r_performance === "hidden" ? (
                        <LockedRequirementRow
                          label="Risk & P/L"
                          onTrack={() => openTrackingField("r_performance")}
                        />
                      ) : null}
                      {TRADE_COMPLETENESS_ELIGIBLE_FIELDS.map((field) =>
                        appearsInPlacement(tracking, field, "quick_capture") ? (
                          tradeRequirementRow(field)
                        ) : tracking[field] === "hidden" ? (
                          <LockedRequirementRow
                            key={field}
                            label={JOURNAL_FIELD_META[field].label}
                            onTrack={() => openTrackingField(field)}
                          />
                        ) : null,
                      )}
                    </div>
                  </section>
                  <section className="overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]">
                    <div className="border-b border-white/[0.06] px-4 py-3">
                      <h3 className="text-sm font-semibold">Review completion</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Choose what is required before a trade is marked Reviewed.
                      </p>
                    </div>
                    <div className="divide-y divide-white/[0.06]">
                      {(
                        [
                          ["screenshot", "screenshots", "Trade screenshot"],
                          ["reasoning", "reasoning", "Trade reasoning"],
                          ["category", "category", "Category"],
                          ["grade", "grade", "Trade grade"],
                        ] as const
                      ).map(([requirement, field, label]) =>
                        appearsInPlacement(tracking, field, "detailed_review") ? (
                          <RequirementToggle
                            key={requirement}
                            label={label}
                            checked={reviewRequirements[requirement]}
                            onChange={(checked) => {
                              requirementsDraftDirtyRef.current = true;
                              setReviewSaveState("idle");
                              setReviewRequirements((current) => ({
                                ...current,
                                [requirement]: checked,
                              }));
                            }}
                          />
                        ) : tracking[field] === "hidden" ? (
                          <LockedRequirementRow
                            key={requirement}
                            label={label}
                            onTrack={() => openTrackingField(field)}
                          />
                        ) : null,
                      )}
                      {JOURNAL_TRACKING_FIELDS.filter(
                        (field) => JOURNAL_FIELD_META[field].reviewable,
                      ).map((field) => {
                        const meta = JOURNAL_FIELD_META[field];
                        return appearsInPlacement(tracking, field, "detailed_review") ? (
                          <RequirementToggle
                            key={field}
                            label={meta.label}
                            checked={reviewRequirements[field as keyof ReviewRequirements]}
                            onChange={(checked) => {
                              requirementsDraftDirtyRef.current = true;
                              setReviewSaveState("idle");
                              setReviewRequirements((current) => ({
                                ...current,
                                [field]: checked,
                              }));
                            }}
                          />
                        ) : tracking[field] === "hidden" ? (
                          <LockedRequirementRow
                            key={field}
                            label={meta.label}
                            onTrack={() => openTrackingField(field)}
                          />
                        ) : null;
                      })}
                    </div>
                  </section>
                </div>
              )}
              {!reviewRequirementsLoading && (
                <div className="mt-4 flex max-w-4xl items-start gap-2 rounded-xl bg-primary/[0.035] px-3.5 py-3 text-xs leading-5 text-muted-foreground ring-1 ring-primary/10">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  These rules apply going forward. Trades already marked Reviewed stay Reviewed.
                </div>
              )}
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p aria-live="polite" className="text-xs text-destructive">
                  {reviewSaveState === "error" ? "Could not save requirements. Try again." : ""}
                </p>
                <button
                  type="button"
                  onClick={() => saveReviewRequirements.mutate()}
                  disabled={
                    reviewRequirementsLoading ||
                    saveReviewRequirements.isPending ||
                    !requirementsDirty
                  }
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 disabled:opacity-50"
                >
                  {saveReviewRequirements.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {active === "journal" && journalTab === "sessions" && (
            <div className="mt-6 max-w-4xl">
              <p className="text-sm text-muted-foreground">
                Maintain the reusable market sessions available in capture and review.
              </p>
              <div className="mt-4 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.06]">
                <SessionManagerButton label="Sessions" />
              </div>
            </div>
          )}

          {active === "journal" && journalTab === "screenshots" && (
            <div className="mt-6 max-w-4xl">
              <p className="text-sm text-muted-foreground">
                Choose the screenshot slots used to organize trade evidence.
              </p>
              <div className="mt-4 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.06]">
                <ScreenshotSlotSettingsButton label="Screenshots" />
              </div>
            </div>
          )}

          {active === "analytics" && (
            <div id="analytics">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Analytics preferences</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose the summary and report sections shown in Analytics.
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Analytics preference actions"
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground ring-1 ring-white/[0.07] hover:bg-white/[0.04] hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setAnalyticsRestoreOpen(true)}>
                      Restore defaults
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-5 inline-flex rounded-xl bg-white/[0.035] p-1 ring-1 ring-white/[0.07]">
                {(
                  [
                    ["summary", "Summary cards", LayoutGrid],
                    ["reports", "Report sections", ListChecks],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setAnalyticsTab(value as "summary" | "reports")}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                      analyticsTab === value
                        ? "bg-primary/[0.14] text-foreground ring-1 ring-primary/20"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {String(label)}
                  </button>
                ))}
              </div>
              {analyticsTab === "summary" && (
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Choose the KPI cards that appear above Analytics reports.
                    </p>
                  </div>
                  <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]">
                    {DEFAULT_ANALYTICS_SUMMARY_CARDS.map((id) => {
                      const Icon = ANALYTICS_KPI_ICONS[id];
                      const names: Record<AnalyticsKpiId, string> = {
                        total_trades: "Total Trades",
                        win_rate: "Win Rate",
                        net_r: "Net R",
                        avg_r: "Avg R",
                        completed_reviews: "Completed Reviews",
                        profit_factor: "Profit Factor",
                      };
                      const enabled =
                        id !== "net_r" && id !== "avg_r"
                          ? true
                          : tracking.r_performance !== "hidden";
                      const selected = analyticsSummaryCards.includes(id);
                      return (
                        <div key={id} className="flex items-center justify-between gap-3 px-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary ring-1 ring-primary/12">
                              <Icon className="size-3.5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{names[id]}</p>
                              {!enabled && (
                                <p className="text-xs text-muted-foreground">Risk & P/L hidden</p>
                              )}
                            </div>
                          </div>
                          {enabled ? (
                            <Switch
                              aria-label={`Show ${names[id]}`}
                              checked={selected}
                              onCheckedChange={(checked) =>
                                setAnalyticsSummaryCards((current) =>
                                  checked
                                    ? [...new Set([...current, id])].slice(0, 5)
                                    : current.filter((item) => item !== id),
                                )
                              }
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => openTrackingField("r_performance")}
                              className="flex items-center gap-1.5 text-xs font-semibold text-primary"
                            >
                              <Lock className="h-3.5 w-3.5" /> Track Risk & P/L to enable
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {analyticsTab === "reports" && (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <p className="text-xs text-muted-foreground xl:col-span-2">
                    Reports become available when their related journal fields are tracked.
                  </p>
                  {ANALYTICS_REPORT_GROUPS.map((group) => {
                    const GroupIcon = ANALYTICS_GROUP_ICONS[group.id];
                    const sections = ANALYTICS_SECTION_DEFINITIONS.filter(
                      (section) => section.group === group.id,
                    );
                    return (
                      <section
                        key={group.id}
                        className="overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/[0.08] text-primary">
                            <GroupIcon className="size-3.5" aria-hidden="true" />
                          </span>
                          <h3 className="text-sm font-semibold">{group.label}</h3>
                        </div>
                        <div className="divide-y divide-white/[0.06]">
                          {sections.map((section) => {
                            const availability = analyticsSectionAvailability(
                              section.id,
                              tracking,
                              tracking.r_performance !== "hidden",
                            );
                            const dependencyField: JournalTrackingField =
                              availability.reason === "R Performance disabled" ||
                              !section.trackingField
                                ? "r_performance"
                                : section.trackingField;
                            const visible = !analyticsReportHidden.includes(section.id);
                            return (
                              <div key={section.id} className="flex items-center gap-3 px-3 py-2.5">
                                <div
                                  className="min-w-0 flex-1"
                                  title={
                                    availability.available
                                      ? undefined
                                      : "Track this field in Journal preferences to enable this report."
                                  }
                                >
                                  <p className="text-sm font-medium">{section.label}</p>
                                </div>
                                {availability.available ? (
                                  <Switch
                                    aria-label={`Show ${section.label}`}
                                    checked={visible}
                                    onCheckedChange={(checked) =>
                                      setAnalyticsReportHidden(
                                        (current) =>
                                          setAnalyticsSectionVisible(
                                            {
                                              ...storedAnalyticsPreferences,
                                              hidden: current,
                                            },
                                            section.id,
                                            checked,
                                          ).hidden,
                                      )
                                    }
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openTrackingField(dependencyField)}
                                    className="flex max-w-44 items-center gap-1.5 text-right text-xs font-semibold text-primary"
                                  >
                                    <Lock className="h-3.5 w-3.5 shrink-0" />
                                    {`Track ${JOURNAL_FIELD_META[dependencyField].label} to enable`}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  disabled={
                    !(analyticsTab === "summary" ? analyticsSummaryDirty : analyticsReportsDirty) ||
                    saveAnalyticsPreferences.isPending
                  }
                  onClick={() => saveAnalyticsPreferences.mutate(analyticsTab)}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
                >
                  {saveAnalyticsPreferences.isPending ? "Saving..." : "Save Analytics preferences"}
                </button>
              </div>
            </div>
          )}

          {active === "appearance" && (
            <div>
              <h2 className="text-lg font-bold">Appearance</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-4 ring-1 ring-primary/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Dark theme</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Active theme for EdgeScope.
                      </div>
                    </div>
                    <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary ring-1 ring-primary/25">
                      Active
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-primary/12 bg-primary/[0.025] p-4 ring-1 ring-primary/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground/80">Light theme</div>
                      <div className="mt-1 text-xs text-muted-foreground">Not available yet.</div>
                    </div>
                    <span className="rounded-full bg-primary/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary ring-1 ring-primary/20">
                      Coming soon
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {active === "security" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold">Security</h2>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <div className="text-sm font-semibold">Google sign-in</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  EdgeScope uses Google sign-in only. Manage password and recovery settings in your
                  Google account.
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Sign out</div>
                    <div className="text-xs text-muted-foreground">
                      End your session on this device.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      settingsDirty ? setSignOutConfirmOpen(true) : void performSignOut()
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/[0.045] px-3.5 py-2 text-xs font-semibold text-destructive/78 ring-1 ring-destructive/[0.08] transition hover:bg-destructive/[0.07] hover:text-destructive/85"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              </div>
              <DataExportSection />
              <div className="rounded-2xl bg-destructive/[0.01] p-5 ring-1 ring-destructive/[0.06]">
                <div className="flex flex-wrap items-center justify-between gap-5">
                  <div>
                    <div className="text-sm font-semibold text-destructive/78">
                      Delete EdgeScope account
                    </div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      {deletionScheduledFor
                        ? `Permanent account deletion is scheduled for ${formatDate(deletionScheduledFor)}. You can cancel before processing begins.`
                        : "Schedule permanent deletion of your login, profile, trades, reviews, screenshots, Playbook, and private improvement data after a 15-day grace period."}
                    </div>
                  </div>
                  {deletionScheduledFor ? (
                    <button
                      type="button"
                      onClick={() => cancelDeletionM.mutate()}
                      disabled={cancelDeletionM.isPending}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-foreground ring-1 ring-white/[0.08] transition hover:bg-white/[0.1] disabled:opacity-50"
                    >
                      Don't delete my account
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirmText("");
                        setDeleteOpen(true);
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-destructive/[0.045] px-3.5 py-2 text-xs font-semibold text-destructive/78 ring-1 ring-destructive/[0.08] transition hover:bg-destructive/[0.07] hover:text-destructive/85"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete EdgeScope account
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {active === "about" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">About</h2>
              <div className="rounded-xl bg-white/[0.03] p-5 ring-1 ring-white/[0.06]">
                <div className="flex flex-col items-start gap-3">
                  <EdgeScopeLogo tone="light" className="h-14 w-auto object-contain" />
                  <div className="text-xs text-muted-foreground">Version 1.0.0</div>
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-5 ring-1 ring-white/[0.06]">
                <h3 className="text-sm font-semibold">Legal</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { to: "/terms", label: "Terms of Service" },
                    { to: "/privacy", label: "Privacy Policy" },
                    { to: "/disclaimer", label: "Trading Disclaimer" },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="rounded-xl bg-white/[0.035] px-3.5 py-2 text-xs font-semibold text-foreground ring-1 ring-white/[0.06] transition hover:bg-white/[0.055] hover:ring-white/[0.12]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {deleteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md"
          onClick={() => !scheduleDeletionM.isPending && setDeleteOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
            className="glow-card w-full max-w-lg rounded-2xl p-6"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/[0.045] text-destructive/75 ring-1 ring-destructive/[0.08]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Request EdgeScope account deletion?</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  This schedules permanent deletion after a 15-day grace period unless you cancel.
                  After the grace period, EdgeScope removes your authentication account, private
                  core records, and stored screenshots.
                </p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Type DELETE to confirm
              </span>
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                className="mt-1.5 w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-destructive/25"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={scheduleDeletionM.isPending}
                className="rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] transition hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => scheduleDeletionM.mutate()}
                disabled={deleteConfirmText !== "DELETE" || scheduleDeletionM.isPending}
                className="rounded-xl bg-destructive/[0.48] px-5 py-2.5 text-sm font-semibold text-destructive-foreground ring-1 ring-destructive/[0.14] transition hover:bg-destructive/[0.62] disabled:opacity-45"
              >
                {scheduleDeletionM.isPending ? "Scheduling..." : "Request account deletion"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      <ConfirmDialog
        open={navigationBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && navigationBlocker.status === "blocked") navigationBlocker.reset();
        }}
        title="Leave Settings without saving?"
        description="Your unsaved profile or preference changes will be discarded."
        confirmLabel="Leave without saving"
        destructive
        onConfirm={() => {
          if (navigationBlocker.status === "blocked") navigationBlocker.proceed();
        }}
      />
      <ConfirmDialog
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        title="Sign out with unsaved settings?"
        description="Signing out will discard your unsaved profile or preference changes."
        confirmLabel="Discard and sign out"
        destructive
        onConfirm={() => void performSignOut()}
      />
      <ConfirmDialog
        open={restoreDefaultsOpen}
        onOpenChange={setRestoreDefaultsOpen}
        title="Restore Journal Preferences defaults?"
        description="Existing trades and screenshots will not change."
        confirmLabel="Restore defaults"
        loading={restoreJournalDefaults.isPending}
        onConfirm={() => restoreJournalDefaults.mutate()}
      />
      <ConfirmDialog
        open={analyticsRestoreOpen}
        onOpenChange={setAnalyticsRestoreOpen}
        title="Restore Analytics defaults?"
        description="Existing trades and screenshots are unchanged. This immediately restores canonical Analytics defaults."
        confirmLabel="Restore defaults"
        loading={restoreAnalyticsDefaults.isPending}
        onConfirm={() => restoreAnalyticsDefaults.mutate()}
      />
    </PageShell>
  );
}

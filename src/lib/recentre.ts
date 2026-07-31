export const RECENTRE_STATES = [
  {
    id: "fear",
    label: "Fear",
    cardDescription: "Previous outcomes are making a qualified decision feel unsafe.",
    whatMayBeHappening:
      "A previous loss, fear of being wrong, or fear of another negative result may be affecting how the current setup is judged.",
    pain: ["Losing money", "Being wrong", "Repeating a negative outcome"],
    behaviours: [
      "Hesitating on a qualified setup",
      "Exiting without a planned reason",
      "Skipping a valid trade because of the previous result",
      "Letting the previous trade control the next decision",
    ],
    returnToProcess: [
      "Judge the current qualified setup by the same rules as before the previous outcome.",
      "Check the setup and invalidation once.",
      "Take or skip it by the plan.",
    ],
  },
  {
    id: "greed",
    label: "Greed",
    cardDescription: "You want more profit, risk or trades than your plan allows.",
    whatMayBeHappening:
      "Recent profit or excitement may be making the existing plan feel insufficient.",
    pain: [
      "Feeling that enough profit is not enough",
      "Leaving more money on the table",
      "Ending while still feeling successful",
    ],
    behaviours: [
      "Increasing risk",
      "Taking unnecessary extra trades",
      "Holding beyond the planned exit",
      "Lowering standards after wins",
    ],
    returnToProcess: [
      "Keep the same risk, trade limit and entry requirements after a gain.",
      "Respect the existing exit and session limits.",
      "Let the plan define enough.",
    ],
  },
  {
    id: "fomo",
    label: "FOMO",
    cardDescription: "You feel pressure to act before an opportunity disappears.",
    whatMayBeHappening:
      "Watching price move without participation may be creating pressure to act.",
    pain: [
      "Missing an opportunity",
      "Watching a move continue without participation",
      "Feeling left behind",
    ],
    behaviours: [
      "Chasing",
      "Entering late",
      "Acting before confirmation",
      "Lowering setup standards",
    ],
    returnToProcess: [
      "A missed opportunity does not justify a late or unqualified entry.",
      "Check whether the original setup still exists.",
      "Wait for the next prepared opportunity.",
    ],
  },
  {
    id: "hope",
    label: "Hope",
    cardDescription: "You are avoiding acceptance that a trade or idea may be invalid.",
    whatMayBeHappening:
      "The trader may be avoiding acceptance that a trade or idea reached its predefined invalidation.",
    pain: ["Accepting that the trade is wrong", "Accepting a loss", "Closing an invalid position"],
    behaviours: [
      "Moving the stop",
      "Holding beyond invalidation",
      "Ignoring evidence against the trade",
      "Waiting for the market to rescue the position",
    ],
    returnToProcess: [
      "Let invalidation and exit rules matter more than attachment to the trade idea.",
      "Do not renegotiate after entry.",
      "Follow the predefined exit rule.",
    ],
  },
  {
    id: "revenge",
    label: "Revenge",
    cardDescription: "You want the next trade to repair the previous loss.",
    whatMayBeHappening: "The next trade may feel like a way to erase or repair the previous loss.",
    pain: ["Accepting the previous loss", "Feeling defeated", "Ending with a negative result"],
    behaviours: [
      "Immediate re-entry",
      "Increasing size",
      "Lowering setup quality",
      "Trying to recover money quickly",
    ],
    returnToProcess: [
      "Treat the next trade as a separate decision, not a way to repair the previous loss.",
      "Create distance before evaluating another setup.",
      "Return to normal risk and entry standards.",
    ],
  },
  {
    id: "doubt",
    label: "Doubt",
    cardDescription:
      "You are repeatedly second-guessing a decision that should be judged by your rules.",
    whatMayBeHappening: "Uncertainty may be causing the trader to repeatedly reopen a decision.",
    pain: ["Uncertainty", "Being wrong", "Taking responsibility for a decision"],
    behaviours: [
      "Repeatedly changing bias",
      "Second-guessing a qualified setup",
      "Entering late after hesitation",
      "Seeking excessive confirmation",
    ],
    returnToProcess: [
      "Once the checklist is complete, judge the decision by process rather than certainty.",
      "Deliberately take or skip it.",
      "Stop renegotiating after the decision is made.",
    ],
  },
] as const;

export type RecentreStateId = (typeof RECENTRE_STATES)[number]["id"];
export type RecentreState = (typeof RECENTRE_STATES)[number];

export type RecentreSceneId =
  | "default"
  | "meditation"
  | "fear"
  | "greed"
  | "fomo"
  | "hope"
  | "revenge"
  | "doubt"
  | "himalaya-misty"
  | "himalaya-lake";

type RecentreScene = {
  id: RecentreSceneId;
  label: string;
  image: string;
  thumbnail: string;
  audio: string;
};

type RecentreSceneAssets = {
  image: string;
  thumbnail: string;
  audio: string;
};

export const ALL_SCENES: Record<
  Exclude<RecentreSceneId, "default">,
  { label: string; image: string; thumbnail: string; audio: string }
> = {
  meditation: {
    label: "Meditation forest",
    image: "/reset/reset-space-background.webp",
    thumbnail: "/reset/recentre-meditation-thumb.webp",
    audio: "/reset/reset-space-ambient.mp3",
  },
  fear: {
    label: "Fear",
    image: "/reset/recentre-fear.webp",
    thumbnail: "/reset/recentre-fear-thumb.webp",
    audio: "/reset/reset-space-ambient.mp3",
  },
  greed: {
    label: "Greed",
    image: "/reset/recentre-greed.webp",
    thumbnail: "/reset/recentre-greed-thumb.webp",
    audio: "/reset/recentre-gentle-water-loop.mp3",
  },
  fomo: {
    label: "FOMO",
    image: "/reset/recentre-fomo.webp",
    thumbnail: "/reset/recentre-fomo-thumb.webp",
    audio: "/reset/recentre-fomo-gentle-waves-loop.mp3",
  },
  hope: {
    label: "Hope",
    image: "/reset/recentre-hope.webp",
    thumbnail: "/reset/recentre-hope-thumb.webp",
    audio: "/reset/Hope and revenge.mp3",
  },
  revenge: {
    label: "Revenge",
    image: "/reset/recentre-revenge.webp",
    thumbnail: "/reset/recentre-revenge-thumb.webp",
    audio: "/reset/Hope and revenge.mp3",
  },
  doubt: {
    label: "Doubt",
    image: "/reset/recentre-doubt.webp",
    thumbnail: "/reset/recentre-doubt-thumb.webp",
    audio: "/reset/reset-space-ambient.mp3",
  },
  "himalaya-misty": {
    label: "Misty Himalayan valley",
    image: "/reset/recentre-himalaya-misty.webp",
    thumbnail: "/reset/recentre-himalaya-misty-thumb.webp",
    audio: "/reset/reset-space-ambient.mp3",
  },
  "himalaya-lake": {
    label: "Himalayan mountain lake",
    image: "/reset/recentre-himalaya-lake.webp",
    thumbnail: "/reset/recentre-himalaya-lake-thumb.webp",
    audio: "/reset/recentre-gentle-water-loop.mp3",
  },
};

const DEFAULT_SCENE_MAP: Record<
  RecentreStateId | "meditation",
  Exclude<RecentreSceneId, "default">
> = {
  meditation: "meditation",
  fear: "fear",
  greed: "greed",
  fomo: "fomo",
  hope: "hope",
  revenge: "revenge",
  doubt: "doubt",
};

const DEFAULT_SCENES: Record<RecentreStateId | "meditation", RecentreSceneAssets> = {
  meditation: {
    image: ALL_SCENES.meditation.image,
    thumbnail: ALL_SCENES.meditation.thumbnail,
    audio: ALL_SCENES.meditation.audio,
  },
  fear: {
    image: ALL_SCENES.fear.image,
    thumbnail: ALL_SCENES.fear.thumbnail,
    audio: ALL_SCENES.fear.audio,
  },
  greed: {
    image: ALL_SCENES.greed.image,
    thumbnail: ALL_SCENES.greed.thumbnail,
    audio: ALL_SCENES.greed.audio,
  },
  fomo: {
    image: ALL_SCENES.fomo.image,
    thumbnail: ALL_SCENES.fomo.thumbnail,
    audio: ALL_SCENES.fomo.audio,
  },
  hope: {
    image: ALL_SCENES.hope.image,
    thumbnail: ALL_SCENES.hope.thumbnail,
    audio: ALL_SCENES.hope.audio,
  },
  revenge: {
    image: ALL_SCENES.revenge.image,
    thumbnail: ALL_SCENES.revenge.thumbnail,
    audio: ALL_SCENES.revenge.audio,
  },
  doubt: {
    image: ALL_SCENES.doubt.image,
    thumbnail: ALL_SCENES.doubt.thumbnail,
    audio: ALL_SCENES.doubt.audio,
  },
};

export function getRecentreScene(
  sceneId: RecentreSceneId,
  stateId?: RecentreStateId,
): RecentreScene {
  if (sceneId === "default") {
    const assets = DEFAULT_SCENES[stateId ?? "meditation"];
    return { id: "default", label: "Default", ...assets };
  }
  const scene = ALL_SCENES[sceneId];
  return {
    id: sceneId,
    label: scene.label,
    image: scene.image,
    thumbnail: scene.thumbnail,
    audio: scene.audio,
  };
}

export function getDefaultSceneId(stateId?: RecentreStateId): Exclude<RecentreSceneId, "default"> {
  return DEFAULT_SCENE_MAP[stateId ?? "meditation"];
}

export function isRecentreStateId(value: unknown): value is RecentreStateId {
  return typeof value === "string" && RECENTRE_STATES.some((state) => state.id === value);
}

export function getRecentreState(id: RecentreStateId) {
  return RECENTRE_STATES.find((state) => state.id === id)!;
}

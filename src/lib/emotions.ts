// Shared emoji emotion taxonomy used in quick-capture and the trade review screen.
// Stored in trades.emotion_tags (text[]).

export type EmotionTag = {
  key: string;
  emoji: string;
  label: string;
};

export const EMOTIONS: EmotionTag[] = [
  { key: "confident", emoji: "😀", label: "Confident" },
  { key: "calm", emoji: "😌", label: "Calm" },
  { key: "neutral", emoji: "😐", label: "Neutral" },
  { key: "nervous", emoji: "😰", label: "Nervous" },
  { key: "frustrated", emoji: "😡", label: "Frustrated" },
  { key: "tired", emoji: "😴", label: "Tired" },
  { key: "excited", emoji: "🤩", label: "Excited" },
  { key: "focused", emoji: "😎", label: "Focused" },
  { key: "confused", emoji: "😵", label: "Confused" },
  { key: "fearful", emoji: "😔", label: "Fearful" },
];

/** The current Quick Capture vocabulary. Legacy keys remain above so old trades stay readable. */
export const QUICK_CAPTURE_EMOTIONS = EMOTIONS.filter(
  (emotion) => emotion.key !== "confused" && emotion.key !== "fearful",
);

export function emotionByKey(key: string): EmotionTag | undefined {
  return EMOTIONS.find((e) => e.key === key);
}

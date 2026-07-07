export type TemplateBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "ifthen"; ifText: string; thenLabel: string; thenText: string };

export type NoteTemplate = {
  id: string;
  title: string;
  note_type: "setup" | "lesson" | "review" | "general";
  tags: string[];
  blocks: TemplateBlock[];
};

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "trading-in-the-zone",
    title: "Trading in the Zone",
    note_type: "lesson",
    tags: ["mindset"],
    blocks: [
      {
        type: "paragraph",
        text: "Edge is statistical. Outcomes are random in the short term. Trust the process, not the result.",
      },
    ],
  },
  {
    id: "if-then-cheat-sheet",
    title: "IF/THEN Cheat Sheet",
    note_type: "setup",
    tags: ["rules", "cheat-sheet"],
    blocks: [
      {
        type: "ifthen",
        ifText: "IF performance is profitable but results are inconsistent",
        thenLabel: "THEN tighten discipline:",
        thenText: "fewer trades, shorter window, hard stop after max loss.",
      },
      {
        type: "ifthen",
        ifText: "IF win rate is high but Avg R is low",
        thenLabel: "THEN stop cutting winners:",
        thenText: "reduce early exits, delay partials, hold to planned TP more.",
      },
      {
        type: "ifthen",
        ifText: "IF win rate is low but Avg R is strong",
        thenLabel: "THEN improve selectivity:",
        thenText: "trade only with HTF bias + best POIs, filter harder.",
      },
      {
        type: "ifthen",
        ifText: "IF risk deviation is high (consistency low)",
        thenLabel: "THEN standardize sizing:",
        thenText: "baseline risk locked, A = 0.5%, A+ = 1%, no size-up after losses.",
      },
      {
        type: "ifthen",
        ifText: "IF rule violations are frequent (discipline low)",
        thenLabel: "THEN change environment:",
        thenText: "stricter guardrails, auto shutdown, no-trade windows around news.",
      },
      {
        type: "ifthen",
        ifText: "IF losses cluster in a specific time/session",
        thenLabel: "THEN restrict timing:",
        thenText: "remove that session or allow only A+ setups there.",
      },
    ],
  },
  {
    id: "only-patterns-you-should-spot",
    title: "The Only Patterns You Should Spot",
    note_type: "lesson",
    tags: ["review", "patterns"],
    blocks: [
      { type: "heading", text: "Technicals" },
      { type: "paragraph", text: "mapping process issues" },
      { type: "paragraph", text: "entry criteria / exit criteria issues" },
      { type: "paragraph", text: "example: “This entry model doesn’t work in this condition.”" },

      { type: "heading", text: "Timing" },
      { type: "paragraph", text: "session or time-of-day performance differences" },
      {
        type: "paragraph",
        text: "example: “Most of my trades fail in London but work in New York.”",
      },

      { type: "heading", text: "Emotional" },
      { type: "paragraph", text: "repeated behavior triggers" },
      { type: "paragraph", text: "example: “I revenge trade after a losing streak.”" },

      { type: "heading", text: "Risk" },
      { type: "paragraph", text: "inconsistent sizing patterns" },
      { type: "paragraph", text: "example: “I size up after a few wins in a row.”" },

      { type: "heading", text: "Trade management" },
      { type: "paragraph", text: "how you manage winners/losers" },
      {
        type: "paragraph",
        text: "example: “Trailing isn’t working for me. Next quarter I’ll test set-and-forget or a different management method.”",
      },

      { type: "heading", text: "Execution quality (process/compliance)" },
      { type: "paragraph", text: "You’re taking the right setup, but executing it poorly." },
      {
        type: "paragraph",
        text: "Examples: entering early, moving SL emotionally, not placing orders cleanly, breaking your own checklist, not waiting for confirmation even though the plan says you must.",
      },

      { type: "heading", text: "Environment / context" },
      { type: "paragraph", text: "External conditions that change performance." },
      {
        type: "paragraph",
        text: "Examples: trading high-impact news when you shouldn’t, trading when tired/stressed, trading outside your defined window, market conditions such as choppy vs trending, liquidity conditions such as holiday weeks or low volume.",
      },

      {
        type: "paragraph",
        text: "Once you’ve found the repeating patterns, your job is to turn each pattern into a solution.",
      },
      { type: "paragraph", text: "Pattern = the problem. Rule = the fix." },
      {
        type: "paragraph",
        text: "And here’s the key: no more than 1 to 3 changes per quarter.",
      },
      {
        type: "paragraph",
        text: "If you change too many variables at once, you create chaos and you’ll never know what actually caused improvement.",
      },

      { type: "heading", text: "Keep it simple" },
      { type: "paragraph", text: "1–2 rules to stop the biggest leak." },
      { type: "paragraph", text: "1 rule to amplify what’s working." },

      {
        type: "paragraph",
        text: "That’s how you refine like a scientist, not react like a gambler.",
      },
    ],
  },
];

/** Flatten template blocks into plain text for duplication into a user note. */
export function templateToPlainText(t: NoteTemplate): string {
  const lines: string[] = [];
  for (const b of t.blocks) {
    if (b.type === "heading") {
      lines.push("", b.text, "");
    } else if (b.type === "paragraph") {
      lines.push(b.text);
    } else {
      lines.push("", b.ifText, `${b.thenLabel} ${b.thenText}`, "");
    }
  }
  return lines.join("\n").trim() + "\n";
}

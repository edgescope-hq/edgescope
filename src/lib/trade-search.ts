export type TradeSearchRow = {
  num: number;
  instrument: string;
  category: string;
  tradeDate: string;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

const MONTHS = [
  ["jan", "january"],
  ["feb", "february"],
  ["mar", "march"],
  ["apr", "april"],
  ["may"],
  ["jun", "june"],
  ["jul", "july"],
  ["aug", "august"],
  ["sep", "sept", "september"],
  ["oct", "october"],
  ["nov", "november"],
  ["dec", "december"],
] as const;

function parseStoredDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function monthFromToken(token: string): number | null {
  const normalized = token.toLocaleLowerCase().replace(/[.,]/g, "");
  const index = MONTHS.findIndex((aliases) =>
    aliases.some((alias) => alias === normalized || alias.startsWith(normalized)),
  );
  return normalized.length >= 3 && index >= 0 ? index + 1 : null;
}

function matchesNumericDate(parts: DateParts, query: string): boolean {
  if (query.length === 4) {
    return String(parts.year) === query;
  }

  if (query.length <= 2) {
    const queryNum = Number(query);
    return parts.day === queryNum || parts.month === queryNum;
  }

  return String(parts.year).startsWith(query);
}

function matchesFormattedDate(parts: DateParts, query: string): boolean {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(query);
  if (iso) {
    return (
      parts.year === Number(iso[1]) &&
      parts.month === Number(iso[2]) &&
      parts.day === Number(iso[3])
    );
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(query);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    return (
      parts.year === year &&
      ((parts.month === first && parts.day === second) ||
        (parts.day === first && parts.month === second))
    );
  }

  const tokens = query.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const monthToken = tokens.find((token) => monthFromToken(token) !== null);
  if (!monthToken) return false;
  const month = monthFromToken(monthToken);
  const numericTokens = tokens
    .filter((token) => token !== monthToken && /^\d+$/.test(token))
    .map(Number);
  const day = numericTokens.find((number) => number >= 1 && number <= 31);
  const year = numericTokens.find((number) => number >= 1000);
  return (
    parts.month === month &&
    (day === undefined || parts.day === day) &&
    (year === undefined || parts.year === year)
  );
}

export function matchesTradeSearch(row: TradeSearchRow, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query || query === "#") return true;

  if (query.startsWith("#")) {
    const tradeNumber = query.slice(1).trim();
    return /^\d+$/.test(tradeNumber) && String(row.num).startsWith(tradeNumber);
  }

  const date = parseStoredDate(row.tradeDate);
  if (/^\d+$/.test(query)) {
    return date ? matchesNumericDate(date, query) : false;
  }

  const tokens = query.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const textTokens = tokens.filter(
    (t) =>
      monthFromToken(t) === null &&
      !/^\d+$/.test(t) &&
      !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t) &&
      !/^\d{4}-\d{1,2}-\d{1,2}$/.test(t),
  );
  const textQuery = textTokens.join(" ");

  const compactQuery = textQuery.replace(/\s+/g, "");
  const matchesText =
    textTokens.length === 0 ||
    [row.instrument, row.category].some((value) =>
      value.toLocaleLowerCase().replace(/\s+/g, "").includes(compactQuery),
    );

  if (date && matchesFormattedDate(date, query)) return matchesText;

  // Fallback to strict text matching if date doesn't match
  const fullCompactQuery = query.replace(/\s+/g, "");
  return [row.instrument, row.category].some((value) =>
    value.toLocaleLowerCase().replace(/\s+/g, "").includes(fullCompactQuery),
  );
}

export type TradeSearchSuggestion = {
  value: string;
  label: string;
  detail: string;
};

export function formatTradeDateKey(dateKey: string): string {
  const parts = parseStoredDate(dateKey);
  if (!parts) return dateKey;
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function tradeSearchSuggestions(
  rows: readonly TradeSearchRow[],
  rawQuery: string,
  limit = 8,
): TradeSearchSuggestion[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];
  if (query.startsWith("#")) {
    const digits = query.slice(1).trim();
    if (digits && !/^\d+$/.test(digits)) return [];
    return [...rows]
      .filter((row) => !digits || String(row.num).startsWith(digits))
      .sort((a, b) => {
        const aExact = String(a.num) === digits ? 1 : 0;
        const bExact = String(b.num) === digits ? 1 : 0;
        return bExact - aExact || b.num - a.num;
      })
      .slice(0, limit)
      .map((row) => ({
        value: `#${row.num}`,
        label: `#${row.num}`,
        detail: `${row.instrument || "—"} · ${formatTradeDateKey(row.tradeDate)}`,
      }));
  }

  const compactQuery = query.replace(/\s+/g, "");
  const candidates = rows.flatMap((row) => {
    const date = parseStoredDate(row.tradeDate);
    const dateMatches = date
      ? /^\d+$/.test(query)
        ? matchesNumericDate(date, query)
        : matchesFormattedDate(date, query)
      : false;
    return [
      { value: row.instrument.trim(), detail: "Instrument", matches: false },
      { value: row.category.trim(), detail: "Category", matches: false },
      { value: formatTradeDateKey(row.tradeDate), detail: "Date", matches: dateMatches },
    ];
  });
  const seen = new Set<string>();
  return candidates
    .filter(({ value, matches }) => {
      const key = value.toLocaleLowerCase();
      if (
        !value ||
        seen.has(key) ||
        (!matches && !key.replace(/\s+/g, "").includes(compactQuery))
      ) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aExact = a.value.toLocaleLowerCase().replace(/\s+/g, "") === compactQuery ? 1 : 0;
      const bExact = b.value.toLocaleLowerCase().replace(/\s+/g, "") === compactQuery ? 1 : 0;
      return bExact - aExact || a.value.localeCompare(b.value);
    })
    .slice(0, limit)
    .map(({ value, detail }) => ({ value, label: value, detail }));
}

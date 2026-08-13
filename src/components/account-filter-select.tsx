import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  evidencePopulationLabel,
  journalEvidencePopulationForAccountType,
} from "@/lib/evidence-population";

type AccountOption = {
  id: string;
  name: string;
  account_type?: string | null;
  created_at?: string;
  status?: string;
};

function accountOptionLabel(account: AccountOption): string {
  const population = journalEvidencePopulationForAccountType(account.account_type);
  const populationContext =
    population === "practice" || population === "research" || population === "unknown"
      ? ` · ${evidencePopulationLabel(population)}`
      : "";
  const archiveContext = account.status === "archived" ? " · Archived" : "";
  return `${account.name}${populationContext}${archiveContext}`;
}

export function AccountFilterSelect({
  accounts,
  value,
  onValueChange,
  allLabel = "All accounts",
}: {
  accounts: readonly AccountOption[];
  value: string;
  onValueChange: (value: string) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedAccount = accounts.find((account) => account.id === value);
  const selectedName =
    value === "ALL" ? allLabel : selectedAccount ? accountOptionLabel(selectedAccount) : "Account";
  const orderedAccounts = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .filter((account) =>
          account.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
        ),
    [accounts, query],
  );
  const choose = (next: string) => {
    onValueChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account View: ${selectedName}`}
          title={`Account View: ${selectedName}`}
          className="flex h-9 w-[min(13rem,calc(100vw-2rem))] min-w-0 items-center gap-2 rounded-xl bg-white/[0.04] px-3 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left [mask-image:linear-gradient(to_right,#000_calc(100%-1rem),transparent)]">
            {selectedName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="w-[min(17rem,calc(100vw-2rem))] overflow-hidden p-1.5"
      >
        {accounts.length > 8 && (
          <label className="mb-1.5 flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2 ring-1 ring-white/[0.06]">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search accounts"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
        <div className="max-h-44 overflow-y-auto">
          <AccountOptionRow
            active={value === "ALL"}
            label={allLabel}
            onClick={() => choose("ALL")}
          />
          {orderedAccounts.map((account) => (
            <AccountOptionRow
              key={account.id}
              active={value === account.id}
              label={accountOptionLabel(account)}
              onClick={() => choose(account.id)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountOptionRow({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={label}
      className="flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ClearTextButton } from "@/components/ui/search-input";

const controlClass =
  "mt-1.5 flex min-h-10 w-full items-center rounded-xl bg-white/[0.04] px-3 py-2.5 text-left text-sm ring-1 ring-white/[0.06] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function DarkSelect({
  value,
  options,
  placeholder,
  onValueChange,
  searchable = false,
}: {
  value: string;
  options: readonly string[];
  placeholder: string;
  onValueChange: (value: string) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedOptions = useMemo(() => {
    const current =
      value && !options.some((option) => option.toLowerCase() === value.toLowerCase());
    return current ? [value, ...options] : [...options];
  }, [options, value]);
  const filtered = normalizedOptions.filter((option) =>
    option.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={cn(controlClass, "justify-between gap-2")}>
          <span className={cn("min-w-0 truncate", !value && "text-muted-foreground/65")}>
            {value || placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] rounded-xl border-white/[0.08] bg-popover p-1"
      >
        {searchable && (
          <div className="relative mb-1">
            <input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              aria-label={`Search ${placeholder.toLowerCase()}`}
              className="w-full rounded-lg bg-white/[0.04] py-2 pl-2.5 pr-9 text-xs ring-1 ring-white/[0.07] focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <ClearTextButton
              value={search}
              onClear={() => setSearch("")}
              inputRef={searchRef}
              className="right-1 h-6 w-6"
            />
          </div>
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
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onValueChange(option);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:bg-white/[0.06] focus-visible:text-foreground focus-visible:outline-none"
            >
              <span className="min-w-0 truncate">{option}</span>
              {value === option && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CreatableCombobox({

  value,
  suggestions,
  placeholder,
  onValueChange,
}: {
  value: string;
  suggestions: readonly string[];
  placeholder: string;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent | globalThis.TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);
  const normalized = value.trim().toLowerCase();
  const options = useMemo(() => {
    if (!normalized) return [];
    const seen = new Set<string>();
    return suggestions
      .filter((option) => {
      const key = option.trim().toLowerCase();
      if (!key || seen.has(key) || !key.includes(normalized)) return false;
      seen.add(key);
      return true;
      })
      .sort((a, b) => {
        const aExact = a.trim().toLowerCase() === normalized ? 1 : 0;
        const bExact = b.trim().toLowerCase() === normalized ? 1 : 0;
        return bExact - aExact || a.localeCompare(b);
      })
      .slice(0, 8);
  }, [normalized, suggestions]);

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative mt-1.5">
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && options.length > 0}
          placeholder={placeholder}
          className="w-full rounded-xl bg-white/[0.04] py-2.5 pl-3 pr-10 text-sm ring-1 ring-white/[0.06] placeholder:text-muted-foreground/55 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <ClearTextButton
          value={value}
          onClear={() => {
            onValueChange("");
            setOpen(true);
          }}
          inputRef={inputRef}
        />
      </div>
      {open && options.length > 0 && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 max-h-40 w-full overflow-y-auto rounded-xl bg-popover p-1 shadow-[var(--shadow-elevated)] ring-1 ring-white/[0.09]"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option.toLowerCase() === normalized}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onValueChange(option);
                setOpen(false);
              }}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:bg-white/[0.06] focus-visible:text-foreground focus-visible:outline-none"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TagInput({
  values,
  suggestions,
  onChange,
}: {
  values: string[];
  suggestions: readonly string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const value = raw.trim();
    if (!value || values.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft("");
  };
  const available = suggestions.filter(
    (option) =>
      draft.trim() &&
      option.toLowerCase().includes(draft.trim().toLowerCase()) &&
      !values.some((value) => value.toLowerCase() === option.toLowerCase()),
  );

  return (
    <div className="relative mt-1.5">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl bg-white/[0.04] px-2.5 py-2 ring-1 ring-white/[0.06] focus-within:ring-2 focus-within:ring-primary/40">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/12 px-2 py-1 text-xs text-foreground ring-1 ring-primary/20"
          >
            <span className="truncate">{value}</span>
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
              className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            }
            if (event.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          placeholder={values.length ? "" : "Add tags"}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground/40"
        />
      </div>
      {available.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-40 w-full overflow-y-auto rounded-xl bg-popover p-1 shadow-[var(--shadow-elevated)] ring-1 ring-white/[0.09]">
          {available.slice(0, 8).map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(option)}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}




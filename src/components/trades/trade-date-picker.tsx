import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  boundedCalendarYears,
  formatDateKey,
  initialCalendarStartYear,
  parseDateKey,
} from "@/lib/trade-date-picker";

export function TradeDatePicker({
  value,
  onChange,
  earliestTradeYear,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  earliestTradeYear?: number;
  className?: string;
}) {
  const today = useMemo(() => new Date(), []);
  const selected = useMemo(() => parseDateKey(value), [value]);
  const currentYear = today.getFullYear();
  const initialStartYear = initialCalendarStartYear({
    earliestTradeYear,
    selectedYear: selected?.getFullYear(),
    currentYear,
  });
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => selected ?? today);
  const [headerMenu, setHeaderMenu] = useState<"month" | "year" | null>(null);
  const [startYear, setStartYear] = useState(initialStartYear);
  const years = boundedCalendarYears(startYear, currentYear);

  const openPicker = (next: boolean) => {
    if (next) {
      setMonth(selected ?? today);
      setStartYear(
        initialCalendarStartYear({
          earliestTradeYear,
          selectedYear: selected?.getFullYear(),
          currentYear,
        }),
      );
      setHeaderMenu(null);
    }
    setOpen(next);
  };

  const moveMonth = (offset: number) => {
    setMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      if (offset < 0 && next.getFullYear() < startYear) setStartYear(next.getFullYear());
      return next > today ? current : next;
    });
  };

  return (
    <Popover open={open} onOpenChange={openPicker}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5 text-left text-sm ring-1 ring-white/[0.06] transition focus:outline-none focus:ring-2 focus:ring-primary/40",
            !selected && "text-muted-foreground/65",
            className,
          )}
        >
          <span>
            {selected
              ? selected.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Select date"}
          </span>
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        collisionPadding={16}
        onEscapeKeyDown={(event) => {
          if (headerMenu) {
            event.preventDefault();
            setHeaderMenu(null);
          }
        }}
        className="w-[min(20.5rem,calc(100vw-2rem))] max-h-[min(28rem,calc(100vh-2rem))] overflow-hidden rounded-xl border-white/[0.08] bg-popover p-2 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-center justify-between gap-1 px-1 pb-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => moveMonth(-1)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={headerMenu === "month"}
              onClick={() => setHeaderMenu((current) => (current === "month" ? null : "month"))}
              className="rounded-lg px-2 py-1 text-sm font-semibold transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            >
              {month.toLocaleDateString("en-US", { month: "long" })}
              <ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-expanded={headerMenu === "year"}
              onClick={() => setHeaderMenu((current) => (current === "year" ? null : "year"))}
              className="rounded-lg px-2 py-1 text-sm font-semibold transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            >
              {month.getFullYear()}
              <ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            aria-label="Next month"
            disabled={
              month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth()
            }
            onClick={() => moveMonth(1)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="relative">
          <Calendar
            mode="single"
            hideNavigation
            month={month}
            onMonthChange={setMonth}
            showOutsideDays={false}
            selected={selected}
            disabled={{ after: today }}
            onSelect={(date) => {
              if (!date) return;
              onChange(formatDateKey(date));
              setOpen(false);
            }}
            captionLayout="label"
            startMonth={new Date(startYear, 0, 1)}
            endMonth={today}
            className="p-1 [--cell-size:1.9rem] [&_.rdp-month_caption]:hidden"
            initialFocus
          />

          {headerMenu === "month" && (
            <div
              aria-label="Choose month"
              className="absolute left-9 top-0 z-10 w-36 rounded-xl border border-white/[0.08] bg-popover p-1 shadow-[var(--shadow-elevated)]"
            >
              <div className="max-h-60 space-y-0.5 overflow-y-auto">
                {Array.from({ length: 12 }, (_, index) => {
                  const future = month.getFullYear() === currentYear && index > today.getMonth();
                  const selectedMonth = month.getMonth() === index;
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={future}
                      aria-pressed={selectedMonth}
                      onClick={() => {
                        setMonth(new Date(month.getFullYear(), index, 1));
                        setHeaderMenu(null);
                      }}
                      className={cn(
                        "flex min-h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-xs font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:opacity-35",
                        selectedMonth && "bg-primary/12 text-foreground",
                      )}
                    >
                      {new Date(2000, index, 1).toLocaleDateString("en-US", { month: "long" })}
                      {selectedMonth && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {headerMenu === "year" && (
            <div
              aria-label="Choose year"
              className="absolute left-1/2 top-0 z-10 w-28 -translate-x-1/2 rounded-xl border border-white/[0.08] bg-popover p-1 shadow-[var(--shadow-elevated)]"
            >
              <div className="max-h-[11.25rem] space-y-0.5 overflow-y-auto">
                {years.map((year) => {
                  const selectedYear = month.getFullYear() === year;
                  return (
                    <button
                      key={year}
                      type="button"
                      aria-pressed={selectedYear}
                      onClick={() => {
                        setMonth(
                          new Date(
                            year,
                            year === currentYear
                              ? Math.min(month.getMonth(), today.getMonth())
                              : month.getMonth(),
                            1,
                          ),
                        );
                        setHeaderMenu(null);
                      }}
                      className={cn(
                        "flex min-h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-xs font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                        selectedYear && "bg-primary/12 text-foreground",
                      )}
                    >
                      {year}
                      {selectedYear && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useRef } from "react";
import type { InputHTMLAttributes, RefObject } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClearTextButton({
  value,
  onClear,
  inputRef,
  className,
}: {
  value: string;
  onClear: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  if (!value) return null;
  return (
    <button
      type="button"
      aria-label="Clear search"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onClear();
        requestAnimationFrame(() => inputRef?.current?.focus());
      }}
      className={cn(
        "absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
        className,
      )}
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

export function SearchInput({
  value,
  onValueChange,
  className,
  wrapperClassName,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "w-full rounded-xl bg-white/[0.04] py-2.5 pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 ring-1 ring-white/[0.06] transition focus:outline-none focus:ring-2 focus:ring-primary/40",
          className,
        )}
        {...props}
      />
      <ClearTextButton value={value} onClear={() => onValueChange("")} inputRef={inputRef} />
    </div>
  );
}

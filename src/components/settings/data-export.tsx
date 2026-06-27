import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { exportMyData } from "@/lib/export.functions";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function DataExportSection() {
  const fetchExport = useServerFn(exportMyData);
  const [busy, setBusy] = useState<"csv" | "json" | null>(null);

  async function run(format: "csv" | "json") {
    setBusy(format);
    try {
      const data = await fetchExport();
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "json") {
        download(`edge-journal-export-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
      } else {
        const csv = toCSV(data.trades as Record<string, unknown>[]);
        download(`edge-journal-trades-${stamp}.csv`, csv, "text/csv");
      }
      toast.success(`Exported ${data.trades.length} trades`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 border-t border-white/[0.06] pt-6">
      <h3 className="text-base font-bold">Data Export</h3>
      <p className="text-xs text-muted-foreground">Download a complete copy of your trade data.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => run("csv")}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-semibold ring-1 ring-white/[0.06] transition-all duration-200 hover:bg-white/[0.08] hover:ring-white/[0.1] disabled:opacity-50"
        >
          {busy === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export CSV
        </button>
        <button
          onClick={() => run("json")}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:brightness-110 disabled:opacity-50"
        >
          {busy === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export JSON
        </button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground/60">
        CSV contains your trades. JSON contains trades, screenshot metadata, and sticky notes.
      </p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type AssetClass } from "@/lib/assetClass";
import { toast } from "sonner";

const API = "http://localhost:8080";
const HIDDEN = "••••••";

interface ReconstructedPoint {
  period: string; // YYYY-MM
  date: string;
  total_value_brl: number;
  total_pnl_brl: number;
  partial: boolean;
}

interface PortfolioReconstructionChartProps {
  hideValues?: boolean;
  /** Restrict the reconstructed series to these asset classes (matches the squares). */
  assetFilter?: Set<AssetClass>;
}

// Reconstructed monthly portfolio value + P&L, backfilled from transaction dates
// and the monthly close prices in history_tickers. Complements the snapshot-based
// evolution chart, which can only show history from the first snapshot onward.
export function PortfolioReconstructionChart({
  hideValues,
  assetFilter,
}: PortfolioReconstructionChartProps) {
  const [points, setPoints] = useState<ReconstructedPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Serialized, stable class list so the fetch re-runs when the filter changes.
  const classesParam = useMemo(
    () => (assetFilter ? [...assetFilter].sort().join(",") : ""),
    [assetFilter],
  );

  const load = useCallback(() => {
    setLoading(true);
    const url = classesParam
      ? `${API}/portfolio/history?classes=${encodeURIComponent(classesParam)}`
      : `${API}/portfolio/history`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setPoints(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to load reconstruction", err))
      .finally(() => setLoading(false));
  }, [classesParam]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBackfill = useCallback(async () => {
    setBackfilling(true);
    const toastId = toast.loading("Backfilling price history...", {
      description: "Fetching monthly history for every symbol + USD/BRL.",
    });
    try {
      const res = await fetch(`${API}/portfolio/history/backfill`, {
        method: "POST",
      });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as {
          symbols_synced?: number;
          symbols_failed?: number;
        } | null;
        toast.success("History backfilled", {
          id: toastId,
          description: `Synced ${body?.symbols_synced ?? 0} symbol(s)${
            body?.symbols_failed ? `, ${body.symbols_failed} failed` : ""
          }.`,
        });
        load();
      } else {
        toast.error("Backfill failed", {
          id: toastId,
          description: "Could not fetch history. Try again later.",
        });
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setBackfilling(false);
    }
  }, [load]);

  const chartData = useMemo(() => {
    return points.map((p) => {
      const [year, month] = p.period.split("-");
      return {
        label: `${month}/${year.slice(2)}`,
        fullLabel: `${month}/${year}`,
        value: p.total_value_brl,
        pnl: p.total_pnl_brl,
        partial: p.partial,
      };
    });
  }, [points]);

  const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="w-full text-left space-y-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? "Collapse reconstructed history"
            : "Expand reconstructed history"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Reconstructed history
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {chartData.length > 0
              ? `${chartData.length} month${chartData.length === 1 ? "" : "s"}`
              : "No data"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </span>
        </div>
        {!expanded && latest != null && (
          <p className="text-sm text-muted-foreground tabular-nums">
            Latest: {hideValues ? HIDDEN : formatCurrency(latest.value, "BRL")}
          </p>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Monthly value &amp; P&amp;L reconstructed from your orders. Fixed
              balances are excluded. P&amp;L counts the BRL actually paid at each
              purchase's exchange rate, so it includes currency moves and may
              differ from the card above.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => void handleBackfill()}
              disabled={backfilling}
            >
              <RefreshCw
                className={`mr-1 h-3.5 w-3.5 ${backfilling ? "animate-spin" : ""}`}
              />
              {backfilling ? "Backfilling..." : "Backfill history"}
            </Button>
          </div>

          {loading ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              Loading history...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground border border-dashed rounded-lg">
              <p>No reconstructed history yet.</p>
              <p className="text-xs">
                Click “Backfill history” to fetch monthly prices for your
                symbols.
              </p>
            </div>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    yAxisId="value"
                    tick={{ fontSize: 12 }}
                    width={80}
                    tickFormatter={(v: number) =>
                      hideValues ? "••" : formatCurrency(v, "BRL")
                    }
                  />
                  <YAxis
                    yAxisId="pnl"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    width={80}
                    tickFormatter={(v: number) =>
                      hideValues ? "••" : formatCurrency(v, "BRL")
                    }
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      const n =
                        typeof value === "number" ? value : Number(value);
                      // `name` is already the Line's display name ("Total (BRL)" /
                      // "P&L (BRL)") — keep it instead of re-deriving it wrongly.
                      return [
                        hideValues
                          ? HIDDEN
                          : formatCurrency(Number.isFinite(n) ? n : 0, "BRL"),
                        name,
                      ];
                    }}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as
                        | { fullLabel?: string; partial?: boolean }
                        | undefined;
                      return `${row?.fullLabel ?? ""}${row?.partial ? " (partial)" : ""}`;
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="value"
                    type="monotone"
                    dataKey="value"
                    name="Total (BRL)"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    yAxisId="pnl"
                    type="monotone"
                    dataKey="pnl"
                    name="P&L (BRL)"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

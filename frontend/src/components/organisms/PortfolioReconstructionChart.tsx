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
import { ChevronDown, History, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type AssetClass } from "@/lib/assetClass";
import { toast } from "sonner";

const API = "http://localhost:8080";
const HIDDEN = "••••••";

// Prevision (forecast) tuning: fit the compound monthly growth over the most
// recent FIT_WINDOW months and extend the curve FORECAST_HORIZON months ahead.
// TARGET is the milestone we report an ETA for.
const FIT_WINDOW = 12;
const FORECAST_HORIZON = 12;
const TARGET = 1_000_000;

// addMonths advances a "YYYY-MM" period by `delta` months (UTC-safe).
function addMonths(period: string, delta: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { period: `${year}-${month}`, year, month };
}

interface ReconstructedPoint {
  period: string; // YYYY-MM
  date: string;
  total_value_brl: number;
  total_pnl_brl: number;
  partial: boolean;
}

// A single plotted row. value/pnl are null for projected (future) months; forecast
// is null for historical months except the last (so the dashed line connects).
interface ChartRow {
  label: string;
  fullLabel: string;
  value: number | null;
  pnl: number | null;
  partial: boolean;
  forecast?: number | null;
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
  const [expanded, setExpanded] = useState(true);
  const [showForecast, setShowForecast] = useState(false);

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

  const chartData = useMemo<ChartRow[]>(() => {
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

  // Prevision: fit a compound monthly growth rate (log-linear least squares) over
  // the most recent months and extrapolate. Blends contributions + market moves
  // into one trend — honest but naive; clearly labelled as an extrapolation.
  const forecast = useMemo(() => {
    const values = points.map((p) => p.total_value_brl);
    const n = values.length;
    if (n < 3) return null;

    // Use the longest trailing run of strictly-positive values (log needs > 0),
    // then cap it to the fit window.
    let runStart = n;
    for (let i = n - 1; i >= 0; i--) {
      if (values[i] > 0) runStart = i;
      else break;
    }
    const run = values.slice(runStart);
    if (run.length < 3) return null;
    const window = run.slice(Math.max(0, run.length - FIT_WINDOW));

    const k = window.length;
    const ys = window.map((v) => Math.log(v));
    const meanX = (k - 1) / 2;
    const meanY = ys.reduce((a, b) => a + b, 0) / k;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < k; i++) {
      const dx = i - meanX;
      sxy += dx * (ys[i] - meanY);
      sxx += dx * dx;
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    const growth = Math.exp(slope); // monthly growth factor (e.g. 1.03 = +3%/mo)
    const lastValue = values[n - 1];
    const lastPeriod = points[n - 1].period;

    const futurePoints = Array.from({ length: FORECAST_HORIZON }, (_, i) => {
      const j = i + 1;
      const { year, month } = addMonths(lastPeriod, j);
      return {
        label: `${month}/${String(year).slice(2)}`,
        fullLabel: `${month}/${year}`,
        forecast: lastValue * Math.pow(growth, j),
      };
    });

    let monthsToTarget: number | null;
    if (lastValue >= TARGET) {
      monthsToTarget = 0;
    } else if (growth > 1) {
      monthsToTarget = Math.ceil(
        Math.log(TARGET / lastValue) / Math.log(growth),
      );
    } else {
      monthsToTarget = null; // flat or declining — unreachable on this trend
    }

    const etaLabel =
      monthsToTarget && monthsToTarget > 0
        ? (() => {
            const { month, year } = addMonths(lastPeriod, monthsToTarget);
            return `${month}/${year}`;
          })()
        : null;

    return {
      monthlyGrowthPct: (growth - 1) * 100,
      windowMonths: k,
      in6: lastValue * Math.pow(growth, 6),
      monthsToTarget,
      etaLabel,
      futurePoints,
    };
  }, [points]);

  // When Prevision is on, append the projected months (dashed) and connect the
  // forecast line to the last real point.
  const displayData = useMemo<ChartRow[]>(() => {
    if (!showForecast || !forecast) return chartData;
    const base: ChartRow[] = chartData.map((d, i) => ({
      ...d,
      forecast: i === chartData.length - 1 ? d.value : null,
    }));
    const future: ChartRow[] = forecast.futurePoints.map((fp) => ({
      label: fp.label,
      fullLabel: fp.fullLabel,
      value: null,
      pnl: null,
      partial: false,
      forecast: fp.forecast,
    }));
    return [...base, ...future];
  }, [showForecast, forecast, chartData]);

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
            Latest:{" "}
            {hideValues ? HIDDEN : formatCurrency(latest.value ?? 0, "BRL")}
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
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant={showForecast ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setShowForecast((v) => !v)}
                disabled={!forecast}
                title={
                  forecast
                    ? "Project the recent trend forward"
                    : "Need at least 3 months of history"
                }
              >
                <TrendingUp className="mr-1 h-3.5 w-3.5" />
                Prevision
              </Button>
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
            <>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayData}>
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
                  {showForecast && forecast && (
                    <Line
                      yAxisId="value"
                      type="monotone"
                      dataKey="forecast"
                      name="Forecast (BRL)"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {showForecast && forecast && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>
                  Naive projection at the recent trend of{" "}
                  <span className="font-semibold text-foreground">
                    {forecast.monthlyGrowthPct >= 0 ? "+" : ""}
                    {forecast.monthlyGrowthPct.toFixed(1)}%/month
                  </span>{" "}
                  (fit over the last {forecast.windowMonths} month
                  {forecast.windowMonths === 1 ? "" : "s"}).
                </p>
                <p>
                  In 6 months:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {hideValues ? HIDDEN : formatCurrency(forecast.in6, "BRL")}
                  </span>
                </p>
                <p>
                  {forecast.monthsToTarget == null
                    ? "At this trend you won't reach R$1M (flat or declining)."
                    : forecast.monthsToTarget === 0
                      ? "Already past R$1M. 🎉"
                      : `R$1M in ~${forecast.monthsToTarget} month${
                          forecast.monthsToTarget === 1 ? "" : "s"
                        }${forecast.etaLabel ? ` (~${forecast.etaLabel})` : ""}.`}
                </p>
                <p className="italic">
                  Extrapolation only — assumes the recent pace and contribution
                  rate continue. Not investment advice.
                </p>
              </div>
            )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

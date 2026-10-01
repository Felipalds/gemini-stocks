import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const API = "http://localhost:8080";
const HIDDEN = "••••••";

interface HistoryPoint {
  symbol: string;
  period: string; // YYYY-MM
  date: string; // ISO
  close: number;
  currency: string;
}

type RangeKey = "YTD" | "1Y" | "5Y" | "ALL";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "5Y", label: "5Y" },
  { key: "ALL", label: "All" },
];

// cutoffFor returns the earliest date to include for a range, or null for "All".
function cutoffFor(range: RangeKey): Date | null {
  const now = new Date();
  switch (range) {
    case "YTD":
      return new Date(now.getFullYear(), 0, 1);
    case "1Y":
      return new Date(now.getFullYear() - 1, now.getMonth(), 1);
    case "5Y":
      return new Date(now.getFullYear() - 5, now.getMonth(), 1);
    case "ALL":
      return null;
  }
}

interface TickerHistoryChartProps {
  symbol: string;
  /** Fallback currency until the stored series reports its own. */
  currency?: string;
  hideValues?: boolean;
  /** Only fetch when the container (e.g. a dialog) is actually visible. */
  active?: boolean;
}

export function TickerHistoryChart({
  symbol,
  currency: fallbackCurrency = "USD",
  hideValues,
  active = true,
}: TickerHistoryChartProps) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [range, setRange] = useState<RangeKey>("1Y");

  const load = useCallback(() => {
    if (!symbol) return;
    setLoading(true);
    fetch(`${API}/tickers/history?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to load ticker history", err))
      .finally(() => setLoading(false));
  }, [symbol]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const handleSync = useCallback(async () => {
    if (!symbol) return;
    setSyncing(true);
    const toastId = toast.loading(`Syncing ${symbol} history...`, {
      description: "Fetching monthly closes from Yahoo Finance.",
    });
    try {
      const res = await fetch(
        `${API}/tickers/history/sync?symbol=${encodeURIComponent(symbol)}`,
        { method: "POST" },
      );
      if (res.ok) {
        const body = await res.json();
        toast.success(`${symbol} history synced`, {
          id: toastId,
          description: body.skipped
            ? "Already up to date for this month."
            : `${body.synced} period(s) updated (${body.total} total).`,
        });
        load();
      } else {
        const text = await res.text();
        toast.error("Sync failed", {
          id: toastId,
          description: text || "Could not sync this ticker's history.",
        });
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setSyncing(false);
    }
  }, [symbol, load]);

  const currency = history[0]?.currency || fallbackCurrency;

  const chartData = useMemo(() => {
    const cutoff = cutoffFor(range);
    return history
      .filter((p) => (cutoff ? new Date(p.date) >= cutoff : true))
      .map((p) => {
        const d = new Date(p.date);
        return {
          period: p.period,
          label: d.toLocaleDateString("pt-BR", {
            month: "2-digit",
            year: "2-digit",
          }),
          fullLabel: d.toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          }),
          close: p.close,
        };
      });
  }, [history, range]);

  const first = chartData[0]?.close ?? null;
  const last = chartData[chartData.length - 1]?.close ?? null;
  const change =
    first != null && last != null && first !== 0
      ? ((last - first) / first) * 100
      : null;
  const isPositive = (change ?? 0) >= 0;

  const fmt = (v: number) => formatCurrency(v, currency);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-0.5">
          <span className="text-sm text-muted-foreground">
            Monthly close · {currency}
          </span>
          {last != null && change != null && (
            <div
              className={cn(
                "text-sm font-medium flex items-center gap-1",
                isPositive ? "text-emerald-600" : "text-red-600",
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {isPositive ? "+" : ""}
              {change.toFixed(2)}% over {range === "ALL" ? "all time" : range}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                variant={range === r.key ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            <RefreshCw
              className={cn("mr-1 h-3.5 w-3.5", syncing && "animate-spin")}
            />
            {syncing ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
          Loading history...
        </div>
      ) : history.length === 0 ? (
        <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground border border-dashed rounded-lg">
          <p>No history stored yet.</p>
          <p className="text-xs">
            Hit “Sync” to pull the monthly series from Yahoo.
          </p>
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg">
          No data in this range.
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                width={80}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => (hideValues ? "••" : fmt(v))}
              />
              <Tooltip
                formatter={(value) => {
                  const n = typeof value === "number" ? value : Number(value);
                  return hideValues
                    ? HIDDEN
                    : fmt(Number.isFinite(n) ? n : 0);
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as
                    | { fullLabel?: string }
                    | undefined;
                  return row?.fullLabel ?? "";
                }}
              />
              <Line
                type="monotone"
                dataKey="close"
                name={`Close (${currency})`}
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

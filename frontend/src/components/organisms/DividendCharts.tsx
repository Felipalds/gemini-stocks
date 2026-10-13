import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PortfolioPieChart } from "@/components/organisms/PortfolioPieChart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import type { Dividend } from "@/types";

const HIDDEN = "••••••";
const ALL = "__all__";

interface DividendChartsProps {
  items: Dividend[];
  hideValues?: boolean;
}

/** YYYY-MM for a dividend's date. */
function monthKey(date: string): string {
  return (date ?? "").slice(0, 7);
}

/** Inclusive list of "YYYY-MM" keys from `from` to `to`, so the line stays
 * continuous even in months a ticker paid nothing. */
function monthRange(from: string, to: string): string[] {
  if (!from || !to) return [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  // Guard against malformed input producing an unbounded loop.
  for (let i = 0; i < 600 && (y < ty || (y === ty && m <= tm)); i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Dividend visualisations shared with the dashboard overview: a per-ticker pie
 * plus a monthly line chart. Unlike the dashboard version, the line chart can be
 * filtered to a single ticker (or show the combined total across all of them).
 */
export function DividendCharts({ items, hideValues }: DividendChartsProps) {
  const [ticker, setTicker] = useState<string>(ALL);

  // Per-ticker totals (BRL) for the pie + the filter options.
  const tickers = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of items) {
      totals.set(d.symbol, (totals.get(d.symbol) ?? 0) + (d.value_brl ?? 0));
    }
    return [...totals.entries()]
      .map(([symbol, total]) => ({ symbol, total }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const pieData = useMemo(
    () => tickers.map((t) => ({ name: t.symbol, value: t.total })),
    [tickers],
  );

  // Monthly received, honouring the ticker filter. We build a continuous month
  // range so the line doesn't collapse to a couple of disconnected dots when a
  // ticker only paid in a handful of months.
  const lineData = useMemo(() => {
    const relevant =
      ticker === ALL ? items : items.filter((d) => d.symbol === ticker);
    if (relevant.length === 0) return [];

    const perMonth = new Map<string, number>();
    let min = "";
    let max = "";
    for (const d of relevant) {
      const key = monthKey(d.date);
      if (!key) continue;
      perMonth.set(key, (perMonth.get(key) ?? 0) + (d.value_brl ?? 0));
      if (!min || key < min) min = key;
      if (!max || key > max) max = key;
    }

    return monthRange(min, max).map((key) => ({
      label: key,
      received: perMonth.get(key) ?? 0,
    }));
  }, [items, ticker]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Per-ticker share */}
      <div className="flex flex-col h-[300px]">
        <p className="text-xs font-medium text-muted-foreground text-center">
          By ticker
        </p>
        <div className="flex-1 min-h-0">
          <PortfolioPieChart data={pieData} className="h-full" />
        </div>
      </div>

      {/* Monthly received, filterable by ticker */}
      <div className="flex flex-col h-[300px]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Received per month
          </p>
          <Select value={ticker} onValueChange={setTicker}>
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue placeholder="All tickers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tickers</SelectItem>
              {tickers.map((t) => (
                <SelectItem key={t.symbol} value={t.symbol}>
                  {t.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-h-0">
          {lineData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={80}
                  tickFormatter={(v: number) =>
                    hideValues ? "••" : formatCurrency(v, "BRL")
                  }
                />
                <Tooltip
                  formatter={(value) => {
                    const n = typeof value === "number" ? value : Number(value);
                    return hideValues
                      ? HIDDEN
                      : formatCurrency(Number.isFinite(n) ? n : 0, "BRL");
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="received"
                  name={ticker === ALL ? "Received (BRL)" : `${ticker} (BRL)`}
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

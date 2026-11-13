import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { ExpenseAnalytics } from "@/types";

const API_BASE = "http://localhost:8080";
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const pad = (n: number) => String(n).padStart(2, "0");

const UP_COLOR = "#dc2626"; // rising spend = red
const DOWN_COLOR = "#16a34a"; // falling spend = green

interface Props {
  hideValues?: boolean;
  refreshKey?: number;
  /** Called with a "YYYY-MM" key when a (non-future) month bar is clicked. */
  onSelectMonth?: (monthKey: string) => void;
}

// Always-on chart of the current year's spending: one bar per calendar month
// (Jan–Dec, future months empty) plus two single-axis overlays — a flat average
// reference line and a least-squares TREND line showing whether spending is
// tending up or down. No dual-scale axis.
export function ExpenseYearChart({
  hideValues,
  refreshKey = 0,
  onSelectMonth,
}: Props) {
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  useEffect(() => {
    const params = new URLSearchParams({ from: `${year}-01-01` });
    fetch(`${API_BASE}/expenses/analytics?${params.toString()}`)
      .then((r) => r.json())
      .then((a: ExpenseAnalytics) => setAnalytics(a))
      .catch((err) => console.error("Failed to load year analytics", err));
  }, [year, refreshKey]);

  const { data, trendUp, hasTrend } = useMemo(() => {
    const byKey = new Map(
      (analytics?.monthly_series ?? []).map((b) => [b.key, b.total_brl]),
    );
    const base = MONTHS.map((m, i) => ({
      month: m,
      key: `${year}-${pad(i + 1)}`,
      total: byKey.get(`${year}-${pad(i + 1)}`) ?? 0,
      future: i > currentMonth,
    }));

    // Least-squares trend over the months that have occurred.
    const pts = base.filter((d) => !d.future);
    let slope = 0;
    let intercept = 0;
    let ok = false;
    if (pts.length >= 2) {
      const n = pts.length;
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      pts.forEach((d, i) => {
        sx += i;
        sy += d.total;
        sxy += i * d.total;
        sxx += i * i;
      });
      const denom = n * sxx - sx * sx;
      if (denom !== 0) {
        slope = (n * sxy - sx * sy) / denom;
        intercept = (sy - slope * sx) / n;
        ok = true;
      }
    }

    const withTrend = base.map((d, i) => ({
      ...d,
      // Project the trend across all 12 months (never below 0).
      trend: ok ? Math.max(0, intercept + slope * i) : null,
    }));

    return { data: withTrend, trendUp: slope > 0, hasTrend: ok };
  }, [analytics, year, currentMonth]);

  const avg = analytics?.average_monthly ?? 0;
  const trendColor = trendUp ? UP_COLOR : DOWN_COLOR;

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Spending by month · {year}</CardTitle>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {avg > 0 && (
            <span>avg {hideValues ? "•••" : formatCurrency(avg, "BRL")}/mo</span>
          )}
          {hasTrend && (
            <span style={{ color: trendColor }} className="font-medium">
              {trendUp ? "▲ rising" : "▼ falling"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v) =>
                hideValues ? "••" : `${Math.round(Number(v) / 100) / 10}k`
              }
            />
            {avg > 0 && (
              <ReferenceLine
                y={avg}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}
            <Tooltip
              isAnimationActive={false}
              cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
              formatter={(value, name) => [
                hideValues
                  ? "•••"
                  : formatCurrency(
                      typeof value === "number" ? value : Number(value),
                      "BRL",
                    ),
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="total"
              name="Spent"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              onClick={(d) =>
                handleBarClick(
                  d as { key?: string; future?: boolean },
                  onSelectMonth,
                )
              }
            >
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={entry.future ? "var(--color-muted)" : "var(--color-chart-1)"}
                  cursor={!entry.future && onSelectMonth ? "pointer" : "default"}
                />
              ))}
            </Bar>
            <Line
              type="linear"
              dataKey="trend"
              name="Trend"
              stroke={trendColor}
              strokeWidth={2}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function handleBarClick(
  entry: { key?: string; future?: boolean },
  onSelectMonth?: (monthKey: string) => void,
) {
  if (entry?.key && !entry.future) onSelectMonth?.(entry.key);
}

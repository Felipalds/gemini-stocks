import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { ExpenseAnalytics, ExpenseTotals } from "@/types";
import { toast } from "sonner";

const API_BASE = "http://localhost:8080";

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
];

type Props = {
  hideValues?: boolean;
  refreshKey?: number;
};

function money(n: number, hide?: boolean) {
  if (hide) return "•••";
  return formatCurrency(n, "BRL");
}

function pct(n: number | null | undefined, hide?: boolean) {
  if (n == null || Number.isNaN(n)) return "—";
  if (hide) return "•••";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function ExpenseAnalyticsPanel({ hideValues, refreshKey = 0 }: Props) {
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [totals, setTotals] = useState<ExpenseTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/expenses/analytics`).then((r) => r.json()),
      fetch(`${API_BASE}/expenses/totals?filter=month`).then((r) => r.json()),
    ])
      .then(([a, t]: [ExpenseAnalytics, ExpenseTotals]) => {
        setAnalytics(a);
        setTotals(t);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load expense analytics");
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const categoryPie = useMemo(
    () =>
      (analytics?.category_breakdown_30d ?? []).map((b) => ({
        name: b.key || "Other",
        value: b.total_brl,
      })),
    [analytics]
  );

  const monthlyBars = useMemo(() => {
    const buckets = [...(totals?.buckets ?? [])].sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    return buckets.slice(-12).map((b) => ({
      month: b.key,
      total: b.total_brl,
    }));
  }, [totals]);

  const top5Bars = useMemo(
    () =>
      (analytics?.top_5_current_month ?? []).map((row) => ({
        name: row.name.length > 18 ? `${row.name.slice(0, 16)}…` : row.name,
        fullName: row.name,
        total: row.value_brl,
      })),
    [analytics]
  );

  if (loading && !analytics) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Loading analytics…
        </CardContent>
      </Card>
    );
  }

  if (!analytics) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          title="Total spent (all time)"
          value={money(analytics.total_spent_all_time_brl ?? 0, hideValues)}
        />
        <Kpi
          title="This month"
          value={money(analytics.current_month_total_brl, hideValues)}
          hint={
            analytics.mom_delta_percent == null
              ? "vs last month —"
              : `MoM ${pct(analytics.mom_delta_percent, hideValues)}`
          }
        />
        <Kpi
          title="Avg daily (30d)"
          value={money(analytics.average_daily_30d, hideValues)}
        />
        <Kpi
          title="Avg monthly (12m)"
          value={money(analytics.average_monthly_12m, hideValues)}
        />
        <Kpi
          title="Largest ever"
          value={money(analytics.largest_single?.value_brl ?? 0, hideValues)}
          hint={analytics.largest_single?.name || "—"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          title="Top category"
          value={analytics.top_category?.key || "—"}
          hint={money(analytics.top_category?.total_brl ?? 0, hideValues)}
        />
        <Kpi
          title="Top merchant"
          value={analytics.top_name?.key || "—"}
          hint={money(analytics.top_name?.total_brl ?? 0, hideValues)}
        />
        <Kpi
          title="Top month"
          value={analytics.top_month?.key || "—"}
          hint={money(analytics.top_month?.total_brl ?? 0, hideValues)}
        />
        <Kpi
          title="Top day"
          value={analytics.top_day?.key || "—"}
          hint={money(analytics.top_day?.total_brl ?? 0, hideValues)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Category breakdown (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {categoryPie.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={!hideValues}
                  >
                    {categoryPie.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      money(typeof value === "number" ? value : Number(value), hideValues)
                    }
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly spend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {monthlyBars.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyBars}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      hideValues ? "••" : `${Math.round(Number(v) / 100) / 10}k`
                    }
                  />
                  <Tooltip
                    formatter={(value) =>
                      money(typeof value === "number" ? value : Number(value), hideValues)
                    }
                  />
                  <Bar dataKey="total" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 5 this month</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {top5Bars.length === 0 ? (
            <EmptyChart label="No expenses this month yet." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top5Bars} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  type="number"
                  tickFormatter={(v) =>
                    hideValues ? "••" : String(Math.round(Number(v)))
                  }
                />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) =>
                    money(typeof value === "number" ? value : Number(value), hideValues)
                  }
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as
                      | { fullName?: string }
                      | undefined;
                    return row?.fullName ?? "";
                  }}
                />
                <Bar dataKey="total" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {analytics.budget_status.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Budgets this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.budget_status.map((b, i) => (
              <div key={`${b.category}-${i}`} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{b.category || "Overall"}</span>
                  <span className="text-muted-foreground">
                    {money(b.spent_brl, hideValues)} /{" "}
                    {money(b.budget_brl, hideValues)} (
                    {hideValues ? "•••" : `${b.percent_consumed.toFixed(0)}%`})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, Math.max(0, b.percent_consumed))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="text-lg font-semibold truncate" title={value}>
          {value}
        </div>
        {hint && (
          <div className="text-xs text-muted-foreground truncate" title={hint}>
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label = "No data yet." }: { label?: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

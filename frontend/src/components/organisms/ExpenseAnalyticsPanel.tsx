import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChartDialog } from "@/components/organisms/PieChartDialog";
import { formatCurrency } from "@/lib/format";
import type { Expense, ExpenseAnalytics, PaginatedExpenses } from "@/types";
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
  /** Start of the selected period as "YYYY-MM-DD"; omit for all time. */
  from?: string;
  /** End of the selected period as "YYYY-MM-DD"; omit for "up to now". */
  to?: string;
  /** Compact label for the selected period, e.g. "this month", "last 90 days". */
  periodTitle?: string;
  /** Opens the budget management dialog; also enables an empty-state prompt. */
  onEditBudgets?: () => void;
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

type DrillGroup = {
  kind: "group";
  key: string;
  name: string;
  of: number;
  rows: Expense[];
  fullBRL: number;
};
type DrillItem = { kind: "single"; row: Expense } | DrillGroup;

// One transaction line in the drill-down list; `label` prefixes the installment
// number (e.g. "3/12") when the row is part of a plan.
function DrillRow({
  e,
  hideValues,
  label,
}: {
  e: Expense;
  hideValues?: boolean;
  label?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium">
          {label && (
            <span className="mr-1 text-muted-foreground">{label}</span>
          )}
          {e.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(e.date).toLocaleDateString("pt-BR")}
          {e.bank ? ` · ${e.bank}` : ""}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div>{money(e.value_brl ?? 0, hideValues)}</div>
        {e.currency !== "BRL" && (
          <div className="text-xs text-muted-foreground">
            {hideValues ? "•••" : formatCurrency(e.value, e.currency)}
          </div>
        )}
      </div>
    </li>
  );
}

export const ExpenseAnalyticsPanel = memo(ExpenseAnalyticsPanelInner);

function ExpenseAnalyticsPanelInner({
  hideValues,
  refreshKey = 0,
  from,
  to,
  periodTitle = "this period",
  onEditBudgets,
}: Props) {
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Shared query string for the period (reused by analytics and the drill-down).
  const periodQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/expenses/analytics${periodQuery ? `?${periodQuery}` : ""}`)
      .then((r) => r.json())
      .then((a: ExpenseAnalytics) => setAnalytics(a))
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load expense analytics");
      })
      .finally(() => setLoading(false));
  }, [refreshKey, periodQuery]);

  const [pieOpen, setPieOpen] = useState(false);

  // Per-category drill-down: clicking a slice in the expanded pie lists that
  // category's transactions for the selected period.
  const [drill, setDrill] = useState<{
    category: string;
    rows: Expense[];
    loading: boolean;
  } | null>(null);

  const drillReqRef = useRef(0);

  async function openDrill(category: string) {
    const reqId = ++drillReqRef.current;
    setDrill({ category, rows: [], loading: true });
    // Fetch every page so the drill-down shows ALL transactions for the category
    // in the selected period (the backend caps page_size at 200 per request).
    const PAGE = 200;
    try {
      const all: Expense[] = [];
      let page = 1;
      let total = Infinity;
      while (all.length < total) {
        const params = new URLSearchParams(periodQuery);
        params.set("category", category);
        params.set("page", String(page));
        params.set("page_size", String(PAGE));
        const res = await fetch(`${API_BASE}/expenses?${params.toString()}`);
        if (!res.ok) throw new Error(await res.text());
        const d: PaginatedExpenses = await res.json();
        const items = d.items ?? [];
        all.push(...items);
        total = d.total ?? all.length;
        if (items.length === 0) break; // safety against an off-by-one total
        page += 1;
      }
      if (drillReqRef.current === reqId) {
        setDrill({ category, rows: all, loading: false });
      }
    } catch {
      if (drillReqRef.current === reqId) {
        toast.error("Failed to load category transactions");
        setDrill(null);
      }
    }
  }

  // Collapse installment charges under their purchase; one-off rows stay single.
  // Order follows the first occurrence of each group (rows arrive date DESC).
  const drillItems = useMemo<DrillItem[]>(() => {
    if (!drill) return [];
    const items: DrillItem[] = [];
    const indexByGroup = new Map<string, number>();
    for (const row of drill.rows) {
      const g = row.installment_group;
      if (g && (row.installment_of ?? 0) > 1) {
        const at = indexByGroup.get(g);
        if (at == null) {
          indexByGroup.set(g, items.length);
          items.push({
            kind: "group",
            key: g,
            name: row.name,
            of: row.installment_of ?? 0,
            rows: [row],
            fullBRL: 0,
          });
        } else {
          (items[at] as DrillGroup).rows.push(row);
        }
      } else {
        items.push({ kind: "single", row });
      }
    }
    // Full purchase estimate = per-installment BRL × number of installments.
    for (const it of items) {
      if (it.kind === "group") it.fullBRL = (it.rows[0]?.value_brl ?? 0) * it.of;
    }
    return items;
  }, [drill]);

  // Full breakdown for the period, sorted high→low, for the expanded dialog.
  const categoryPie = useMemo(
    () =>
      (analytics?.category_breakdown ?? [])
        .map((b) => ({ name: b.key || "Other", value: b.total_brl }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value),
    [analytics]
  );

  // Inline chart keeps at most the top 5 slices; the rest collapse into a
  // single "Others" slice so the labels stay readable. Clicking opens the full
  // breakdown in the large dialog.
  const TOP_N = 5;
  const inlinePie = useMemo(() => {
    if (categoryPie.length <= TOP_N) return categoryPie;
    const top = categoryPie.slice(0, TOP_N);
    const othersTotal = categoryPie
      .slice(TOP_N)
      .reduce((sum, d) => sum + d.value, 0);
    return [...top, { name: "Others", value: othersTotal }];
  }, [categoryPie]);
  const hasMore = categoryPie.length > TOP_N;

  // Monthly totals within the period (ascending by key), capped so the bars
  // stay readable for long ranges. `cumulative` is the running total, drawn as a
  // rising line over the bars.
  const monthlyBars = useMemo(() => {
    let running = 0;
    return (analytics?.monthly_series ?? []).slice(-24).map((b) => {
      running += b.total_brl;
      return { month: b.key, total: b.total_brl, cumulative: running };
    });
  }, [analytics]);

  const top5Bars = useMemo(
    () =>
      (analytics?.top_5 ?? []).map((row) => ({
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
          title={`Total (${periodTitle})`}
          value={money(analytics.period_total_brl, hideValues)}
          hint={
            analytics.period_delta_percent == null
              ? "vs prev period —"
              : `vs prev ${pct(analytics.period_delta_percent, hideValues)}`
          }
        />
        <Kpi
          title="Avg daily"
          value={money(analytics.average_daily, hideValues)}
        />
        <Kpi
          title="Avg monthly"
          value={money(analytics.average_monthly, hideValues)}
        />
        <Kpi
          title={`Largest (${periodTitle})`}
          value={money(analytics.largest_in_period?.value_brl ?? 0, hideValues)}
          hint={analytics.largest_in_period?.name || "—"}
        />
        <Kpi
          title="Total (all time)"
          value={money(analytics.total_spent_all_time_brl ?? 0, hideValues)}
          hint={
            analytics.largest_single
              ? `Largest ever ${money(
                  analytics.largest_single.value_brl,
                  hideValues
                )}`
              : undefined
          }
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
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              Category breakdown ({periodTitle})
            </CardTitle>
            {hasMore && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setPieOpen(true)}
              >
                Top {TOP_N} · see all ({categoryPie.length})
              </button>
            )}
          </CardHeader>
          <CardContent className="h-72">
            {inlinePie.length === 0 ? (
              <EmptyChart />
            ) : (
              <div
                className={`h-full ${hasMore ? "cursor-pointer" : ""}`}
                title={hasMore ? "Click to see all categories" : undefined}
                onClick={hasMore ? () => setPieOpen(true) : undefined}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inlinePie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={
                        hideValues
                          ? false
                          : (p: { value?: number }) =>
                              formatCurrency(p.value ?? 0, "BRL")
                      }
                      isAnimationActive={false}
                    >
                      {inlinePie.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.name === "Others"
                              ? "var(--color-muted-foreground)"
                              : COLORS[i % COLORS.length]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      isAnimationActive={false}
                      formatter={(value) =>
                        money(typeof value === "number" ? value : Number(value), hideValues)
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Monthly spend ({periodTitle})
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {monthlyBars.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyBars}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="monthly"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      hideValues ? "••" : `${Math.round(Number(v) / 100) / 10}k`
                    }
                  />
                  <YAxis
                    yAxisId="cumulative"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      hideValues ? "••" : `${Math.round(Number(v) / 100) / 10}k`
                    }
                  />
                  <Tooltip
                    isAnimationActive={false}
                    formatter={(value, name) => [
                      money(typeof value === "number" ? value : Number(value), hideValues),
                      name,
                    ]}
                  />
                  <Legend />
                  <Bar
                    yAxisId="monthly"
                    dataKey="total"
                    name="Monthly"
                    fill="var(--color-chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="cumulative"
                    type="monotone"
                    dataKey="cumulative"
                    name="Cumulative"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 5 ({periodTitle})</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {top5Bars.length === 0 ? (
            <EmptyChart label="No expenses in this period yet." />
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
                  isAnimationActive={false}
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

      {analytics.budget_status.length === 0 && onEditBudgets && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <span className="text-sm text-muted-foreground">
              No budgets set yet.
            </span>
            <Button variant="outline" size="sm" onClick={onEditBudgets}>
              Set budgets
            </Button>
          </CardContent>
        </Card>
      )}

      {analytics.budget_status.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Budgets ({periodTitle})</CardTitle>
            {onEditBudgets && (
              <Button variant="ghost" size="sm" onClick={onEditBudgets}>
                Edit
              </Button>
            )}
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

      <PieChartDialog
        open={pieOpen}
        onOpenChange={(o) => {
          setPieOpen(o);
          if (!o) setDrill(null);
        }}
        title={`Category breakdown (${periodTitle})`}
        data={categoryPie}
        labelKind="currency"
        hideValues={hideValues}
        onSliceClick={openDrill}
        footer={
          drill && (
            <div className="border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold">
                  {drill.category}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {drill.loading
                      ? "loading…"
                      : `${drill.rows.length} total · ${money(
                          drill.rows.reduce((s, e) => s + (e.value_brl ?? 0), 0),
                          hideValues
                        )}`}
                  </span>
                </h3>
                <span className="text-xs text-muted-foreground">
                  {periodTitle}
                </span>
              </div>
              {drill.loading ? null : drill.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No transactions in this category for {periodTitle}.
                </p>
              ) : (
                <ul className="divide-y">
                  {/* All transactions for this category within the selected
                      period (rows arrive date DESC); installment charges are
                      grouped under their purchase. */}
                  {drillItems.map((item) =>
                    item.kind === "single" ? (
                      <DrillRow
                        key={item.row.ID}
                        e={item.row}
                        hideValues={hideValues}
                      />
                    ) : (
                      <li key={item.key} className="py-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {item.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Installment plan · {item.of}x ·{" "}
                              {item.rows.length} in {periodTitle}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold">
                              {money(item.fullBRL, hideValues)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              full purchase
                            </div>
                          </div>
                        </div>
                        <ul className="mt-1 ml-3 border-l pl-3 divide-y">
                          {item.rows.map((e) => (
                            <DrillRow
                              key={e.ID}
                              e={e}
                              hideValues={hideValues}
                              label={`${e.installment_n}/${e.installment_of}`}
                            />
                          ))}
                        </ul>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          )
        }
      />
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

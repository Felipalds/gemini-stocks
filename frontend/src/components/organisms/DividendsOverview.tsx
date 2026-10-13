import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Coins, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { PortfolioPieChart } from "@/components/organisms/PortfolioPieChart";
import { AddDividendDialog } from "@/components/organisms/AddDividendDialog";
import type { DividendSummary } from "@/types";

const API = "http://localhost:8080";
const HIDDEN = "••••••";

interface DividendsOverviewProps {
  hideValues?: boolean;
}

/**
 * Compact dividends snapshot for the dashboard: the total received plus a pie
 * (per ticker) and a line (cumulative earnings over time). The full breakdown
 * and entry management live on the /dividends page.
 */
export function DividendsOverview({ hideValues }: DividendsOverviewProps) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DividendSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/dividends/summary`)
      .then((r) => r.json())
      .then((d) => setSummary(d ?? null))
      .catch((e) => console.error("Failed to load dividend summary", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pieData = useMemo(
    () =>
      (summary?.by_ticker ?? []).map((t) => ({
        name: t.symbol,
        value: t.total_brl,
      })),
    [summary],
  );

  // Amount received each month.
  const lineData = useMemo(
    () =>
      (summary?.by_month ?? []).map((b) => ({
        label: b.key,
        received: b.total_brl,
      })),
    [summary],
  );

  const total = summary?.total_brl ?? 0;
  const currentYear = String(new Date().getFullYear());
  const thisYearTotal = useMemo(
    () =>
      (summary?.by_year ?? []).find((b) => b.key === currentYear)?.total_brl ??
      0,
    [summary, currentYear],
  );
  const hasData = (summary?.count ?? 0) > 0;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            Dividends &amp; gains · {currentYear}
          </span>
          <p className="text-2xl font-bold tabular-nums mt-0.5">
            {hideValues ? HIDDEN : formatCurrency(thisYearTotal, "BRL")}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
            {hideValues ? HIDDEN : formatCurrency(total, "BRL")} all time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Dividend
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => navigate("/dividends")}
          >
            Details
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
          Loading dividends...
        </div>
      ) : !hasData ? (
        <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground border border-dashed rounded-lg">
          <p>No dividends recorded yet.</p>
          <p className="text-xs">Add your first on the Dividends page.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Per-ticker share */}
          <div className="h-[260px]">
            <PortfolioPieChart
              data={pieData}
              title="By ticker"
              className="h-full"
            />
          </div>

          {/* Cumulative earnings over time */}
          <div className="flex flex-col h-[260px]">
            <p className="text-xs font-medium text-muted-foreground text-center">
              Received per month
            </p>
            <div className="flex-1 min-h-0">
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
                    name="Received (BRL)"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <AddDividendDialog open={addOpen} onOpenChange={setAddOpen} onSaved={load} />
    </div>
  );
}

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
import { ChevronDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { type PortfolioSnapshot } from "@/types";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";

const API = "http://localhost:8080";
const HIDDEN = "••••••";

interface PortfolioEvolutionChartProps {
  hideValues?: boolean;
}

export function PortfolioEvolutionChart({
  hideValues,
}: PortfolioEvolutionChartProps) {
  const { snapshotEpoch } = useApp();
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/snapshots`)
      .then((r) => r.json())
      .then((data) => setSnapshots(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to load snapshots", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, snapshotEpoch]);

  const chartData = useMemo(() => {
    return snapshots.map((s) => {
      const d = new Date(s.CreatedAt);
      return {
        id: s.ID,
        label: d.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }),
        fullLabel: d.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        total: s.total_value_brl,
        pnl: s.total_pnl_brl,
      };
    });
  }, [snapshots]);

  const latestTotal =
    chartData.length > 0 ? chartData[chartData.length - 1].total : null;
  const changeSinceFirst =
    chartData.length >= 2
      ? chartData[chartData.length - 1].total - chartData[0].total
      : null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="w-full text-left space-y-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? "Collapse portfolio evolution"
            : "Expand portfolio evolution"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Portfolio evolution
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {chartData.length > 0
              ? `${chartData.length} snapshot${chartData.length === 1 ? "" : "s"}`
              : "No snapshots"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </span>
        </div>
        {!expanded && latestTotal != null && (
          <p className="text-sm text-muted-foreground tabular-nums">
            Last: {hideValues ? HIDDEN : formatCurrency(latestTotal, "BRL")}
            {!hideValues && changeSinceFirst != null && (
              <>
                {" · "}
                {changeSinceFirst >= 0 ? "+" : ""}
                {formatCurrency(changeSinceFirst, "BRL")} since first
              </>
            )}
          </p>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            One automatic snapshot per day when you open the app (no Alpha
            calls).
          </p>

          {loading ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              Loading snapshots...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground border border-dashed rounded-lg">
              <p>No snapshots yet.</p>
              <p className="text-xs">
                Reopen the app on another day to build the timeline.
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
                    tick={{ fontSize: 12 }}
                    width={80}
                    tickFormatter={(v: number) =>
                      hideValues ? "••" : formatCurrency(v, "BRL")
                    }
                  />
                  <Tooltip
                    formatter={(value) => {
                      const n =
                        typeof value === "number" ? value : Number(value);
                      return hideValues
                        ? HIDDEN
                        : formatCurrency(Number.isFinite(n) ? n : 0, "BRL");
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
                    dataKey="total"
                    name="Total (BRL)"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
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

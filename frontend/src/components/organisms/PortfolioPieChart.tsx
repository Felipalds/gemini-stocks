import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/format";

export interface PieSlice {
  name: string;
  value: number;
}

interface PortfolioPieChartProps {
  data: PieSlice[];
  title?: string;
  className?: string;
  onClick?: () => void;
}

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#6366f1", // indigo
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // purple
  "#84cc16", // lime
];

function getColor(index: number) {
  return COLORS[index % COLORS.length];
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: PieSlice & { percent?: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{entry.name}</p>
      <p className="text-muted-foreground">
        {formatCurrency(entry.value, "BRL")}
      </p>
    </div>
  );
}

interface LegendEntry {
  value?: string;
  color?: string;
}

interface CustomLegendProps {
  payload?: readonly LegendEntry[];
  filteredData: PieSlice[];
}

function CustomLegend({ payload, filteredData }: CustomLegendProps) {
  if (!payload?.length || !filteredData.length) return null;

  // Top 3 by value (filteredData is already sorted desc) — keep that left-to-right order
  const top3 = filteredData.slice(0, 3);
  const colorByName = new Map(
    payload
      .filter((e): e is { value: string; color?: string } => typeof e.value === "string")
      .map((e) => [e.value, e.color]),
  );

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-xs">
      {top3.map((slice) => (
        <li key={slice.name} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: colorByName.get(slice.name) }}
          />
          <span className="text-muted-foreground">{slice.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function PortfolioPieChart({
  data,
  title,
  className,
  onClick,
}: PortfolioPieChartProps) {
  const filtered = useMemo(
    () =>
      [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value),
    [data],
  );

  if (filtered.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground ${className ?? ""}`}
      >
        No data
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${onClick ? "cursor-pointer" : ""} ${className ?? ""}`}
      onClick={onClick}
    >
      {title && (
        <p className="text-xs font-medium text-muted-foreground text-center">
          {title}
        </p>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered}
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {filtered.map((_entry, index) => (
                <Cell key={index} fill={getColor(index)} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              content={(props) => (
                <CustomLegend {...props} filteredData={filtered} />
              )}
              verticalAlign="bottom"
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

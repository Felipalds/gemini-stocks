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
}

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
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
  value: string;
  color: string;
}

function CustomLegend({ payload }: { payload?: LegendEntry[] }) {
  if (!payload?.length) return null;
  const top3 = payload.slice(0, 3);
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-xs">
      {top3.map((entry) => (
        <li key={entry.value} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function PortfolioPieChart({
  data,
  title,
  className,
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
    <div className={`flex flex-col ${className ?? ""}`}>
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
            <Legend content={<CustomLegend />} verticalAlign="bottom" />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

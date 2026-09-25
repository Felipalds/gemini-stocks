import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type FixedBalance, type PortfolioGoal, type Transaction } from "@/types";
import { type StockPriceInfo } from "@/contexts/AppContext";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const HIDDEN = "••••••";
const API = "http://localhost:8080";

interface GoalProgressCardProps {
  transactions: Transaction[];
  stockPrices: StockPriceInfo[];
  fixedBalances: FixedBalance[];
  dollarRate: number;
  hideValues?: boolean;
  reloadToken?: number;
  onEditGoal?: () => void;
}

function ProgressBar({
  percent,
  tone = "default",
  tall = false,
}: {
  percent: number;
  tone?: "default" | "over" | "under";
  tall?: boolean;
}) {
  const width = Math.min(Math.max(percent, 0), 100);
  const barClass =
    tone === "over"
      ? "bg-amber-500/90"
      : tone === "under"
        ? "bg-sky-600/90"
        : "bg-emerald-600/90";

  return (
    <div
      className={cn(
        "w-full rounded-full bg-foreground/10 overflow-hidden",
        tall ? "h-3" : "h-2",
      )}
    >
      <div
        className={cn("h-full rounded-full transition-all", barClass)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function categoryTotalsBRL(
  transactions: Transaction[],
  stockPrices: StockPriceInfo[],
  fixedBalances: FixedBalance[],
  dollarRate: number,
): { totalBRL: number; byCategory: Map<string, number> } {
  const categoryMap = new Map<string, string>();
  for (const sp of stockPrices) {
    categoryMap.set(sp.symbol, sp.category || "Other");
  }

  const symbolMap = new Map<
    string,
    {
      buyQuantity: number;
      sellQuantity: number;
      currentPrice: number;
      currency: string;
    }
  >();

  for (const t of transactions) {
    const entry = symbolMap.get(t.symbol) ?? {
      buyQuantity: 0,
      sellQuantity: 0,
      currentPrice: t.current_price ?? 0,
      currency: t.currency || "USD",
    };
    if (t.type === "BUY") {
      entry.buyQuantity += t.quantity;
    } else {
      entry.sellQuantity += t.quantity;
    }
    if (t.current_price) {
      entry.currentPrice = t.current_price;
    }
    const sp = stockPrices.find((p) => p.symbol === t.symbol);
    if (sp?.currency) {
      entry.currency = sp.currency;
    }
    symbolMap.set(t.symbol, entry);
  }

  const byCategory = new Map<string, number>();
  let totalBRL = 0;

  for (const [symbol, data] of symbolMap) {
    const net = data.buyQuantity - data.sellQuantity;
    const value = net * data.currentPrice;
    const valueBRL = data.currency === "BRL" ? value : value * dollarRate;
    const abs = Math.abs(valueBRL);
    totalBRL += abs;
    const cat = categoryMap.get(symbol) || "Other";
    byCategory.set(cat, (byCategory.get(cat) || 0) + abs);
  }

  for (const fb of fixedBalances) {
    const amount = fb.amount || 0;
    const currency = fb.currency || "BRL";
    const valueBRL = currency === "BRL" ? amount : amount * dollarRate;
    const abs = Math.abs(valueBRL);
    totalBRL += abs;
    const cat = fb.category || "FIXA";
    byCategory.set(cat, (byCategory.get(cat) || 0) + abs);
  }

  return { totalBRL, byCategory };
}

export function GoalProgressCard({
  transactions,
  stockPrices,
  fixedBalances,
  dollarRate,
  hideValues,
  reloadToken = 0,
  onEditGoal,
}: GoalProgressCardProps) {
  const [goal, setGoal] = useState<PortfolioGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const loadGoal = useCallback(() => {
    setLoading(true);
    fetch(`${API}/goal`)
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.error || !data?.goal_total) return null;
        return data as PortfolioGoal;
      })
      .then((data) => setGoal(data))
      .catch(() => setGoal(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadGoal();
  }, [loadGoal, reloadToken]);

  const { totalBRL, byCategory } = useMemo(
    () =>
      categoryTotalsBRL(
        transactions,
        stockPrices,
        fixedBalances,
        dollarRate,
      ),
    [transactions, stockPrices, fixedBalances, dollarRate],
  );

  const overallPct =
    goal && goal.goal_total > 0 ? (totalBRL / goal.goal_total) * 100 : 0;
  const remaining = goal ? Math.max(goal.goal_total - totalBRL, 0) : 0;

  const categoryRows = useMemo(() => {
    if (!goal) return [];
    return (goal.allocations || [])
      .filter((a) => a.percentage > 0)
      .map((a) => {
        const target = (goal.goal_total * a.percentage) / 100;
        const actual = byCategory.get(a.category) || 0;
        const pctOfTarget = target > 0 ? (actual / target) * 100 : 0;
        return {
          category: a.category,
          targetPct: a.percentage,
          targetBRL: target,
          actualBRL: actual,
          pctOfTarget,
        };
      })
      .sort((a, b) => b.targetPct - a.targetPct);
  }, [goal, byCategory]);

  if (loading) {
    return (
      <div className="py-1 text-xs text-muted-foreground">Loading goal...</div>
    );
  }

  if (!goal) {
    return (
      <div className="flex flex-wrap items-center gap-3 py-1">
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          No goal set
        </span>
        {onEditGoal && (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={onEditGoal}>
            Set goal
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Goal progress
        </span>
        {onEditGoal && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onEditGoal();
            }}
          >
            Edit
          </Button>
        )}
      </div>

      <button
        type="button"
        className="w-full text-left space-y-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? "Hide category goal progress"
            : "Show category goal progress"
        }
      >
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium tabular-nums">
            {overallPct.toFixed(1)}%
            <span className="text-muted-foreground font-normal">
              {" "}
              of{" "}
              {hideValues ? HIDDEN : formatCurrency(goal.goal_total, "BRL")}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {hideValues
              ? HIDDEN
              : remaining > 0
                ? `${formatCurrency(remaining, "BRL")} left`
                : "Reached"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </span>
        </div>
        <ProgressBar
          percent={overallPct}
          tone={overallPct >= 100 ? "over" : "default"}
          tall
        />
      </button>

      {expanded && (
        <div className="space-y-3 pt-2 pl-0.5">
          {categoryRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No category allocations on this goal.
            </p>
          ) : (
            categoryRows.map((row) => {
              const tone =
                row.pctOfTarget >= 100
                  ? "over"
                  : row.pctOfTarget < 50
                    ? "under"
                    : "default";
              return (
                <div key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{row.category}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {row.pctOfTarget.toFixed(1)}% · target{" "}
                      {row.targetPct.toFixed(1)}%
                    </span>
                  </div>
                  <ProgressBar percent={row.pctOfTarget} tone={tone} />
                  <div className="text-xs text-muted-foreground">
                    {hideValues
                      ? HIDDEN
                      : `${formatCurrency(row.actualBRL, "BRL")} / ${formatCurrency(row.targetBRL, "BRL")}`}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

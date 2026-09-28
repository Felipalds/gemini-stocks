import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, DollarSign } from "lucide-react";
import { type FixedBalance, type Transaction } from "@/types";
import { type StockPriceInfo } from "@/contexts/AppContext";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PortfolioPieChart,
  type PieSlice,
} from "@/components/organisms/PortfolioPieChart";
import { PieChartDialog } from "@/components/organisms/PieChartDialog";

interface PortfolioSummaryProps {
  transactions: Transaction[];
  stockPrices: StockPriceInfo[];
  fixedBalances: FixedBalance[];
  dollarRate: number;
  dollarRateUpdatedAt?: string | null;
  hideValues?: boolean;
}

const HIDDEN = "••••••";

export function PortfolioSummary({
  transactions,
  stockPrices,
  fixedBalances,
  dollarRate,
  dollarRateUpdatedAt,
  hideValues,
}: PortfolioSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const {
    totalUSD,
    totalBRL,
    totalPnlUSD,
    totalPnlBRL,
    assetSlices,
    categorySlices,
  } = useMemo(() => {
    const categoryMap = new Map<string, string>();
    for (const sp of stockPrices) {
      categoryMap.set(sp.symbol, sp.category || "Other");
    }

    const symbolMap = new Map<
      string,
      {
        buyQuantity: number;
        sellQuantity: number;
        totalBuyCost: number;
        totalFees: number;
        currentPrice: number;
        currency: string;
      }
    >();

    for (const t of transactions) {
      const entry = symbolMap.get(t.symbol) ?? {
        buyQuantity: 0,
        sellQuantity: 0,
        totalBuyCost: 0,
        totalFees: 0,
        currentPrice: t.current_price ?? 0,
        currency: t.currency || "USD",
      };

      if (t.type === "BUY") {
        entry.buyQuantity += t.quantity;
        entry.totalBuyCost += t.quantity * t.price;
      } else {
        entry.sellQuantity += t.quantity;
      }

      entry.totalFees += t.fee || 0;

      if (t.current_price) {
        entry.currentPrice = t.current_price;
      }

      symbolMap.set(t.symbol, entry);
    }

    let usdValue = 0;
    let brlValue = 0;
    let usdCostBasis = 0;
    let brlCostBasis = 0;
    const chartSlices: PieSlice[] = [];
    const catTotals = new Map<string, number>();

    for (const [symbol, data] of symbolMap) {
      const netQuantity = data.buyQuantity - data.sellQuantity;
      const value = netQuantity * data.currentPrice;
      const avgBuyPrice =
        data.buyQuantity > 0 ? data.totalBuyCost / data.buyQuantity : 0;
      const costBasis = netQuantity * avgBuyPrice;

      if (data.currency === "BRL") {
        brlValue += value;
        brlCostBasis += costBasis + data.totalFees;
      } else {
        usdValue += value;
        usdCostBasis += costBasis + data.totalFees;
      }

      const valueInBRL = data.currency === "BRL" ? value : value * dollarRate;
      const absValue = Math.abs(valueInBRL);

      chartSlices.push({ name: symbol, value: absValue });

      const category = categoryMap.get(symbol) || "Other";
      catTotals.set(category, (catTotals.get(category) || 0) + absValue);
    }

    for (const fb of fixedBalances) {
      const amount = fb.amount || 0;
      const currency = fb.currency || "BRL";
      if (currency === "BRL") {
        brlValue += amount;
        brlCostBasis += amount;
      } else {
        usdValue += amount;
        usdCostBasis += amount;
      }

      const valueInBRL = currency === "BRL" ? amount : amount * dollarRate;
      const absValue = Math.abs(valueInBRL);
      chartSlices.push({ name: fb.name, value: absValue });

      const category = fb.category || "FIXA";
      catTotals.set(category, (catTotals.get(category) || 0) + absValue);
    }

    const catSlices: PieSlice[] = [];
    for (const [name, value] of catTotals) {
      catSlices.push({ name, value });
    }
    catSlices.sort((a, b) => b.value - a.value);

    return {
      totalUSD: usdValue,
      totalBRL: brlValue,
      totalPnlUSD: usdValue - usdCostBasis,
      totalPnlBRL: brlValue - brlCostBasis,
      assetSlices: chartSlices,
      categorySlices: catSlices,
    };
  }, [transactions, stockPrices, fixedBalances, dollarRate]);

  const totalInBRL = totalBRL + totalUSD * dollarRate;
  const totalPnlInBRL = totalPnlBRL + totalPnlUSD * dollarRate;
  const isPnlPositive = totalPnlInBRL >= 0;

  const formattedRateDate = dollarRateUpdatedAt
    ? new Date(dollarRateUpdatedAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <>
      <div className="space-y-2">
        <button
          type="button"
          className="w-full text-left space-y-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? "Collapse portfolio total details"
              : "Expand portfolio total details"
          }
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Total portfolio
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </div>
          <div className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
            {hideValues ? HIDDEN : formatCurrency(totalInBRL, "BRL")}
          </div>
        </button>

        {expanded && (
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-medium">
                Details & allocation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid gap-6 lg:grid-cols-[minmax(240px,1fr)_1.2fr_1.2fr] items-center">
                <div className="space-y-2">
                  <p
                    className={`text-base font-semibold ${hideValues ? "text-muted-foreground" : isPnlPositive ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {hideValues
                      ? HIDDEN
                      : `${isPnlPositive ? "+" : ""}${formatCurrency(totalPnlInBRL, "BRL")} earnings`}
                  </p>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground pt-1">
                    <span>
                      {hideValues
                        ? HIDDEN
                        : `${formatCurrency(totalUSD, "USD")} in dollar`}
                    </span>
                    <span>
                      USD 1 = R$ {dollarRate.toFixed(2)}
                      {formattedRateDate && (
                        <span className="ml-1 text-xs">
                          ({formattedRateDate})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div
                  className="cursor-pointer rounded-md hover:bg-muted/40 transition-colors p-1 min-h-[200px]"
                  onClick={() => setAssetDialogOpen(true)}
                >
                  <PortfolioPieChart
                    data={assetSlices}
                    title="By Asset"
                    className="h-[200px]"
                    onClick={() => setAssetDialogOpen(true)}
                  />
                </div>

                <div
                  className="cursor-pointer rounded-md hover:bg-muted/40 transition-colors p-1 min-h-[200px]"
                  onClick={() => setCategoryDialogOpen(true)}
                >
                  <PortfolioPieChart
                    data={categorySlices}
                    title="By Category"
                    className="h-[200px]"
                    onClick={() => setCategoryDialogOpen(true)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <PieChartDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        title="Portfolio by Asset"
        data={assetSlices}
      />

      <PieChartDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        title="Portfolio by Category"
        data={categorySlices}
      />
    </>
  );
}

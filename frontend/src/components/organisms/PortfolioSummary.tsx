import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, DollarSign } from "lucide-react";
import { type FixedBalance, type Transaction } from "@/types";
import { type StockPriceInfo } from "@/contexts/AppContext";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { classifyAssetClass, type AssetClass } from "@/lib/assetClass";
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
  /** Only holdings whose asset class is in this set count toward the total/charts. */
  assetFilter: Set<AssetClass>;
}

const HIDDEN = "••••••";

export function PortfolioSummary({
  transactions,
  stockPrices,
  fixedBalances,
  dollarRate,
  dollarRateUpdatedAt,
  hideValues,
  assetFilter,
}: PortfolioSummaryProps) {
  const [expanded, setExpanded] = useState(true);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const { totalUSD, totalInBRL, totalPnlInBRL, assetSlices, categorySlices } =
    useMemo(() => {
    const categoryMap = new Map<string, string>();
    for (const sp of stockPrices) {
      categoryMap.set(sp.symbol, sp.category || "Other");
    }

    // A single symbol can mix currencies (e.g. BTC/USD bought in both USD and
    // BRL), so we normalize every transaction to BRL using ITS OWN currency
    // rather than tagging the whole position with one currency.
    const symbolMap = new Map<
      string,
      {
        buyQuantity: number;
        sellQuantity: number;
        totalBuyCostBrl: number;
        totalFeesBrl: number;
        currentPriceBrl: number;
        currencies: Set<string>;
      }
    >();

    for (const t of transactions) {
      const txCurrency = (t.currency || "USD").toUpperCase();
      // Market value at today's rate; cost at the rate actually paid on the
      // purchase date (0 → not backfilled → fall back to today's rate).
      const marketRate = txCurrency === "USD" ? dollarRate : 1;
      const costRate =
        txCurrency === "USD"
          ? t.exchange_rate && t.exchange_rate > 0
            ? t.exchange_rate
            : dollarRate
          : 1;

      const entry = symbolMap.get(t.symbol) ?? {
        buyQuantity: 0,
        sellQuantity: 0,
        totalBuyCostBrl: 0,
        totalFeesBrl: 0,
        currentPriceBrl: 0,
        currencies: new Set<string>(),
      };

      entry.currencies.add(txCurrency);

      if (t.type === "BUY") {
        entry.buyQuantity += t.quantity;
        entry.totalBuyCostBrl += t.quantity * t.price * costRate;
      } else {
        entry.sellQuantity += t.quantity;
      }

      entry.totalFeesBrl += (t.fee || 0) * costRate;

      // Backend returns current_price in the transaction's own currency.
      if (t.current_price) {
        entry.currentPriceBrl = t.current_price * marketRate;
      }

      symbolMap.set(t.symbol, entry);
    }

    // Everything rolls up directly in BRL: market value at today's rate, cost at
    // the historical purchase-day rate, so PnL includes the currency (FX) gain.
    // usdMarketValue is kept only for the informational "in dollar" line.
    let marketBrl = 0;
    let costBrl = 0;
    let usdMarketValue = 0;
    const chartSlices: PieSlice[] = [];
    const catTotals = new Map<string, number>();

    for (const [symbol, data] of symbolMap) {
      const category = categoryMap.get(symbol) || "Other";
      const isUsdOnly =
        data.currencies.size === 1 && data.currencies.has("USD");
      const assetClass = classifyAssetClass({ symbol, isUsdOnly });
      if (!assetFilter.has(assetClass)) continue;

      const netQuantity = data.buyQuantity - data.sellQuantity;
      const valueBrl = netQuantity * data.currentPriceBrl;
      const avgBuyPriceBrl =
        data.buyQuantity > 0 ? data.totalBuyCostBrl / data.buyQuantity : 0;
      const costBasisBrl = netQuantity * avgBuyPriceBrl;

      marketBrl += valueBrl;
      costBrl += costBasisBrl + data.totalFeesBrl;
      // Positions bought entirely in USD also feed the informational USD total.
      if (isUsdOnly && dollarRate > 0) {
        usdMarketValue += valueBrl / dollarRate;
      }

      const absValue = Math.abs(valueBrl);

      chartSlices.push({ name: symbol, value: absValue });

      catTotals.set(category, (catTotals.get(category) || 0) + absValue);
    }

    for (const fb of fixedBalances) {
      if (!assetFilter.has("FIXA")) continue;
      const category = fb.category || "FIXA";

      const amount = fb.amount || 0;
      const currency = fb.currency || "BRL";
      if (currency === "BRL") {
        marketBrl += amount;
        costBrl += amount;
      } else {
        marketBrl += amount * dollarRate;
        costBrl += amount * dollarRate;
        usdMarketValue += amount;
      }

      const valueInBRL = currency === "BRL" ? amount : amount * dollarRate;
      const absValue = Math.abs(valueInBRL);
      chartSlices.push({ name: fb.name, value: absValue });

      catTotals.set(category, (catTotals.get(category) || 0) + absValue);
    }

    const catSlices: PieSlice[] = [];
    for (const [name, value] of catTotals) {
      catSlices.push({ name, value });
    }
    catSlices.sort((a, b) => b.value - a.value);

    return {
      totalUSD: usdMarketValue,
      totalInBRL: marketBrl,
      totalPnlInBRL: marketBrl - costBrl,
      assetSlices: chartSlices,
      categorySlices: catSlices,
    };
  }, [transactions, stockPrices, fixedBalances, dollarRate, assetFilter]);

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

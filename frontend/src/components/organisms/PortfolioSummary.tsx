import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign } from "lucide-react";
import { type Transaction } from "@/types";
import { formatCurrency } from "@/lib/format";
import {
  PortfolioPieChart,
  type PieSlice,
} from "@/components/organisms/PortfolioPieChart";

export interface StockPriceInfo {
  symbol: string;
  price: number;
  tags: string;
  category: string;
  currency: string;
  updated_at: string;
}

interface PortfolioSummaryProps {
  transactions: Transaction[];
  stockPrices: StockPriceInfo[];
  dollarRate: number;
  onDollarRateChange: (rate: number) => void;
  hideValues?: boolean;
}

const HIDDEN = "••••••";

export function PortfolioSummary({
  transactions,
  stockPrices,
  dollarRate,
  onDollarRateChange,
  hideValues,
}: PortfolioSummaryProps) {
  const [rateInput, setRateInput] = useState(String(dollarRate));

  const {
    totalUSD,
    totalBRL,
    totalPnlUSD,
    totalPnlBRL,
    assetSlices,
    categorySlices,
  } = useMemo(() => {
    // Build category lookup from stock prices
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

      // For the pie charts, convert everything to BRL
      const valueInBRL = data.currency === "BRL" ? value : value * dollarRate;
      const absValue = Math.abs(valueInBRL);

      chartSlices.push({ name: symbol, value: absValue });

      // Aggregate by category
      const category = categoryMap.get(symbol) || "Other";
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
  }, [transactions, stockPrices, dollarRate]);

  const totalInBRL = totalBRL + totalUSD * dollarRate;
  const totalPnlInBRL = totalPnlBRL + totalPnlUSD * dollarRate;
  const isPnlPositive = totalPnlInBRL >= 0;

  const handleRateBlur = () => {
    const parsed = parseFloat(rateInput);
    if (!isNaN(parsed) && parsed > 0) {
      onDollarRateChange(parsed);
    } else {
      setRateInput(String(dollarRate));
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Portfolio Value
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-3xl font-bold">
            {hideValues ? HIDDEN : formatCurrency(totalInBRL, "BRL")}
          </div>
          <p
            className={`text-sm font-semibold ${hideValues ? "text-muted-foreground" : isPnlPositive ? "text-emerald-600" : "text-red-600"}`}
          >
            {hideValues
              ? HIDDEN
              : `${isPnlPositive ? "+" : ""}${formatCurrency(totalPnlInBRL, "BRL")} earnings`}
          </p>
          <p className="text-xs text-muted-foreground">
            {hideValues
              ? HIDDEN
              : `${formatCurrency(totalUSD, "USD")} in dollar`}
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">
              USD 1 =
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              className="h-7 w-24 text-xs"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={handleRateBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRateBlur();
              }}
            />
            <span className="text-xs text-muted-foreground">BRL</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Portfolio Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PortfolioPieChart
            data={assetSlices}
            title="By Asset"
            className="h-[200px]"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Portfolio Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PortfolioPieChart
            data={categorySlices}
            title="By Category"
            className="h-[200px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}

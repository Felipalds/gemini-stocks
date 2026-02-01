import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { TickerCard, type TickerData } from "@/components/organisms/TickerCard";
import { type Transaction } from "@/types";
import { toast } from "sonner";

interface StockPrice {
  symbol: string;
  price: number;
  tags: string;
  category: string;
  currency: string;
  updated_at: string;
}

export default function PortfolioPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stockPrices, setStockPrices] = useState<StockPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [hideValues, setHideValues] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("http://localhost:8080/transactions").then((r) => r.json()),
      fetch("http://localhost:8080/prices").then((r) => r.json()),
    ])
      .then(([txData, priceData]) => {
        setTransactions(txData || []);
        setStockPrices(priceData || []);
      })
      .catch((err) => console.error("Error fetching:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleSyncPrices = async () => {
    setSyncing(true);
    const toastId = toast.loading("Syncing prices...", {
      description: "Fetching latest data from Twelvedata.",
    });
    try {
      const res = await fetch("http://localhost:8080/prices/refresh", {
        method: "POST",
      });
      if (res.ok) {
        fetchData();
        toast.success("Prices Updated", {
          id: toastId,
          description: "Your portfolio values are now up to date.",
        });
      } else {
        toast.error("Update Failed", {
          id: toastId,
          description: "Could not update prices. Try again later.",
        });
      }
    } catch {
      toast.error("Connection Error", {
        id: toastId,
        description: "Failed to reach the server.",
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tickers: TickerData[] = useMemo(() => {
    // Build tags and category lookup from stock prices
    const tagsMap = new Map<string, string[]>();
    const categoryMap = new Map<string, string>();
    const currencyMap = new Map<string, string>();
    for (const sp of stockPrices) {
      const tags = sp.tags
        ? sp.tags.split(",").filter((t) => t.trim() !== "")
        : [];
      tagsMap.set(sp.symbol, tags);
      categoryMap.set(sp.symbol, sp.category || "");
      currencyMap.set(sp.symbol, sp.currency || "USD");
    }

    const map = new Map<
      string,
      {
        buyQuantity: number;
        sellQuantity: number;
        totalBuyCost: number;
        totalFees: number;
        currentPrice: number;
      }
    >();

    for (const t of transactions) {
      const entry = map.get(t.symbol) ?? {
        buyQuantity: 0,
        sellQuantity: 0,
        totalBuyCost: 0,
        totalFees: 0,
        currentPrice: 0,
      };

      if (t.type === "BUY") {
        entry.totalBuyCost += t.quantity * t.price;
        entry.buyQuantity += t.quantity;
      } else {
        entry.sellQuantity += t.quantity;
      }

      entry.totalFees += t.fee || 0;

      if (t.current_price) {
        entry.currentPrice = t.current_price;
      }

      map.set(t.symbol, entry);
    }

    const result: TickerData[] = [];
    for (const [symbol, data] of map) {
      const netQuantity = data.buyQuantity - data.sellQuantity;
      const avgBuyPrice =
        data.buyQuantity > 0 ? data.totalBuyCost / data.buyQuantity : 0;
      const totalValue = netQuantity * data.currentPrice;
      const totalCostBasis = netQuantity * avgBuyPrice;
      const pnl = totalValue - totalCostBasis - data.totalFees;
      const pnlPercent =
        totalCostBasis !== 0 ? (pnl / totalCostBasis) * 100 : 0;

      result.push({
        symbol,
        netQuantity,
        avgBuyPrice,
        currentPrice: data.currentPrice,
        totalValue,
        pnl,
        pnlPercent,
        tags: tagsMap.get(symbol) ?? [],
        category: categoryMap.get(symbol) ?? "",
        currency: currencyMap.get(symbol) ?? "USD",
      });
    }

    return result.sort((a, b) => b.totalValue - a.totalValue);
  }, [transactions, stockPrices]);

  return (
    <DashboardLayout
      onRefresh={fetchData}
      isLoading={loading}
      onSyncPrices={handleSyncPrices}
      isSyncing={syncing}
      hideValues={hideValues}
      onToggleHideValues={() => setHideValues((v) => !v)}
    >
      {tickers.length === 0 && !loading ? (
        <div className="text-center py-10 text-muted-foreground">
          No holdings found. Add some transactions first!
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-4">
          {tickers.map((ticker) => {
            const totalAbsValue = tickers.reduce(
              (sum, t) => sum + Math.abs(t.totalValue),
              0,
            );
            const weight =
              totalAbsValue > 0
                ? Math.abs(ticker.totalValue) / totalAbsValue
                : 1 / tickers.length;
            // Scale to 6 columns: min 2, max 6
            const span = Math.max(2, Math.min(6, Math.round(weight * 6)));

            return (
              <TickerCard
                key={ticker.symbol}
                ticker={ticker}
                onEdited={fetchData}
                hideValues={hideValues}
                className={
                  span === 6
                    ? "col-span-6"
                    : span === 5
                      ? "col-span-5"
                      : span === 4
                        ? "col-span-4"
                        : span === 3
                          ? "col-span-3"
                          : "col-span-2"
                }
              />
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

import { useState, useMemo, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { TransactionList } from "@/components/organisms/TransactionList";
import { PortfolioSummary } from "@/components/organisms/PortfolioSummary";
import { ImportExcelDialog } from "@/components/organisms/ImportExcelDialog";
import { GoalDialog } from "@/components/organisms/GoalDialog";
import { AllTransactionsDialog } from "@/components/organisms/AllTransactionsDialog";
import { TickerCard, type TickerData } from "@/components/organisms/TickerCard";
import { useApp } from "@/contexts/AppContext";
import { squarify } from "@/lib/treemap";
import { toast } from "sonner";

export default function DashboardPage() {
  const {
    transactions,
    stockPrices,
    loading,
    syncing,
    dollarRate,
    hideValues,
    setDollarRate,
    toggleHideValues,
    refreshData,
    syncPrices,
  } = useApp();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [allTransactionsDialogOpen, setAllTransactionsDialogOpen] =
    useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Portfolio treemap logic (from Portfolio.tsx)
  const tickers: TickerData[] = useMemo(() => {
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
      const currency = currencyMap.get(symbol) ?? "USD";
      const rate = currency === "USD" ? dollarRate : 1;

      const avgBuyPrice =
        data.buyQuantity > 0 ? data.totalBuyCost / data.buyQuantity : 0;
      const totalValue = netQuantity * data.currentPrice * rate;
      const totalCostBasis = netQuantity * avgBuyPrice * rate;
      const totalFeesBrl = data.totalFees * rate;
      const pnl = totalValue - totalCostBasis - totalFeesBrl;
      const pnlPercent =
        totalCostBasis !== 0 ? (pnl / totalCostBasis) * 100 : 0;

      result.push({
        symbol,
        netQuantity,
        avgBuyPrice: avgBuyPrice * rate,
        currentPrice: data.currentPrice * rate,
        totalValue,
        pnl,
        pnlPercent,
        tags: tagsMap.get(symbol) ?? [],
        category: categoryMap.get(symbol) ?? "",
        currency: "BRL",
      });
    }

    return result.sort((a, b) => b.totalValue - a.totalValue);
  }, [transactions, stockPrices, dollarRate]);

  const totalPortfolioValue = useMemo(() => {
    return tickers.reduce((sum, t) => sum + Math.abs(t.totalValue), 0);
  }, [tickers]);

  const treemapRects = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return [];
    const items = tickers.map((t) => ({
      id: t.symbol,
      value: Math.abs(t.totalValue),
    }));
    return squarify(items, containerSize.width, containerSize.height);
  }, [tickers, containerSize]);

  const tickerMap = useMemo(() => {
    const m = new Map<string, TickerData>();
    for (const t of tickers) m.set(t.symbol, t);
    return m;
  }, [tickers]);

  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5);
  }, [transactions]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    const toastId = toast.loading("Deleting transaction...");

    try {
      const res = await fetch(`http://localhost:8080/transactions/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Transaction deleted", { id: toastId });
        refreshData();
      } else {
        toast.error("Failed to delete", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      toast.error("Error connecting to server", { id: toastId });
    }
  };

  return (
    <DashboardLayout
      onRefresh={refreshData}
      isLoading={loading}
      onSyncPrices={syncPrices}
      isSyncing={syncing}
      onImportExcel={() => setImportDialogOpen(true)}
      onGoal={() => setGoalDialogOpen(true)}
      onAllTransactions={() => setAllTransactionsDialogOpen(true)}
      hideValues={hideValues}
      onToggleHideValues={toggleHideValues}
    >
      {/* Portfolio Summary */}
      <PortfolioSummary
        transactions={transactions}
        stockPrices={stockPrices}
        dollarRate={dollarRate}
        onDollarRateChange={setDollarRate}
        hideValues={hideValues}
      />

      {/* Treemap Portfolio */}
      {tickers.length === 0 && !loading ? (
        <div className="text-center py-10 text-muted-foreground">
          No holdings found. Add some transactions first!
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative w-full mt-6"
          style={{ height: "500px" }}
        >
          {treemapRects.map((rect) => {
            const ticker = tickerMap.get(rect.id);
            if (!ticker) return null;
            return (
              <div
                key={rect.id}
                className="absolute p-1"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                }}
              >
                <TickerCard
                  ticker={ticker}
                  onEdited={refreshData}
                  hideValues={hideValues}
                  compact={rect.width < 250 || rect.height < 200}
                  portfolioPercent={
                    totalPortfolioValue > 0
                      ? (Math.abs(ticker.totalValue) / totalPortfolioValue) *
                        100
                      : 0
                  }
                  className="h-full"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Transactions */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Recent Transactions</h2>
          {transactions.length > 5 && (
            <span className="text-sm text-muted-foreground">
              Showing 5 of {transactions.length} transactions
            </span>
          )}
        </div>
        <TransactionList
          transactions={recentTransactions}
          isLoading={loading}
          onDelete={handleDelete}
          onEdited={refreshData}
        />
        {transactions.length > 5 && (
          <div className="text-center mt-4 text-sm text-muted-foreground">
            Click "All Transactions" in the header to view all
          </div>
        )}
      </div>

      <ImportExcelDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={refreshData}
      />
      <GoalDialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen} />
      <AllTransactionsDialog
        open={allTransactionsDialogOpen}
        onOpenChange={setAllTransactionsDialogOpen}
        transactions={transactions}
        isLoading={loading}
        onDelete={handleDelete}
        onEdited={refreshData}
      />
    </DashboardLayout>
  );
}

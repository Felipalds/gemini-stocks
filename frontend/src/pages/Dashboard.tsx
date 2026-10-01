import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { TransactionList } from "@/components/organisms/TransactionList";
import { PortfolioSummary } from "@/components/organisms/PortfolioSummary";
import { ImportExcelDialog } from "@/components/organisms/ImportExcelDialog";
import { GoalDialog } from "@/components/organisms/GoalDialog";
import { AllTransactionsDialog } from "@/components/organisms/AllTransactionsDialog";
import { TickerCard, type TickerData } from "@/components/organisms/TickerCard";
import { PortfolioEvolutionChart } from "@/components/organisms/PortfolioEvolutionChart";
import { GoalProgressCard } from "@/components/organisms/GoalProgressCard";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";

export default function DashboardPage() {
  const {
    transactions,
    stockPrices,
    fixedBalances,
    loading,
    syncing,
    dollarRate,
    dollarRateUpdatedAt,
    hideValues,
    toggleHideValues,
    refreshData,
    syncPrices,
  } = useApp();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalReloadToken, setGoalReloadToken] = useState(0);
  const [allTransactionsDialogOpen, setAllTransactionsDialogOpen] =
    useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Portfolio treemap logic (from Portfolio.tsx)
  const tickers: TickerData[] = useMemo(() => {
    const tagsMap = new Map<string, string[]>();
    const categoryMap = new Map<string, string>();
    const dayChangeMap = new Map<string, number>();
    const updatedAtMap = new Map<string, string>();
    for (const sp of stockPrices) {
      const tags = sp.tags
        ? sp.tags.split(",").filter((t) => t.trim() !== "")
        : [];
      tagsMap.set(sp.symbol, tags);
      categoryMap.set(sp.symbol, sp.category || "");
      dayChangeMap.set(sp.symbol, sp.day_change_percent ?? 0);
      if (sp.updated_at) {
        updatedAtMap.set(sp.symbol, sp.updated_at);
      }
    }

    // Everything is rolled up in BRL. A single symbol can hold transactions in
    // more than one currency (e.g. BTC/USD bought in both USD and BRL), so we
    // convert each transaction with ITS OWN currency instead of assuming the
    // whole position shares the ticker's currency. `*Orig` sums keep the raw,
    // unconverted figures so a position bought entirely in USD can still show
    // its original USD values.
    const map = new Map<
      string,
      {
        buyQuantity: number;
        sellQuantity: number;
        totalBuyCostBrl: number;
        totalFeesBrl: number;
        currentPriceBrl: number;
        currencies: Set<string>;
        totalBuyCostOrig: number;
        totalFeesOrig: number;
        currentPriceOrig: number;
      }
    >();

    for (const t of transactions) {
      const txCurrency = (t.currency || "USD").toUpperCase();
      const rate = txCurrency === "USD" ? dollarRate : 1;

      const entry = map.get(t.symbol) ?? {
        buyQuantity: 0,
        sellQuantity: 0,
        totalBuyCostBrl: 0,
        totalFeesBrl: 0,
        currentPriceBrl: 0,
        currencies: new Set<string>(),
        totalBuyCostOrig: 0,
        totalFeesOrig: 0,
        currentPriceOrig: 0,
      };

      entry.currencies.add(txCurrency);

      if (t.type === "BUY") {
        entry.totalBuyCostBrl += t.quantity * t.price * rate;
        entry.totalBuyCostOrig += t.quantity * t.price;
        entry.buyQuantity += t.quantity;
      } else {
        entry.sellQuantity += t.quantity;
      }

      entry.totalFeesBrl += (t.fee || 0) * rate;
      entry.totalFeesOrig += t.fee || 0;

      // The backend already returns current_price in the transaction's own
      // currency, so normalizing to BRL here yields a consistent per-symbol
      // price regardless of which currency the transaction was entered in.
      if (t.current_price) {
        entry.currentPriceBrl = t.current_price * rate;
        entry.currentPriceOrig = t.current_price;
      }

      map.set(t.symbol, entry);
    }

    const result: TickerData[] = [];
    for (const [symbol, data] of map) {
      const netQuantity = data.buyQuantity - data.sellQuantity;

      const avgBuyPriceBrl =
        data.buyQuantity > 0 ? data.totalBuyCostBrl / data.buyQuantity : 0;
      const totalValue = netQuantity * data.currentPriceBrl;
      const totalCostBasis = netQuantity * avgBuyPriceBrl;
      const pnl = totalValue - totalCostBasis - data.totalFeesBrl;
      const pnlPercent =
        totalCostBasis !== 0 ? (pnl / totalCostBasis) * 100 : 0;

      const tickerData: TickerData = {
        symbol,
        netQuantity,
        avgBuyPrice: avgBuyPriceBrl,
        currentPrice: data.currentPriceBrl,
        dayChangePercent: dayChangeMap.get(symbol) ?? 0,
        totalValue,
        pnl,
        pnlPercent,
        tags: tagsMap.get(symbol) ?? [],
        category: categoryMap.get(symbol) ?? "",
        currency: "BRL",
        updatedAt: updatedAtMap.get(symbol) ?? null,
      };

      // Only positions bought entirely in USD can show meaningful "original
      // USD" figures. Mixed-currency positions (like BTC) are BRL-only.
      const isUsdOnly =
        data.currencies.size === 1 && data.currencies.has("USD");
      if (isUsdOnly) {
        const avgBuyPriceUSD =
          data.buyQuantity > 0 ? data.totalBuyCostOrig / data.buyQuantity : 0;
        const totalValueUSD = netQuantity * data.currentPriceOrig;
        const totalCostBasisUSD = netQuantity * avgBuyPriceUSD;
        const pnlUSD = totalValueUSD - totalCostBasisUSD - data.totalFeesOrig;

        tickerData.originalCurrency = "USD";
        tickerData.avgBuyPriceOriginal = avgBuyPriceUSD;
        tickerData.currentPriceOriginal = data.currentPriceOrig;
        tickerData.pnlOriginal = pnlUSD;
        tickerData.totalValueOriginal = totalValueUSD;
      }

      result.push(tickerData);
    }

    for (const fb of fixedBalances) {
      const rate = fb.currency === "USD" ? dollarRate : 1;
      result.push({
        symbol: fb.name,
        netQuantity: 1,
        avgBuyPrice: fb.amount * rate,
        currentPrice: fb.amount * rate,
        dayChangePercent: 0,
        totalValue: fb.amount * rate,
        pnl: 0,
        pnlPercent: 0,
        tags: [],
        category: fb.category || "FIXA",
        currency: "BRL",
        isFixed: true,
        fixedBalanceId: fb.ID,
      });
    }

    return result.sort((a, b) => b.totalValue - a.totalValue);
  }, [transactions, stockPrices, fixedBalances, dollarRate]);

  const totalPortfolioValue = useMemo(() => {
    return tickers.reduce((sum, t) => sum + Math.abs(t.totalValue), 0);
  }, [tickers]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickers) {
      const cat =
        t.category && t.category.trim() !== "" ? t.category.trim() : "Other";
      set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tickers]);

  const filteredTickers = useMemo(() => {
    if (!categoryFilter) return tickers;
    return tickers.filter((t) => {
      const cat =
        t.category && t.category.trim() !== "" ? t.category.trim() : "Other";
      return cat === categoryFilter;
    });
  }, [tickers, categoryFilter]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
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
      <div className="mb-4">
        <GoalProgressCard
          transactions={transactions}
          stockPrices={stockPrices}
          fixedBalances={fixedBalances}
          dollarRate={dollarRate}
          hideValues={hideValues}
          reloadToken={goalReloadToken}
          onEditGoal={() => setGoalDialogOpen(true)}
        />
      </div>

      {/* Portfolio Summary */}
      <PortfolioSummary
        transactions={transactions}
        stockPrices={stockPrices}
        fixedBalances={fixedBalances}
        dollarRate={dollarRate}
        dollarRateUpdatedAt={dollarRateUpdatedAt}
        hideValues={hideValues}
      />

      <div className="mt-6">
        <PortfolioEvolutionChart hideValues={hideValues} />
      </div>

      {/* Portfolio Grid */}
      {tickers.length === 0 && !loading ? (
        <div className="text-center py-10 text-muted-foreground">
          No holdings found. Add some transactions first!
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={categoryFilter === null ? "default" : "outline"}
                onClick={() => setCategoryFilter(null)}
              >
                All
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat}
                  type="button"
                  size="sm"
                  variant={categoryFilter === cat ? "default" : "outline"}
                  onClick={() =>
                    setCategoryFilter((prev) => (prev === cat ? null : cat))
                  }
                >
                  {cat}
                </Button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-4 gap-4">
            {filteredTickers.map((ticker) => (
              <TickerCard
                key={
                  ticker.isFixed
                    ? `fixed-${ticker.fixedBalanceId}`
                    : ticker.symbol
                }
                ticker={ticker}
                onEdited={refreshData}
                hideValues={hideValues}
                portfolioPercent={
                  totalPortfolioValue > 0
                    ? (Math.abs(ticker.totalValue) / totalPortfolioValue) * 100
                    : 0
                }
                className="col-span-1"
              />
            ))}
          </div>
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
      <GoalDialog
        open={goalDialogOpen}
        onOpenChange={(open) => {
          setGoalDialogOpen(open);
          if (!open) {
            setGoalReloadToken((n) => n + 1);
          }
        }}
      />
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

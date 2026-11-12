import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { TransactionList } from "@/components/organisms/TransactionList";
import { PortfolioSummary } from "@/components/organisms/PortfolioSummary";
import { ImportExcelDialog } from "@/components/organisms/ImportExcelDialog";
import { GoalDialog } from "@/components/organisms/GoalDialog";
import { AllTransactionsDialog } from "@/components/organisms/AllTransactionsDialog";
import { TickerCard, type TickerData } from "@/components/organisms/TickerCard";
import { PortfolioEvolutionChart } from "@/components/organisms/PortfolioEvolutionChart";
import { PortfolioReconstructionChart } from "@/components/organisms/PortfolioReconstructionChart";
import { DividendsOverview } from "@/components/organisms/DividendsOverview";
import { GoalProgressCard } from "@/components/organisms/GoalProgressCard";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import {
  ASSET_CLASSES,
  classifyAssetClass,
  type AssetClass,
} from "@/lib/assetClass";
import {
  marketRateBRL,
  costRateBRL,
  toUSD,
  pnlPercent as percentOf,
} from "@/lib/rates";
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
    currencyView,
    toggleCurrencyView,
    refreshData,
    syncPrices,
  } = useApp();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalReloadToken, setGoalReloadToken] = useState(0);
  const [allTransactionsDialogOpen, setAllTransactionsDialogOpen] =
    useState(false);
  // Multi-select asset-class filter (BRA / USA / CRYPTO / FIXA). Drives both the
  // squares below and the Total Portfolio summary. Starts with everything shown.
  const [assetFilter, setAssetFilter] = useState<Set<AssetClass>>(
    () => new Set(ASSET_CLASSES),
  );

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
        // USD "view": real dollars for USD buys, current-rate conversion for BRL.
        totalBuyCostUsd: number;
        totalFeesUsd: number;
        currentPriceUsd: number;
      }
    >();

    for (const t of transactions) {
      const txCurrency = (t.currency || "USD").toUpperCase();
      // Market value uses today's rate (what it's worth now); cost uses the rate
      // actually paid on the purchase date (snapshotted on the transaction),
      // falling back to today's rate for rows not yet backfilled (never 0).
      const marketRate = marketRateBRL(txCurrency, dollarRate);
      const costRate = costRateBRL(txCurrency, t.exchange_rate, dollarRate);
      // USD view: USD buys keep their real dollars; BRL buys convert at today's
      // rate. (0 when we have no rate — handled by leaving USD fields unset below.)
      const costRateUsd = txCurrency === "USD" ? 1 : toUSD(1, dollarRate);
      const marketRateUsd = costRateUsd;

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
        totalBuyCostUsd: 0,
        totalFeesUsd: 0,
        currentPriceUsd: 0,
      };

      entry.currencies.add(txCurrency);

      if (t.type === "BUY") {
        entry.totalBuyCostBrl += t.quantity * t.price * costRate;
        entry.totalBuyCostOrig += t.quantity * t.price;
        entry.totalBuyCostUsd += t.quantity * t.price * costRateUsd;
        entry.buyQuantity += t.quantity;
      } else {
        entry.sellQuantity += t.quantity;
      }

      entry.totalFeesBrl += (t.fee || 0) * costRate;
      entry.totalFeesOrig += t.fee || 0;
      entry.totalFeesUsd += (t.fee || 0) * costRateUsd;

      // The backend already returns current_price in the transaction's own
      // currency, so normalizing to BRL here yields a consistent per-symbol
      // price regardless of which currency the transaction was entered in.
      if (t.current_price) {
        entry.currentPriceBrl = t.current_price * marketRate;
        entry.currentPriceOrig = t.current_price;
        entry.currentPriceUsd = t.current_price * marketRateUsd;
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
      const pnlPercent = percentOf(pnl, totalCostBasis);

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

      // USD view for every position: USD-native buys show real dollars (pure-USD
      // PnL, no FX); BRL/mixed buys are converted at today's rate. Only set when we
      // have a rate — otherwise the card falls back to the BRL figures.
      if (dollarRate > 0) {
        const avgBuyPriceUsd =
          data.buyQuantity > 0 ? data.totalBuyCostUsd / data.buyQuantity : 0;
        const totalValueUsd = netQuantity * data.currentPriceUsd;
        const totalCostBasisUsd = netQuantity * avgBuyPriceUsd;
        const pnlUsd = totalValueUsd - totalCostBasisUsd - data.totalFeesUsd;

        tickerData.totalValueUsd = totalValueUsd;
        tickerData.avgBuyPriceUsd = avgBuyPriceUsd;
        tickerData.currentPriceUsd = data.currentPriceUsd;
        tickerData.pnlUsd = pnlUsd;
        tickerData.pnlPercentUsd = percentOf(pnlUsd, totalCostBasisUsd);
      }

      // Keep originalCurrency on pure-USD positions for other consumers
      // (e.g. StockDetailDialog) that still read the *Original fields.
      const isUsdOnly =
        data.currencies.size === 1 && data.currencies.has("USD");
      if (isUsdOnly) {
        const avgBuyPriceUSD =
          data.buyQuantity > 0 ? data.totalBuyCostOrig / data.buyQuantity : 0;
        tickerData.originalCurrency = "USD";
        tickerData.avgBuyPriceOriginal = avgBuyPriceUSD;
        tickerData.currentPriceOriginal = data.currentPriceOrig;
        tickerData.pnlOriginal =
          netQuantity * data.currentPriceOrig -
          netQuantity * avgBuyPriceUSD -
          data.totalFeesOrig;
        tickerData.totalValueOriginal = netQuantity * data.currentPriceOrig;
      }

      result.push(tickerData);
    }

    for (const fb of fixedBalances) {
      const rate = fb.currency === "USD" ? dollarRate : 1;
      const brlAmount = fb.amount * rate;
      const usdAmount =
        fb.currency === "USD"
          ? fb.amount
          : dollarRate > 0
            ? fb.amount / dollarRate
            : undefined;
      result.push({
        symbol: fb.name,
        netQuantity: 1,
        avgBuyPrice: brlAmount,
        currentPrice: brlAmount,
        dayChangePercent: 0,
        totalValue: brlAmount,
        pnl: 0,
        pnlPercent: 0,
        tags: [],
        category: fb.category || "FIXA",
        currency: "BRL",
        isFixed: true,
        fixedBalanceId: fb.ID,
        totalValueUsd: usdAmount,
        avgBuyPriceUsd: usdAmount,
        currentPriceUsd: usdAmount,
        pnlUsd: 0,
        pnlPercentUsd: 0,
      });
    }

    return result.sort((a, b) => b.totalValue - a.totalValue);
  }, [transactions, stockPrices, fixedBalances, dollarRate]);

  // Asset classes actually present in the portfolio, in canonical order, so we
  // only render filter buttons that mean something.
  const presentClasses = useMemo(() => {
    const present = new Set<AssetClass>();
    for (const t of tickers)
      present.add(
        classifyAssetClass({
          symbol: t.symbol,
          isFixed: t.isFixed,
          isUsdOnly: t.originalCurrency === "USD",
        }),
      );
    return ASSET_CLASSES.filter((c) => present.has(c));
  }, [tickers]);

  const filteredTickers = useMemo(
    () =>
      tickers.filter((t) =>
        assetFilter.has(
          classifyAssetClass({
            symbol: t.symbol,
            isFixed: t.isFixed,
            isUsdOnly: t.originalCurrency === "USD",
          }),
        ),
      ),
    [tickers, assetFilter],
  );

  // Square weights are relative to what's currently shown.
  const totalPortfolioValue = useMemo(() => {
    return filteredTickers.reduce((sum, t) => sum + Math.abs(t.totalValue), 0);
  }, [filteredTickers]);

  const allSelected = presentClasses.every((c) => assetFilter.has(c));
  const toggleClass = (c: AssetClass) =>
    setAssetFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

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
      currencyView={currencyView}
      onToggleCurrencyView={toggleCurrencyView}
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
        assetFilter={assetFilter}
        currencyView={currencyView}
      />

      {/* Dividends quick view: total + per-ticker pie + cumulative line */}
      <div className="mt-6">
        <DividendsOverview hideValues={hideValues} />
      </div>

      <div className="mt-6 space-y-6">
        <PortfolioEvolutionChart hideValues={hideValues} />
        <PortfolioReconstructionChart
          hideValues={hideValues}
          assetFilter={assetFilter}
        />
      </div>

      {/* Portfolio Grid */}
      {tickers.length === 0 && !loading ? (
        <div className="text-center py-10 text-muted-foreground">
          No holdings found. Add some transactions first!
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {presentClasses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={allSelected ? "default" : "outline"}
                onClick={() => setAssetFilter(new Set(presentClasses))}
              >
                All
              </Button>
              {presentClasses.map((cls) => (
                <Button
                  key={cls}
                  type="button"
                  size="sm"
                  variant={assetFilter.has(cls) ? "default" : "outline"}
                  onClick={() => toggleClass(cls)}
                >
                  {cls}
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
                currencyView={currencyView}
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
          <div className="text-center mt-4">
            <Button
              variant="outline"
              onClick={() => setAllTransactionsDialogOpen(true)}
            >
              See All Transactions
            </Button>
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

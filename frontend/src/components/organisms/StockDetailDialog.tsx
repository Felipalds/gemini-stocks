import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Pencil, RefreshCw } from "lucide-react";
import { type TickerData } from "@/components/organisms/TickerCard";
import { TickerHistoryChart } from "@/components/organisms/TickerHistoryChart";
import { TransactionList } from "@/components/organisms/TransactionList";
import { AllTransactionsDialog } from "@/components/organisms/AllTransactionsDialog";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { toast } from "sonner";

interface StockDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: TickerData;
  portfolioPercent: number;
  hideValues?: boolean;
  onEdit?: () => void;
  onRefreshed?: () => void;
}

const HIDDEN = "••••••";

function formatUpdatedAt(iso?: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StockDetailDialog({
  open,
  onOpenChange,
  ticker,
  portfolioPercent,
  hideValues,
  onEdit,
  onRefreshed,
}: StockDetailDialogProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [allTxOpen, setAllTxOpen] = useState(false);
  const { transactions, loading, refreshData } = useApp();
  const fmt = (val: number) => formatCurrency(val, ticker.currency);
  const isPositive = ticker.pnl >= 0;

  const tickerTransactions = useMemo(
    () =>
      transactions
        .filter((t) => t.symbol === ticker.symbol)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ),
    [transactions, ticker.symbol],
  );
  const latestTransactions = tickerTransactions.slice(0, 5);

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    const toastId = toast.loading("Deleting transaction...");
    try {
      const res = await fetch(`http://localhost:8080/transactions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Transaction deleted", { id: toastId });
        refreshData();
        onRefreshed?.();
      } else {
        toast.error("Failed to delete", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      toast.error("Error connecting to server", { id: toastId });
    }
  };

  const handleTransactionEdited = () => {
    refreshData();
    onRefreshed?.();
  };

  // Solid background: blend tint with base color (white for light, dark gray for dark)
  const intensity = Math.min(Math.abs(ticker.pnlPercent) / 20, 1);
  const mix = 0.08 + intensity * 0.27;
  const isDark = document.documentElement.classList.contains("dark");
  const base = isDark ? 24 : 255;
  const tint = isPositive ? [16, 185, 129] : [239, 68, 68];
  const r = Math.round(tint[0] * mix + base * (1 - mix));
  const g = Math.round(tint[1] * mix + base * (1 - mix));
  const b = Math.round(tint[2] * mix + base * (1 - mix));
  const bgColor = `rgb(${r}, ${g}, ${b})`;

  const handleForceRefresh = async () => {
    setRefreshing(true);
    const toastId = toast.loading(`Updating ${ticker.symbol}...`, {
      description: "Force refresh bypasses the once-per-day cache.",
    });
    try {
      const res = await fetch(
        `http://localhost:8080/prices/refresh-one?symbol=${encodeURIComponent(ticker.symbol)}`,
        { method: "POST" },
      );
      if (res.ok) {
        toast.success(`${ticker.symbol} updated`, {
          id: toastId,
          description: "Latest price fetched from Yahoo Finance.",
        });
        onRefreshed?.();
      } else {
        const text = await res.text();
        toast.error("Update failed", {
          id: toastId,
          description: text || "Could not refresh this ticker.",
        });
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[90vw] max-w-4xl max-h-[85vh] flex flex-col"
        style={{ backgroundColor: bgColor }}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="text-3xl font-bold">
              {ticker.symbol}
            </DialogTitle>
            <Badge
              variant={isPositive ? "default" : "destructive"}
              className={`text-sm px-3 py-1 ${
                isPositive
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {isPositive ? (
                <TrendingUp className="mr-1 h-4 w-4" />
              ) : (
                <TrendingDown className="mr-1 h-4 w-4" />
              )}
              {isPositive ? "+" : ""}
              {ticker.pnlPercent.toFixed(2)}%
            </Badge>
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleForceRefresh()}
              disabled={refreshing}
            >
              <RefreshCw
                className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Updating..." : "Update price"}
            </Button>
          </div>
          <DialogDescription>
            {ticker.category && <span>{ticker.category}</span>}
            {ticker.category && " · "}
            Portfolio weight:{" "}
            {hideValues ? HIDDEN : `${portfolioPercent.toFixed(2)}%`}
            {" · "}
            Last price update: {formatUpdatedAt(ticker.updatedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-6">
          {/* Total Value */}
          <div className="mb-8">
            <span className="text-sm text-muted-foreground">Total Value</span>
            <div className="text-5xl font-bold mt-1">
              {hideValues ? HIDDEN : fmt(ticker.totalValue)}
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <DetailItem
              label="Shares"
              value={hideValues ? HIDDEN : formatQuantity(ticker.netQuantity)}
            />
            <DetailItem
              label="Avg Buy Price"
              value={hideValues ? HIDDEN : fmt(ticker.avgBuyPrice)}
            />
            <DetailItem
              label="Current Price"
              value={hideValues ? HIDDEN : fmt(ticker.currentPrice)}
            />
            <DetailItem
              label="P&L"
              value={
                hideValues
                  ? HIDDEN
                  : `${isPositive ? "+" : ""}${fmt(ticker.pnl)}`
              }
              className={
                hideValues
                  ? "text-muted-foreground"
                  : isPositive
                    ? "text-emerald-600"
                    : "text-red-600"
              }
            />
            <DetailItem
              label="Last Updated"
              value={formatUpdatedAt(ticker.updatedAt)}
            />
          </div>

          {/* Tags */}
          {ticker.tags.length > 0 && (
            <div className="mt-8">
              <span className="text-sm text-muted-foreground">Tags</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {ticker.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Price history chart, loaded inline while this dialog is open */}
          <div className="mt-10">
            <TickerHistoryChart
              symbol={ticker.symbol}
              currency={ticker.currency}
              hideValues={hideValues}
              active={open}
            />
          </div>

          {/* Latest transactions for this ticker */}
          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">
                Latest transactions
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {tickerTransactions.length} total
                </span>
              </h3>
              {tickerTransactions.length > 5 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAllTxOpen(true)}
                >
                  Show all
                </Button>
              )}
            </div>
            <TransactionList
              transactions={latestTransactions}
              isLoading={loading}
              onDelete={(id) => void handleDeleteTransaction(id)}
              onEdited={handleTransactionEdited}
            />
          </div>
        </div>
      </DialogContent>

      <AllTransactionsDialog
        open={allTxOpen}
        onOpenChange={setAllTxOpen}
        transactions={tickerTransactions}
        isLoading={loading}
        onDelete={(id) => void handleDeleteTransaction(id)}
        onEdited={handleTransactionEdited}
      />
    </Dialog>
  );
}

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className={`text-xl font-bold mt-1 ${className ?? ""}`}>{value}</div>
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { TransactionList } from "@/components/organisms/TransactionList";
import {
  PortfolioSummary,
  type StockPriceInfo,
} from "@/components/organisms/PortfolioSummary";
import { ImportExcelDialog } from "@/components/organisms/ImportExcelDialog";
import { type Transaction } from "@/types";
import { toast } from "sonner";

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stockPrices, setStockPrices] = useState<StockPriceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dollarRate, setDollarRate] = useState(5.5);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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
    } catch (error) {
      toast.error("Connection Error", {
        id: toastId,
        description: "Failed to reach the server.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    // 1. Optional: Add a confirmation dialog check here if you want
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    const toastId = toast.loading("Deleting transaction...");

    try {
      const res = await fetch(`http://localhost:8080/transactions/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Transaction deleted", { id: toastId });
        fetchData(); // Refresh the list
      } else {
        toast.error("Failed to delete", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      toast.error("Error connecting to server", { id: toastId });
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <DashboardLayout
      onRefresh={fetchData}
      isLoading={loading}
      onSyncPrices={handleSyncPrices}
      isSyncing={syncing}
      onImportExcel={() => setImportDialogOpen(true)}
    >
      <PortfolioSummary
        transactions={transactions}
        stockPrices={stockPrices}
        dollarRate={dollarRate}
        onDollarRateChange={setDollarRate}
      />
      <TransactionList
        transactions={transactions}
        isLoading={loading}
        onDelete={handleDelete}
        onEdited={fetchData}
      />
      <ImportExcelDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={fetchData}
      />
    </DashboardLayout>
  );
}

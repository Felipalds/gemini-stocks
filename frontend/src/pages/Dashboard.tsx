import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { TransactionList } from "@/components/organisms/TransactionList";
import { type Transaction } from "@/types";
import { toast } from "sonner"; // <--- Import directly

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchTransactions = () => {
    setLoading(true);
    fetch("http://localhost:8080/transactions")
      .then((res) => res.json())
      .then((data) => {
        setTransactions(data || []);
      })
      .catch((err) => console.error("Error fetching:", err))
      .finally(() => setLoading(false));
  };

  const handleSyncPrices = async () => {
    setSyncing(true);

    // 1. Show Loading Toast
    const toastId = toast.loading("Syncing prices...", {
      description: "Fetching latest data from Twelvedata.",
    });

    try {
      const res = await fetch("http://localhost:8080/prices/refresh", {
        method: "POST",
      });

      if (res.ok) {
        fetchTransactions();
        // 2. Update Toast to Success
        toast.success("Prices Updated", {
          id: toastId, // Replaces the loading toast
          description: "Your portfolio values are now up to date.",
        });
      } else {
        // 3. Update Toast to Error
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
        fetchTransactions(); // Refresh the list
      } else {
        toast.error("Failed to delete", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      toast.error("Error connecting to server", { id: toastId });
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  return (
    <DashboardLayout
      onRefresh={fetchTransactions}
      isLoading={loading}
      onSyncPrices={handleSyncPrices} // Pass logic
      isSyncing={syncing}
    >
      <TransactionList
        transactions={transactions}
        isLoading={loading}
        onDelete={handleDelete}
      />
    </DashboardLayout>
  );
}

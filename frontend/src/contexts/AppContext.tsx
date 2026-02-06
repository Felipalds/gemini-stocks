import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { type Transaction } from "@/types";
import { toast } from "sonner";

export interface StockPriceInfo {
  symbol: string;
  price: number;
  tags: string;
  category: string;
  currency: string;
  updated_at: string;
}

export interface CurrencyInfo {
  code: string;
  rate: number;
  updated_at: string;
}

interface AppContextValue {
  transactions: Transaction[];
  stockPrices: StockPriceInfo[];
  loading: boolean;
  syncing: boolean;
  dollarRate: number;
  dollarRateUpdatedAt: string | null;
  hideValues: boolean;
  toggleHideValues: () => void;
  refreshData: () => void;
  syncPrices: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stockPrices, setStockPrices] = useState<StockPriceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dollarRate, setDollarRate] = useState(5.5);
  const [dollarRateUpdatedAt, setDollarRateUpdatedAt] = useState<string | null>(
    null,
  );
  const [hideValues, setHideValues] = useState(false);

  const refreshData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("http://localhost:8080/transactions").then((r) => r.json()),
      fetch("http://localhost:8080/prices").then((r) => r.json()),
      fetch("http://localhost:8080/currencies/usd").then((r) => r.json()),
    ])
      .then(([txData, priceData, currencyData]) => {
        setTransactions(txData || []);
        setStockPrices(priceData || []);
        if (currencyData && currencyData.rate) {
          setDollarRate(currencyData.rate);
          setDollarRateUpdatedAt(currencyData.updated_at || null);
        }
      })
      .catch((err) => console.error("Error fetching:", err))
      .finally(() => setLoading(false));
  }, []);

  const syncPrices = useCallback(async () => {
    setSyncing(true);
    const toastId = toast.loading("Syncing prices...", {
      description: "Fetching latest data from Twelvedata.",
    });

    try {
      const res = await fetch("http://localhost:8080/prices/refresh", {
        method: "POST",
      });

      if (res.ok) {
        refreshData();
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
  }, [refreshData]);

  const toggleHideValues = useCallback(() => {
    setHideValues((v) => !v);
  }, []);

  // Fetch once on mount
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return (
    <AppContext.Provider
      value={{
        transactions,
        stockPrices,
        loading,
        syncing,
        dollarRate,
        dollarRateUpdatedAt,
        hideValues,
        toggleHideValues,
        refreshData,
        syncPrices,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

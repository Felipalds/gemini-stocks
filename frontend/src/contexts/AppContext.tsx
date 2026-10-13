import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { type FixedBalance, type Transaction } from "@/types";
import { toast } from "sonner";

export interface StockPriceInfo {
  symbol: string;
  price: number;
  day_change_percent: number;
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
  fixedBalances: FixedBalance[];
  loading: boolean;
  syncing: boolean;
  dollarRate: number;
  dollarRateUpdatedAt: string | null;
  hideValues: boolean;
  toggleHideValues: () => void;
  refreshData: () => void;
  syncPrices: () => Promise<void>;
  /** Manually capture a portfolio snapshot (at most one per day, enforced server-side) */
  takeSnapshot: () => Promise<void>;
  takingSnapshot: boolean;
  /** Bumps after a snapshot is taken so the evolution chart can reload */
  snapshotEpoch: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stockPrices, setStockPrices] = useState<StockPriceInfo[]>([]);
  const [fixedBalances, setFixedBalances] = useState<FixedBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dollarRate, setDollarRate] = useState(5.5);
  const [dollarRateUpdatedAt, setDollarRateUpdatedAt] = useState<string | null>(
    null,
  );
  const [hideValues, setHideValues] = useState(false);
  const [takingSnapshot, setTakingSnapshot] = useState(false);
  const [snapshotEpoch, setSnapshotEpoch] = useState(0);

  const refreshData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("http://localhost:8080/transactions").then((r) => r.json()),
      fetch("http://localhost:8080/prices").then((r) => r.json()),
      fetch("http://localhost:8080/currencies/usd").then((r) => r.json()),
      fetch("http://localhost:8080/fixed-balances").then((r) => r.json()),
    ])
      .then(([txData, priceData, currencyData, fixedData]) => {
        setTransactions(txData || []);
        setStockPrices(priceData || []);
        setFixedBalances(fixedData || []);
        if (currencyData && currencyData.rate) {
          setDollarRate(currencyData.rate);
          setDollarRateUpdatedAt(currencyData.updated_at || null);
        }
      })
      .catch((err) => console.error("Error fetching:", err))
      .finally(() => setLoading(false));
  }, []);

  const takeSnapshot = useCallback(async () => {
    setTakingSnapshot(true);
    const toastId = toast.loading("Taking portfolio snapshot...");
    try {
      const res = await fetch("http://localhost:8080/snapshots", {
        method: "POST",
      });
      if (res.ok) {
        setSnapshotEpoch((n) => n + 1);
        if (res.headers.get("X-Snapshot-Status") === "already-today") {
          toast.success("Snapshot already taken today", {
            id: toastId,
            description: "Only one snapshot per day is kept.",
          });
        } else {
          toast.success("Snapshot saved", {
            id: toastId,
            description: "Portfolio value captured.",
          });
        }
      } else {
        toast.error("Snapshot failed", {
          id: toastId,
          description: "Could not capture the portfolio. Try again later.",
        });
      }
    } catch {
      toast.error("Connection error", {
        id: toastId,
        description: "Failed to reach the server.",
      });
    } finally {
      setTakingSnapshot(false);
    }
  }, []);

  const syncPrices = useCallback(async () => {
    setSyncing(true);
    const toastId = toast.loading("Syncing prices...", {
      description: "Fetching latest data from API (skips symbols already updated today).",
    });

    try {
      const res = await fetch("http://localhost:8080/prices/refresh", {
        method: "POST",
      });

      if (res.ok) {
        const body = (await res.json().catch(() => null)) as {
          updated?: number;
          skipped?: number;
          failed?: number;
          fx_updated?: number;
          fx_skipped?: number;
        } | null;
        refreshData();
        const updated = body?.updated ?? 0;
        const skipped = body?.skipped ?? 0;
        const failed = body?.failed ?? 0;
        if (updated === 0 && skipped > 0 && failed === 0) {
          toast.success("Already up to date", {
            id: toastId,
            description: `Skipped ${skipped} symbol(s) — Alpha is only called once per symbol per day.`,
          });
        } else {
          toast.success("Prices Updated", {
            id: toastId,
            description: `Fetched ${updated}, skipped ${skipped}${failed ? `, failed ${failed}` : ""}.`,
          });
        }
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

  // Fetch once on mount. Snapshots are taken manually (see takeSnapshot).
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return (
    <AppContext.Provider
      value={{
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
        takeSnapshot,
        takingSnapshot,
        snapshotEpoch,
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

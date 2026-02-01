import { ReactNode } from "react";
import { Link } from "react-router-dom"; // <--- Add this import
import { Button } from "@/components/ui/button";
import {
  RefreshCcw,
  Plus,
  CloudDownload,
  Briefcase,
  FileSpreadsheet,
  Eye,
  EyeOff,
} from "lucide-react";
import { ModeToggle } from "@/components/ui/mode-toggle";

interface DashboardLayoutProps {
  children: ReactNode;
  onRefresh: () => void;
  isLoading: boolean;
  onSyncPrices?: () => void;
  isSyncing?: boolean;
  onImportExcel?: () => void;
  hideValues?: boolean;
  onToggleHideValues?: () => void;
}

export function DashboardLayout({
  children,
  onRefresh,
  isLoading,
  onSyncPrices,
  isSyncing,
  onImportExcel,
  hideValues,
  onToggleHideValues,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-muted/40 p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <Link to="/">
              <h1 className="text-3xl font-bold tracking-tight text-foreground hover:opacity-80 transition-opacity">
                Gemini Stocks
              </h1>
            </Link>
            <p className="text-muted-foreground mt-1">
              Manage your stock portfolio privately.
            </p>
          </div>

          <div className="flex gap-2">
            {/* SYNC PRICES BUTTON */}
            <Button
              onClick={onSyncPrices}
              variant="outline"
              disabled={isSyncing || isLoading}
            >
              <CloudDownload
                className={`mr-2 h-4 w-4 ${isSyncing ? "animate-bounce" : ""}`}
              />
              {isSyncing ? "Syncing..." : "Update Prices"}
            </Button>

            {/* REFRESH LIST BUTTON */}
            <Button
              onClick={onRefresh}
              variant="outline"
              disabled={isLoading || isSyncing}
            >
              <RefreshCcw
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh Data
            </Button>

            <Link to="/add">
              <Button variant={"outline"}>
                <Plus className="mr-2 h-4 w-4" />
                New Transaction
              </Button>
            </Link>

            {onImportExcel && (
              <Button variant="outline" onClick={onImportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Import Excel
              </Button>
            )}

            <Link to="/portfolio">
              <Button variant={"outline"}>
                <Briefcase className="mr-2 h-4 w-4" />
                See Portfolio
              </Button>
            </Link>

            <ModeToggle />

            {onToggleHideValues && (
              <Button variant="ghost" size="icon" onClick={onToggleHideValues}>
                {hideValues ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}

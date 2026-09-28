import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCcw,
  Plus,
  CloudDownload,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Target,
  List,
  Wallet,
  Menu,
} from "lucide-react";
import { ModeToggle } from "@/components/ui/mode-toggle";

interface DashboardLayoutProps {
  children: ReactNode;
  onRefresh: () => void;
  isLoading: boolean;
  onSyncPrices?: () => void;
  isSyncing?: boolean;
  onImportExcel?: () => void;
  onGoal?: () => void;
  onAllTransactions?: () => void;
  hideValues?: boolean;
  onToggleHideValues?: () => void;
}

function IconTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function DashboardLayout({
  children,
  onRefresh,
  isLoading,
  onSyncPrices,
  isSyncing,
  onImportExcel,
  onGoal,
  onAllTransactions,
  hideValues,
  onToggleHideValues,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-muted/40 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Link to="/">
              <h1 className="text-3xl font-bold tracking-tight text-foreground hover:opacity-80 transition-opacity">
                Gemini Finance
              </h1>
            </Link>
            <p className="text-muted-foreground mt-1">
              Manage your stock portfolio privately.
            </p>
          </div>

          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {onSyncPrices && (
                <IconTip
                  label={isSyncing ? "Syncing prices..." : "Update prices"}
                >
                  <Button
                    onClick={onSyncPrices}
                    variant="outline"
                    size="icon"
                    disabled={isSyncing || isLoading}
                    aria-label={
                      isSyncing ? "Syncing prices" : "Update prices"
                    }
                  >
                    <CloudDownload
                      className={`h-4 w-4 ${isSyncing ? "animate-bounce" : ""}`}
                    />
                  </Button>
                </IconTip>
              )}

              <IconTip label={isLoading ? "Refreshing..." : "Refresh data"}>
                <Button
                  onClick={onRefresh}
                  variant="outline"
                  size="icon"
                  disabled={isLoading || isSyncing}
                  aria-label={isLoading ? "Refreshing data" : "Refresh data"}
                >
                  <RefreshCcw
                    className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                  />
                </Button>
              </IconTip>

              <Link to="/add">
                <Button variant="outline" title="New transaction">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">New Transaction</span>
                </Button>
              </Link>

              <Link to="/expenses">
                <Button variant="outline" title="Expenses">
                  <Wallet className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Expenses</span>
                </Button>
              </Link>

              <DropdownMenu>
                <IconTip label="More actions">
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="More actions"
                    >
                      <Menu className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </IconTip>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>More</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {onAllTransactions && (
                    <DropdownMenuItem onClick={onAllTransactions}>
                      <List className="mr-2 h-4 w-4" />
                      All Transactions
                    </DropdownMenuItem>
                  )}
                  {onImportExcel && (
                    <DropdownMenuItem onClick={onImportExcel}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Import Excel
                    </DropdownMenuItem>
                  )}
                  {onGoal && (
                    <DropdownMenuItem onClick={onGoal}>
                      <Target className="mr-2 h-4 w-4" />
                      Goal
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <ModeToggle />

              {onToggleHideValues && (
                <IconTip label={hideValues ? "Show values" : "Hide values"}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleHideValues}
                    aria-label={hideValues ? "Show values" : "Hide values"}
                  >
                    {hideValues ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </IconTip>
              )}
            </div>
          </TooltipProvider>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}

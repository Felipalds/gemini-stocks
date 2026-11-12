import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
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
  Menu,
  HelpCircle,
  Settings,
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
  currencyView?: "BRL" | "USD";
  onToggleCurrencyView?: () => void;
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
  currencyView,
  onToggleCurrencyView,
}: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const tabs = [
    { label: "MAIN", to: "/", active: pathname === "/" || pathname.startsWith("/ticker") },
    { label: "NEWS", to: "/news", active: pathname.startsWith("/news") },
    { label: "DIVIDENDS", to: "/dividends", active: pathname.startsWith("/dividends") },
    { label: "EXPENSES", to: "/expenses", active: pathname.startsWith("/expenses") },
  ];

  return (
    <div className="min-h-screen bg-muted/40 font-sans">
      {/* Full-width tab bar (browser-style): the active tab blends into the page below */}
      <nav className="w-full border-b bg-background">
        <div className="flex">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex-1 border-b-2 px-4 py-3 text-center text-sm font-semibold tracking-wide transition-colors",
                t.active
                  ? "border-primary bg-muted/40 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-8">
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/qa">
                      <HelpCircle className="mr-2 h-4 w-4" />
                      Q&amp;A / Docs
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <ModeToggle />

              {onToggleCurrencyView && (
                <IconTip
                  label={
                    currencyView === "USD"
                      ? "Showing USD — switch to BRL"
                      : "Showing BRL — switch to USD"
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleCurrencyView}
                    aria-label="Toggle display currency"
                    className="font-semibold text-xs"
                  >
                    {currencyView === "USD" ? "$" : "R$"}
                  </Button>
                </IconTip>
              )}

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

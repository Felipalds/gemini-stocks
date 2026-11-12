import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Pencil } from "lucide-react";
import { EditTickerDialog } from "@/components/organisms/EditTickerDialog";
import { EditFixedBalanceDialog } from "@/components/organisms/EditFixedBalanceDialog";
import { StockDetailDialog } from "@/components/organisms/StockDetailDialog";
import { formatCurrency, formatQuantity } from "@/lib/format";

export interface TickerData {
  symbol: string;
  netQuantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  dayChangePercent: number;
  totalValue: number;
  pnl: number;
  pnlPercent: number;
  tags: string[];
  category: string;
  currency: string;
  isFixed?: boolean;
  fixedBalanceId?: string;
  /** ISO timestamp from tickers.updated_at (price cache) */
  updatedAt?: string | null;
  // Original currency values (for USD assets)
  originalCurrency?: string;
  avgBuyPriceOriginal?: number;
  currentPriceOriginal?: number;
  pnlOriginal?: number;
  totalValueOriginal?: number;
  // USD "view" of the position: USD-native assets show real dollars (pure-USD PnL,
  // no FX); BRL/mixed assets are converted at the current rate. Used when the
  // display currency is switched to USD. Falls back to the BRL figures if absent.
  totalValueUsd?: number;
  avgBuyPriceUsd?: number;
  currentPriceUsd?: number;
  pnlUsd?: number;
  pnlPercentUsd?: number;
}

const HIDDEN = "••••••";

interface TickerCardProps {
  ticker: TickerData;
  onEdited: () => void;
  className?: string;
  hideValues?: boolean;
  compact?: boolean;
  portfolioPercent?: number;
  /** Global default display currency; overridable per card. */
  currencyView?: "BRL" | "USD";
}

export function TickerCard({
  ticker,
  onEdited,
  className,
  hideValues,
  compact,
  portfolioPercent = 0,
  currencyView = "BRL",
}: TickerCardProps) {
  const navigate = useNavigate();
  const { symbol: routeSymbol } = useParams<{ symbol: string }>();
  const [editOpen, setEditOpen] = useState(false);
  // Per-card override of the global currency view (null = follow global).
  const [currencyOverride, setCurrencyOverride] = useState<
    "BRL" | "USD" | null
  >(null);
  // The detail dialog is open when the URL's /ticker/:symbol matches this card,
  // so clicking a square just navigates and the URL reflects the opened square.
  const detailOpen =
    !ticker.isFixed &&
    routeSymbol != null &&
    decodeURIComponent(routeSymbol) === ticker.symbol;
  const isFixed = !!ticker.isFixed;

  // Effective display currency: a per-card override wins over the global default.
  const view = currencyOverride ?? currencyView;
  const useUsd = view === "USD";
  const dispCurrency = useUsd ? "USD" : "BRL";
  const fmt = (val: number) => formatCurrency(val, dispCurrency);

  // Pick the BRL or USD figure for each metric, falling back to BRL if the USD
  // set is missing (e.g. no current price to convert).
  const dTotalValue = useUsd
    ? ticker.totalValueUsd ?? ticker.totalValue
    : ticker.totalValue;
  const dAvgBuy = useUsd
    ? ticker.avgBuyPriceUsd ?? ticker.avgBuyPrice
    : ticker.avgBuyPrice;
  const dCurrent = useUsd
    ? ticker.currentPriceUsd ?? ticker.currentPrice
    : ticker.currentPrice;
  const dPnl = useUsd ? ticker.pnlUsd ?? ticker.pnl : ticker.pnl;
  const dPnlPercent = useUsd
    ? ticker.pnlPercentUsd ?? ticker.pnlPercent
    : ticker.pnlPercent;

  // Secondary "also in" line shows the opposite currency so both are visible.
  const otherCurrency = useUsd ? "BRL" : "USD";
  const otherValue = useUsd ? ticker.totalValue : ticker.totalValueUsd;

  const isPositive = dPnl >= 0;

  // Scale opacity from 0.08 (0%) to 0.35 (>=20%) based on |pnlPercent|
  const intensity = Math.min(Math.abs(dPnlPercent) / 20, 1);
  const alpha = isFixed ? 0.1 : 0.08 + intensity * 0.27;
  const bgColor = isFixed
    ? `rgba(100, 116, 139, ${alpha})`
    : isPositive
      ? `rgba(16, 185, 129, ${alpha})`
      : `rgba(239, 68, 68, ${alpha})`;
  const borderClass = isFixed
    ? "border-slate-500"
    : isPositive
      ? "border-emerald-600"
      : "border-red-600";

  const openEditor = () => setEditOpen(true);

  return (
    <>
      <Card
        className={`border-2 overflow-hidden cursor-pointer ${borderClass} ${className ?? ""}`}
        style={{ backgroundColor: bgColor }}
        onClick={() => {
          if (isFixed) {
            openEditor();
          } else {
            navigate(`/ticker/${encodeURIComponent(ticker.symbol)}`);
          }
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 pt-2">
          <div>
            <CardTitle
              className={`${compact ? "text-sm" : "text-lg"} font-bold`}
            >
              {ticker.symbol}
            </CardTitle>
            {ticker.category && !compact && (
              <span className="text-xs text-muted-foreground">
                {ticker.category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!isFixed && (
              <Badge
                variant={isPositive ? "default" : "destructive"}
                className={`${compact ? "text-[10px] px-1.5 py-0" : ""} ${
                  isPositive
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {!compact &&
                  (isPositive ? (
                    <TrendingUp className="mr-1 h-3 w-3" />
                  ) : (
                    <TrendingDown className="mr-1 h-3 w-3" />
                  ))}
                {isPositive ? "+" : ""}
                {dPnlPercent.toFixed(2)}%
              </Badge>
            )}
            {!isFixed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[10px] font-semibold"
                aria-label={`Show in ${otherCurrency}`}
                title={`Show in ${otherCurrency}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrencyOverride(useUsd ? "BRL" : "USD");
                }}
              >
                {useUsd ? "R$" : "$"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                openEditor();
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent
          className={`${compact ? "px-3 py-1" : "px-3 pb-3"} space-y-1`}
        >
          <div>
            <div className={`${compact ? "text-lg" : "text-2xl"} font-bold`}>
              {hideValues ? HIDDEN : fmt(dTotalValue)}
            </div>
            {!compact && !isFixed && otherValue !== undefined && (
              <div className="text-xs text-muted-foreground">
                {hideValues
                  ? HIDDEN
                  : formatCurrency(otherValue, otherCurrency)}
              </div>
            )}
          </div>
          {!compact && isFixed && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className="text-right font-medium">
                {hideValues ? HIDDEN : fmt(dTotalValue)}
              </span>
            </div>
          )}
          {!compact && !isFixed && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Shares</span>
              <span className="text-right font-medium">
                {hideValues ? HIDDEN : formatQuantity(ticker.netQuantity)}
              </span>

              <span className="text-muted-foreground">Avg Buy Price</span>
              <span className="text-right font-medium">
                {hideValues ? HIDDEN : fmt(dAvgBuy)}
              </span>

              <span className="text-muted-foreground">Current Price</span>
              <span className="text-right font-medium">
                {hideValues ? HIDDEN : fmt(dCurrent)}
              </span>

              <span className="text-muted-foreground">P&L</span>
              <span
                className={`text-right font-bold ${
                  hideValues
                    ? "text-muted-foreground"
                    : isPositive
                      ? "text-emerald-600"
                      : "text-red-600"
                }`}
              >
                {hideValues ? HIDDEN : `${isPositive ? "+" : ""}${fmt(dPnl)}`}
              </span>
            </div>
          )}
          {compact && !isFixed && (
            <div
              className={`text-xs font-bold ${
                hideValues
                  ? "text-muted-foreground"
                  : isPositive
                    ? "text-emerald-600"
                    : "text-red-600"
              }`}
            >
              {hideValues
                ? HIDDEN
                : `P&L: ${isPositive ? "+" : ""}${fmt(dPnl)}`}
            </div>
          )}

          {!compact && !isFixed && ticker.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {ticker.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isFixed && ticker.fixedBalanceId ? (
        <EditFixedBalanceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          id={ticker.fixedBalanceId}
          name={ticker.symbol}
          amount={ticker.totalValue}
          onSaved={onEdited}
        />
      ) : (
        <>
          <EditTickerDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            symbol={ticker.symbol}
            currentPrice={ticker.currentPrice}
            currentTags={ticker.tags}
            currentCategory={ticker.category}
            currentCurrency={ticker.currency}
            onSaved={onEdited}
          />

          <StockDetailDialog
            open={detailOpen}
            onOpenChange={(o) => {
              // Closing the dialog clears the /ticker/:symbol URL.
              if (!o) navigate("/");
            }}
            ticker={ticker}
            portfolioPercent={portfolioPercent}
            hideValues={hideValues}
            onEdit={() => {
              navigate("/");
              setEditOpen(true);
            }}
            onRefreshed={onEdited}
          />
        </>
      )}
    </>
  );
}

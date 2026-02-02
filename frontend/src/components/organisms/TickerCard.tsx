import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Pencil } from "lucide-react";
import { EditTickerDialog } from "@/components/organisms/EditTickerDialog";
import { StockDetailDialog } from "@/components/organisms/StockDetailDialog";
import { formatCurrency } from "@/lib/format";

export interface TickerData {
  symbol: string;
  netQuantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  totalValue: number;
  pnl: number;
  pnlPercent: number;
  tags: string[];
  category: string;
  currency: string;
}

const HIDDEN = "••••••";

interface TickerCardProps {
  ticker: TickerData;
  onEdited: () => void;
  className?: string;
  hideValues?: boolean;
  compact?: boolean;
  portfolioPercent?: number;
}

export function TickerCard({
  ticker,
  onEdited,
  className,
  hideValues,
  compact,
  portfolioPercent = 0,
}: TickerCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const fmt = (val: number) => formatCurrency(val, ticker.currency);
  const isPositive = ticker.pnl >= 0;

  // Scale opacity from 0.08 (0%) to 0.35 (>=20%) based on |pnlPercent|
  const intensity = Math.min(Math.abs(ticker.pnlPercent) / 20, 1);
  const alpha = 0.08 + intensity * 0.27;
  const bgColor = isPositive
    ? `rgba(16, 185, 129, ${alpha})`
    : `rgba(239, 68, 68, ${alpha})`;

  return (
    <>
      <Card
        className={`border-2 overflow-hidden cursor-pointer ${isPositive ? "border-emerald-600" : "border-red-600"} ${className ?? ""}`}
        style={{ backgroundColor: bgColor }}
        onClick={() => setDetailOpen(true)}
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
              {ticker.pnlPercent.toFixed(2)}%
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setEditOpen(true);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent
          className={`${compact ? "px-3 py-1" : "px-3 pb-3"} space-y-1`}
        >
          <div className={`${compact ? "text-lg" : "text-2xl"} font-bold`}>
            {hideValues ? HIDDEN : fmt(ticker.totalValue)}
          </div>
          {!compact && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Shares</span>
              <span className="text-right font-medium">
                {hideValues ? HIDDEN : ticker.netQuantity}
              </span>

              <span className="text-muted-foreground">Avg Buy Price</span>
              <span className="text-right font-medium">
                {hideValues ? HIDDEN : fmt(ticker.avgBuyPrice)}
              </span>

              <span className="text-muted-foreground">Current Price</span>
              <span className="text-right font-medium">
                {hideValues ? HIDDEN : fmt(ticker.currentPrice)}
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
                {hideValues
                  ? HIDDEN
                  : `${isPositive ? "+" : ""}${fmt(ticker.pnl)}`}
              </span>
            </div>
          )}
          {compact && (
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
                : `P&L: ${isPositive ? "+" : ""}${fmt(ticker.pnl)}`}
            </div>
          )}

          {!compact && ticker.tags.length > 0 && (
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
        onOpenChange={setDetailOpen}
        ticker={ticker}
        portfolioPercent={portfolioPercent}
        hideValues={hideValues}
        onEdit={() => {
          setDetailOpen(false);
          setEditOpen(true);
        }}
      />
    </>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Pencil } from "lucide-react";
import { EditTickerDialog } from "@/components/organisms/EditTickerDialog";
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

interface TickerCardProps {
  ticker: TickerData;
  onEdited: () => void;
  className?: string;
}

export function TickerCard({ ticker, onEdited, className }: TickerCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const fmt = (val: number) => formatCurrency(val, ticker.currency);
  const isPositive = ticker.pnl >= 0;

  return (
    <>
      <Card
        className={`border-2 ${isPositive ? "border-emerald-600" : "border-red-600"} ${className ?? ""}`}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-lg font-bold">{ticker.symbol}</CardTitle>
            {ticker.category && (
              <span className="text-xs text-muted-foreground">
                {ticker.category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={isPositive ? "default" : "destructive"}
              className={
                isPositive
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {isPositive ? (
                <TrendingUp className="mr-1 h-3 w-3" />
              ) : (
                <TrendingDown className="mr-1 h-3 w-3" />
              )}
              {isPositive ? "+" : ""}
              {ticker.pnlPercent.toFixed(2)}%
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-bold">{fmt(ticker.totalValue)}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Shares</span>
            <span className="text-right font-medium">{ticker.netQuantity}</span>

            <span className="text-muted-foreground">Avg Buy Price</span>
            <span className="text-right font-medium">
              {fmt(ticker.avgBuyPrice)}
            </span>

            <span className="text-muted-foreground">Current Price</span>
            <span className="text-right font-medium">
              {fmt(ticker.currentPrice)}
            </span>

            <span className="text-muted-foreground">P&L</span>
            <span
              className={`text-right font-bold ${
                isPositive ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {isPositive ? "+" : ""}
              {fmt(ticker.pnl)}
            </span>
          </div>

          {ticker.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
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
    </>
  );
}

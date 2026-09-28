import { useMemo } from "react";
import { useWatch, type Control } from "react-hook-form";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { type Transaction } from "@/types";
import { type TransactionFormValues } from "@/components/organisms/TransactionForm";

interface TransactionPreviewProps {
  control: Control<TransactionFormValues>;
  transactions: Transaction[];
  dollarRate: number;
  /** When editing, exclude this tx so preview replaces it instead of double-counting */
  excludeTransactionId?: string;
}

function positionForSymbol(
  transactions: Transaction[],
  symbol: string,
  excludeId?: string,
) {
  let buyQty = 0;
  let sellQty = 0;
  let buyCost = 0;

  const sym = symbol.trim().toUpperCase();
  if (!sym) {
    return { net: 0, buyQty: 0, buyCost: 0, avgBuy: 0 };
  }

  for (const t of transactions) {
    if (excludeId && t.ID === excludeId) continue;
    if (t.symbol.toUpperCase() !== sym) continue;
    if (t.type === "BUY") {
      buyQty += t.quantity;
      buyCost += t.quantity * t.price;
    } else {
      sellQty += t.quantity;
    }
  }

  const net = buyQty - sellQty;
  const avgBuy = buyQty > 0 ? buyCost / buyQty : 0;
  return { net, buyQty, buyCost, avgBuy };
}

export function TransactionPreview({
  control,
  transactions,
  dollarRate,
  excludeTransactionId,
}: TransactionPreviewProps) {
  const [symbol, type, quantity, price, fee, currency] = useWatch({
    control,
    name: ["symbol", "type", "quantity", "price", "fee", "currency"],
  });

  const preview = useMemo(() => {
    const qty = Number(quantity);
    const px = Number(price);
    const feeN = Number(fee) || 0;
    const hasTrade =
      Number.isFinite(qty) &&
      qty > 0 &&
      Number.isFinite(px) &&
      px > 0;

    if (!hasTrade) {
      return null;
    }

    const notional = qty * px;
    const total =
      type === "BUY" ? notional + feeN : Math.max(notional - feeN, 0);
    const cur = currency === "BRL" ? "BRL" : "USD";
    const totalBrl = cur === "USD" ? total * dollarRate : total;

    const pos = positionForSymbol(
      transactions,
      symbol || "",
      excludeTransactionId,
    );

    let netAfter = pos.net;
    let avgAfter: number | null = null;

    if (type === "BUY") {
      netAfter = pos.net + qty;
      const newBuyQty = pos.buyQty + qty;
      const newBuyCost = pos.buyCost + notional;
      avgAfter = newBuyQty > 0 ? newBuyCost / newBuyQty : null;
    } else {
      netAfter = pos.net - qty;
      avgAfter = pos.avgBuy > 0 ? pos.avgBuy : null;
    }

    return {
      type: type as "BUY" | "SELL",
      notional,
      fee: feeN,
      total,
      currency: cur as "USD" | "BRL",
      totalBrl,
      showBrlEquiv: cur === "USD" && dollarRate > 0,
      symbol: (symbol || "").trim().toUpperCase(),
      netBefore: pos.net,
      netAfter,
      avgAfter,
    };
  }, [
    symbol,
    type,
    quantity,
    price,
    fee,
    currency,
    transactions,
    dollarRate,
    excludeTransactionId,
  ]);

  if (!preview) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Enter quantity and price to see trade preview.
      </div>
    );
  }

  const amountLabel =
    preview.type === "BUY" ? "Amount spent" : "Amount received";

  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Trade preview
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{amountLabel}</span>
        <span className="text-lg font-bold tabular-nums">
          {formatCurrency(preview.total, preview.currency)}
        </span>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>
          {formatQuantity(Number(quantity))} ×{" "}
          {formatCurrency(Number(price), preview.currency)}
          {preview.fee > 0 && (
            <>
              {" "}
              {preview.type === "BUY" ? "+" : "−"} fee{" "}
              {formatCurrency(preview.fee, preview.currency)}
            </>
          )}
        </p>
        {preview.showBrlEquiv && (
          <p>≈ {formatCurrency(preview.totalBrl, "BRL")}</p>
        )}
      </div>

      {preview.symbol.length >= 2 && (
        <div className="pt-2 border-t border-border/60 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">
              {preview.symbol} shares after
            </span>
            <span className="font-medium tabular-nums">
              {formatQuantity(preview.netBefore)} →{" "}
              {formatQuantity(preview.netAfter)}
            </span>
          </div>
          {preview.type === "BUY" && preview.avgAfter != null && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Avg buy after</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(preview.avgAfter, preview.currency)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

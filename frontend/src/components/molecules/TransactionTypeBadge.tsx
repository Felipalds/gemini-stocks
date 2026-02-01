import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TransactionTypeBadgeProps {
  type: "BUY" | "SELL";
}

export function TransactionTypeBadge({ type }: TransactionTypeBadgeProps) {
  const isBuy = type === "BUY";

  return (
    <Badge
      variant={isBuy ? "default" : "destructive"}
      className={`flex w-fit items-center gap-1 ${isBuy ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
    >
      {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {type}
    </Badge>
  );
}

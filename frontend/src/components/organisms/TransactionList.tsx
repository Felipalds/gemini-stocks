import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TransactionTypeBadge } from "@/components/molecules/TransactionTypeBadge";
import { EditTransactionDialog } from "@/components/organisms/EditTransactionDialog";
import { type Transaction } from "@/types";
import { formatCurrency } from "@/lib/format";
import { MoreHorizontal, Trash, Edit } from "lucide-react";

interface TransactionListProps {
  transactions: Transaction[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onEdited: () => void;
}

export function TransactionList({
  transactions,
  isLoading,
  onDelete,
  onEdited,
}: TransactionListProps) {
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const sortedList = transactions
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getPnLColor = (value: number | undefined) => {
    if (!value) return "text-muted-foreground";
    if (value > 0) return "text-emerald-600 font-bold";
    if (value < 0) return "text-red-600 font-bold";
    return "text-gray-600";
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>
            A detailed view of your portfolio performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 && !isLoading ? (
            <div className="text-center py-10 text-muted-foreground">
              No transactions found. Start trading!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Buy Price</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right bg-muted/30">
                    Current Price
                  </TableHead>
                  <TableHead className="text-right bg-muted/30">
                    Earnings / Loss
                  </TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedList.map((t) => (
                  <TableRow key={t.ID}>
                    <TableCell>
                      <TransactionTypeBadge type={t.type} />
                    </TableCell>
                    <TableCell className="font-bold">{t.symbol}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(t.date)}
                    </TableCell>
                    <TableCell className="text-right">{t.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(t.price, t.currency)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {t.fee > 0 ? formatCurrency(t.fee, t.currency) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium bg-muted/10">
                      {t.current_price ? (
                        formatCurrency(t.current_price, t.currency)
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          N/A
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right bg-muted/10 ${getPnLColor(t.pnl)}`}
                    >
                      {t.pnl !== undefined ? (
                        <span>
                          {t.pnl > 0 ? "+" : ""}
                          {formatCurrency(t.pnl, t.currency)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground italic truncate max-w-[100px]">
                      {t.note}
                    </TableCell>

                    {/* --- ACTION MENU --- */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => setEditingTransaction(t)}
                          >
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => onDelete(t.ID)}
                          >
                            <Trash className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editingTransaction && (
        <EditTransactionDialog
          open={!!editingTransaction}
          onOpenChange={(open) => {
            if (!open) setEditingTransaction(null);
          }}
          transaction={editingTransaction}
          onSaved={onEdited}
        />
      )}
    </>
  );
}

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TransactionList } from "@/components/organisms/TransactionList";
import { type Transaction } from "@/types";

interface AllTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onEdited: () => void;
}

export function AllTransactionsDialog({
  open,
  onOpenChange,
  transactions,
  isLoading,
  onDelete,
  onEdited,
}: AllTransactionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            All Transactions
          </DialogTitle>
          <DialogDescription>
            {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} total
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-4">
          <TransactionList
            transactions={transactions}
            isLoading={isLoading}
            onDelete={onDelete}
            onEdited={onEdited}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

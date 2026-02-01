import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TransactionFormFields,
  type TransactionFormValues,
} from "@/components/organisms/TransactionForm";
import { type Transaction } from "@/types";
import { toast } from "sonner";

interface EditTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction;
  onSaved: () => void;
}

export function EditTransactionDialog({
  open,
  onOpenChange,
  transaction,
  onSaved,
}: EditTransactionDialogProps) {
  const [saving, setSaving] = useState(false);

  const defaultValues: Partial<TransactionFormValues> = {
    symbol: transaction.symbol,
    type: transaction.type,
    quantity: transaction.quantity,
    price: transaction.price,
    fee: transaction.fee || 0,
    currency: (transaction.currency as "USD" | "BRL") || "USD",
    date: new Date(transaction.date).toISOString().split("T")[0],
    note: transaction.note || "",
  };

  async function onSubmit(values: TransactionFormValues) {
    setSaving(true);
    const toastId = toast.loading("Saving changes...");

    try {
      const payload = {
        ...values,
        date: new Date(values.date).toISOString(),
      };

      const res = await fetch(
        `http://localhost:8080/transactions/${transaction.ID}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        toast.success("Transaction updated", { id: toastId });
        onSaved();
        onOpenChange(false);
      } else {
        const text = await res.text();
        toast.error("Update failed", { id: toastId, description: text });
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>
            Update the details of this {transaction.type} transaction for{" "}
            {transaction.symbol}.
          </DialogDescription>
        </DialogHeader>
        <TransactionFormFields
          key={transaction.ID}
          defaultValues={defaultValues}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel="Save Changes"
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}

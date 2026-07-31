import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface EditFixedBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id: string;
  name: string;
  amount: number;
  onSaved: () => void;
}

export function EditFixedBalanceDialog({
  open,
  onOpenChange,
  id,
  name,
  amount,
  onSaved,
}: EditFixedBalanceDialogProps) {
  const [value, setValue] = useState(String(amount));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(String(amount));
    }
  }, [open, amount]);

  const handleSave = async () => {
    const parsed = parseFloat(value.replace(",", "."));
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Invalid amount", {
        description: "Enter a number greater than or equal to 0.",
      });
      return;
    }

    setSaving(true);
    const toastId = toast.loading("Saving balance...");

    try {
      const res = await fetch(`http://localhost:8080/fixed-balances/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsed }),
      });

      if (res.ok) {
        toast.success("Balance updated", { id: toastId });
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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Edit Balance</DialogTitle>
          <DialogDescription>
            Update the current value for this fixed holding.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} disabled readOnly />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fixed-amount">Balance (BRL)</Label>
            <Input
              id="fixed-amount"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

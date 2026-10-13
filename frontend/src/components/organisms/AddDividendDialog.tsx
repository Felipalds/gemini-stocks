import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DividendFormFields } from "@/components/organisms/DividendForm";

interface AddDividendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a dividend is saved (e.g. to refresh summaries). */
  onSaved: () => void;
}

export function AddDividendDialog({
  open,
  onOpenChange,
  onSaved,
}: AddDividendDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-md max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Add dividend</DialogTitle>
          <DialogDescription>
            Record a dividend, JCP, or realized profit for a ticker.
          </DialogDescription>
        </DialogHeader>
        <DividendFormFields
          onSaved={() => {
            onSaved();
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

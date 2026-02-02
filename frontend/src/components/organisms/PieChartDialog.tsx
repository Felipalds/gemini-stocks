import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PortfolioPieChart,
  type PieSlice,
} from "@/components/organisms/PortfolioPieChart";

interface PieChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: PieSlice[];
}

export function PieChartDialog({
  open,
  onOpenChange,
  title,
  data,
}: PieChartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{title}</DialogTitle>
        </DialogHeader>

        <div className="w-full h-[500px] py-4">
          <PortfolioPieChart data={data} className="w-full h-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

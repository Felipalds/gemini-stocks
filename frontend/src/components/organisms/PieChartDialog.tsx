import type { ReactNode } from "react";
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
  /** When set, slices are clickable and call this with the slice name. */
  onSliceClick?: (name: string) => void;
  /** Slice label content: percentage (default) or the R$ value with 2 decimals. */
  labelKind?: "percent" | "currency";
  /** Mask monetary values in slice labels. */
  hideValues?: boolean;
  /** Optional content rendered below the chart (e.g. a drill-down list). */
  footer?: ReactNode;
}

export function PieChartDialog({
  open,
  onOpenChange,
  title,
  data,
  onSliceClick,
  labelKind,
  hideValues,
  footer,
}: PieChartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{title}</DialogTitle>
        </DialogHeader>

        <div className="overflow-auto flex-1 -mx-2 px-2">
          <div className={`w-full ${footer ? "h-[400px]" : "h-[500px]"} py-4`}>
            <PortfolioPieChart
              data={data}
              className="w-full h-full"
              showLabels
              labelKind={labelKind}
              hideValues={hideValues}
              onSliceClick={onSliceClick}
            />
          </div>
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}

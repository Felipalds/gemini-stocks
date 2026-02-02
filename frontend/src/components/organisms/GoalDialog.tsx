import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/contexts/AppContext";
import { PortfolioPieChart } from "@/components/organisms/PortfolioPieChart";
import { toast } from "sonner";

interface GoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoalDialog({ open, onOpenChange }: GoalDialogProps) {
  const { stockPrices } = useApp();
  const [goalTotal, setGoalTotal] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Derive unique categories from stockPrices
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const sp of stockPrices) {
      if (sp.category && sp.category.trim() !== "") {
        set.add(sp.category.trim());
      }
    }
    return Array.from(set).sort();
  }, [stockPrices]);

  // Load existing goal when dialog opens
  useEffect(() => {
    if (!open) {
      setLoaded(false);
      return;
    }

    fetch("http://localhost:8080/goal")
      .then((res) => {
        if (res.status === 404) return null;
        return res.json();
      })
      .then((data) => {
        if (data && data.goal_total) {
          setGoalTotal(String(data.goal_total));
          const allocs: Record<string, string> = {};
          for (const a of data.allocations || []) {
            allocs[a.category] = String(a.percentage);
          }
          setAllocations(allocs);
        } else {
          setGoalTotal("");
          setAllocations({});
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [open]);

  const totalPercent = useMemo(() => {
    return Object.values(allocations).reduce((sum, v) => {
      const n = parseFloat(v);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  }, [allocations]);

  const pieData = useMemo(() => {
    return categories
      .map((category) => {
        const pct = parseFloat(allocations[category] || "0");
        return { name: category, value: isNaN(pct) ? 0 : pct };
      })
      .filter((d) => d.value > 0);
  }, [categories, allocations]);

  const handlePercentChange = (category: string, value: string) => {
    setAllocations((prev) => ({ ...prev, [category]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const toastId = toast.loading("Saving goal...");

    const allocs = categories
      .map((category) => ({
        category,
        percentage: parseFloat(allocations[category] || "0") || 0,
      }))
      .filter((a) => a.percentage > 0);

    try {
      const res = await fetch("http://localhost:8080/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_total: parseFloat(goalTotal) || 0,
          allocations: allocs,
        }),
      });

      if (res.ok) {
        toast.success("Goal saved", { id: toastId });
        onOpenChange(false);
      } else {
        const text = await res.text();
        toast.error("Failed to save goal", { id: toastId, description: text });
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const isValid =
    parseFloat(goalTotal) > 0 && Math.abs(totalPercent - 100) < 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Portfolio Goal
          </DialogTitle>
          <DialogDescription>
            Set your target portfolio value in BRL and assign a percentage to
            each category.
          </DialogDescription>
        </DialogHeader>

        {!loaded ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : categories.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No categories found. Edit your tickers to assign categories first.
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col sm:flex-row gap-6 mt-4">
            {/* Left: Form */}
            <div className="flex-1 overflow-auto space-y-4 pr-2">
              <div className="space-y-2">
                <Label htmlFor="goal-total">Goal Total (R$)</Label>
                <Input
                  id="goal-total"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 100000"
                  value={goalTotal}
                  onChange={(e) => setGoalTotal(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Category Allocations (%)</Label>
                <div className="space-y-2 max-h-[40vh] overflow-auto">
                  {categories.map((category) => (
                    <div key={category} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-32 truncate">
                        {category}
                      </span>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        placeholder="0"
                        className="w-24"
                        value={allocations[category] || ""}
                        onChange={(e) =>
                          handlePercentChange(category, e.target.value)
                        }
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <span
                  className={`text-sm font-bold ${Math.abs(totalPercent - 100) < 0.01 ? "text-emerald-600" : "text-red-600"}`}
                >
                  Total: {totalPercent.toFixed(1)}%
                </span>
                {Math.abs(totalPercent - 100) >= 0.01 && (
                  <span className="text-xs text-red-600">Must equal 100%</span>
                )}
              </div>

              <Button
                onClick={handleSave}
                disabled={!isValid || saving}
                className="w-full"
              >
                {saving ? "Saving..." : "Save Goal"}
              </Button>
            </div>

            {/* Right: Pie Chart */}
            <div className="flex-1 min-h-[300px]">
              <PortfolioPieChart
                data={pieData}
                title="Goal Allocation"
                className="h-full"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

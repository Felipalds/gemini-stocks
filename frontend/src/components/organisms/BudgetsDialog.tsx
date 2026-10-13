import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Budget, ExpenseAnalytics, ExpenseCategory } from "@/types";
import { formatCurrency } from "@/lib/format";

const API_BASE = "http://localhost:8080";
const OVERALL = "__overall__";
const HIDDEN = "••••";

interface BudgetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  hideValues?: boolean;
  /** Called after any change so the parent can refresh its analytics panel. */
  onChanged: () => void;
}

type Status = { spent_brl: number; percent_consumed: number };

function barColor(pct: number): string {
  if (pct >= 100) return "rgb(239, 68, 68)"; // red
  if (pct >= 80) return "rgb(245, 158, 11)"; // amber
  return "rgb(16, 185, 129)"; // emerald
}

export function BudgetsDialog({
  open,
  onOpenChange,
  categories,
  hideValues,
  onChanged,
}: BudgetsDialogProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [statusByCategory, setStatusByCategory] = useState<
    Record<string, Status>
  >({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newCategory, setNewCategory] = useState<string>(OVERALL);
  const [newAmount, setNewAmount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const mask = (s: string) => (hideValues ? HIDDEN : s);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/budgets`).then((r) => r.json()),
      fetch(`${API_BASE}/expenses/analytics`).then((r) => r.json()),
    ])
      .then(([rows, analytics]: [Budget[], ExpenseAnalytics]) => {
        setBudgets(Array.isArray(rows) ? rows : []);
        const map: Record<string, Status> = {};
        for (const b of analytics?.budget_status ?? []) {
          map[b.category] = {
            spent_brl: b.spent_brl,
            percent_consumed: b.percent_consumed,
          };
        }
        setStatusByCategory(map);
      })
      .catch(() => toast.error("Failed to load budgets"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const budgetedCategories = useMemo(
    () => new Set(budgets.map((b) => b.category)),
    [budgets],
  );
  const hasOverall = budgetedCategories.has("");
  // Categories still available to budget (exclude ones already budgeted).
  const availableCategories = categories.filter(
    (c) => !budgetedCategories.has(c.name),
  );

  const refreshAll = () => {
    load();
    onChanged();
  };

  const handleAdd = async () => {
    const amount = parseFloat(newAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a positive budget amount");
      return;
    }
    const category = newCategory === OVERALL ? "" : newCategory;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, amount_brl: amount }),
      });
      if (!res.ok) throw new Error();
      toast.success("Budget added");
      setNewAmount("");
      setNewCategory(OVERALL);
      refreshAll();
    } catch {
      toast.error("Could not add budget");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (b: Budget) => {
    const amount = parseFloat(editAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a positive budget amount");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/budgets/${b.ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: b.category, amount_brl: amount }),
      });
      if (!res.ok) throw new Error();
      toast.success("Budget updated");
      setEditingId(null);
      refreshAll();
    } catch {
      toast.error("Could not update budget");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/budgets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error();
      toast.success("Budget removed");
      refreshAll();
    } catch {
      toast.error("Could not remove budget");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Monthly budgets</DialogTitle>
          <DialogDescription>
            Set a spending target overall or per category. Progress reflects this
            month's spend.
          </DialogDescription>
        </DialogHeader>

        {/* Add form */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label>Scope</Label>
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                {!hasOverall && (
                  <SelectItem value={OVERALL}>Overall monthly</SelectItem>
                )}
                {availableCategories.map((c) => (
                  <SelectItem key={c.ID} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32 space-y-1">
            <Label>Amount (BRL)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
            />
          </div>
          <Button disabled={saving} onClick={() => void handleAdd()}>
            Add
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto space-y-3 mt-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Loading...
            </p>
          ) : budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No budgets yet. Add one above.
            </p>
          ) : (
            budgets.map((b) => {
              const status = statusByCategory[b.category];
              const spent = status?.spent_brl ?? 0;
              const pct = status?.percent_consumed ?? 0;
              const label = b.category || "Overall monthly";
              return (
                <div key={b.ID} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{label}</span>
                    {editingId === b.ID ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-8 w-28"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => void handleSaveEdit(b)}
                          aria-label="Save"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-sm tabular-nums">
                          {mask(formatCurrency(b.amount_brl, "BRL"))}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingId(b.ID);
                            setEditAmount(String(b.amount_brl));
                          }}
                          aria-label="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600"
                          onClick={() => void handleDelete(b.ID)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: barColor(pct),
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {mask(formatCurrency(spent, "BRL"))} spent this month
                    </span>
                    <span style={{ color: barColor(pct) }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Expense, PaginatedExpenses, RecurringKind } from "@/types";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency } from "@/lib/format";

const API_BASE = "http://localhost:8080";
const PAGE_SIZE = 25;

const today = () => new Date().toISOString().slice(0, 10);

type FormState = {
  name: string;
  category: string;
  value: string;
  currency: Expense["currency"];
  date: string;
  note: string;
  recurring: RecurringKind;
};

const emptyForm = (): FormState => ({
  name: "",
  category: "",
  value: "",
  currency: "BRL",
  date: today(),
  note: "",
  recurring: "",
});

export default function ExpensesPage() {
  const navigate = useNavigate();
  const { refreshData, loading, hideValues, toggleHideValues } = useApp();

  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedExpenses | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchPage = useCallback((p: number) => {
    setListLoading(true);
    fetch(`${API_BASE}/expenses?page=${p}&page_size=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((d: PaginatedExpenses) => setData(d))
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load expenses");
      })
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = parseFloat(form.value);
    if (!form.name.trim() || isNaN(value) || value <= 0) {
      toast.error("Name and a positive value are required");
      return;
    }
    setSubmitting(true);
    const toastId = toast.loading("Saving expense...");
    try {
      const res = await fetch(`${API_BASE}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category.trim() || "Other",
          value,
          currency: form.currency,
          date: new Date(form.date).toISOString(),
          note: form.note,
          recurring: form.recurring,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Expense saved", { id: toastId });
      setForm(emptyForm());
      setPage(1);
      fetchPage(1);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save expense", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    const toastId = toast.loading("Deleting...");
    try {
      const res = await fetch(`${API_BASE}/expenses/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Deleted", { id: toastId });
      fetchPage(page);
    } catch {
      toast.error("Failed to delete", { id: toastId });
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <DashboardLayout
      onRefresh={() => {
        refreshData();
        fetchPage(page);
      }}
      isLoading={loading || listLoading}
      hideValues={hideValues}
      onToggleHideValues={toggleHideValues}
    >
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>New Expense</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Uber to airport"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  placeholder="Transport"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="value">Value</Label>
                  <Input
                    id="value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.value}
                    onChange={(e) =>
                      setForm({ ...form, value: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(v) =>
                      setForm({ ...form, currency: v as Expense["currency"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">BRL</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="BTC">BTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm({ ...form, date: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Recurring</Label>
                  <Select
                    value={form.recurring || "none"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        recurring: v === "none" ? "" : (v as RecurringKind),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">One-off</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? "Saving..." : "Add expense"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/")}
                >
                  Back
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>All Expenses</CardTitle>
            {data && (
              <span className="text-sm text-muted-foreground">
                {data.total} total
              </span>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">BRL</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).map((e) => (
                  <TableRow key={e.ID}>
                    <TableCell>
                      {new Date(e.date).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.category || "Other"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {hideValues
                        ? "•••"
                        : formatCurrency(e.value, e.currency)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {hideValues
                        ? "•••"
                        : formatCurrency(e.value_brl ?? 0, "BRL")}
                    </TableCell>
                    <TableCell>
                      {e.recurring ? (
                        <Badge>{e.recurring}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(e.ID)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {data && data.items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-8"
                    >
                      No expenses yet. Add your first one on the left.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {data && data.total > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

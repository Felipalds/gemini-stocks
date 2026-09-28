import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUp, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type {
  Expense,
  ExpenseCategory,
  PaginatedExpenses,
  RecurringKind,
  StatementImportLine,
  StatementImportPreview,
} from "@/types";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency } from "@/lib/format";
import { ExpenseAnalyticsPanel } from "@/components/organisms/ExpenseAnalyticsPanel";

const API_BASE = "http://localhost:8080";
const PAGE_SIZE = 25;
const NONE_CATEGORY = "__none__";
const NEW_CATEGORY = "__new__";

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

type PreviewRow = StatementImportLine & { checked: boolean };

export default function ExpensesPage() {
  const navigate = useNavigate();
  const { refreshData, loading, hideValues, toggleHideValues } = useApp();

  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedExpenses | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [analyticsKey, setAnalyticsKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    value: "",
    currency: "BRL" as Expense["currency"],
    date: "",
    note: "",
    recurring: "" as RecurringKind,
  });
  const [editSaving, setEditSaving] = useState(false);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState("");
  const inlineNameRef = useRef<HTMLInputElement>(null);

  const bumpAnalytics = () => setAnalyticsKey((k) => k + 1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBank, setImportBank] = useState<"auto" | "nubank" | "inter">("auto");
  const [importParsing, setImportParsing] = useState(false);
  const [importConfirming, setImportConfirming] = useState(false);
  const [previewBank, setPreviewBank] = useState("");
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const fetchCategories = useCallback(() => {
    fetch(`${API_BASE}/expense-categories`)
      .then((r) => r.json())
      .then((rows: ExpenseCategory[]) => setCategories(rows ?? []))
      .catch(() => toast.error("Failed to load categories"));
  }, []);

  const fetchPage = useCallback((p: number) => {
    setListLoading(true);
    fetch(`${API_BASE}/expenses?page=${p}&page_size=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((d: PaginatedExpenses) => {
        const items = [...(d.items ?? [])].sort((a, b) => {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          if (db !== da) return db - da; // date DESC
          return (b.ID || "").localeCompare(a.ID || "");
        });
        setData({ ...d, items });
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load expenses");
      })
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (inlineEditId && inlineNameRef.current) {
      inlineNameRef.current.focus();
      inlineNameRef.current.select();
    }
  }, [inlineEditId]);

  const selectedCount = useMemo(
    () => previewRows.filter((r) => r.checked && !r.already_imported).length,
    [previewRows]
  );

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
      bumpAnalytics();
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
      bumpAnalytics();
    } catch {
      toast.error("Failed to delete", { id: toastId });
    }
  }

  function openEdit(e: Expense) {
    setInlineEditId(null);
    setEditing(e);
    setEditForm({
      name: e.name,
      category: e.category || "",
      value: String(e.value),
      currency: e.currency,
      date: e.date.slice(0, 10),
      note: e.note || "",
      recurring: e.recurring || "",
    });
    setEditOpen(true);
  }

  function startInlineName(e: Expense) {
    if (editSaving || bulkOpen) return;
    setInlineEditId(e.ID);
    setInlineName(e.name);
  }

  function cancelInlineName() {
    setInlineEditId(null);
    setInlineName("");
  }

  function commitInlineName(expense: Expense) {
    const next = inlineName.trim();
    if (!next) {
      toast.error("Name is required");
      setInlineName(expense.name);
      setInlineEditId(null);
      return;
    }
    if (next === expense.name) {
      setInlineEditId(null);
      return;
    }
    setEditing(expense);
    setEditForm({
      name: next,
      category: expense.category || "",
      value: String(expense.value),
      currency: expense.currency,
      date: expense.date.slice(0, 10),
      note: expense.note || "",
      recurring: expense.recurring || "",
    });
    setInlineEditId(null);
    setBulkOpen(true);
  }

  function editPayload(bulkSameName: boolean) {
    if (!editing) return null;
    const value = parseFloat(editForm.value);
    if (!editForm.name.trim() || isNaN(value) || value <= 0) {
      toast.error("Name and a positive value are required");
      return null;
    }
    return {
      name: editForm.name.trim(),
      category: editForm.category.trim(),
      value,
      currency: editForm.currency,
      date: new Date(editForm.date).toISOString(),
      note: editForm.note,
      recurring: editForm.recurring,
      bank: editing.bank || "",
      payment_type: editing.payment_type || "",
      bulk_same_name: bulkSameName,
    };
  }

  function onEditSaveClick() {
    if (!editing) return;
    const nameChanged = editForm.name.trim() !== editing.name;
    const categoryChanged =
      editForm.category.trim() !== (editing.category || "");
    if (nameChanged || categoryChanged) {
      setBulkOpen(true);
      return;
    }
    void saveEdit(false);
  }

  async function saveEdit(bulkSameName: boolean) {
    if (!editing) return;
    const body = editPayload(bulkSameName);
    if (!body) return;
    setEditSaving(true);
    setBulkOpen(false);
    const toastId = toast.loading(bulkSameName ? "Updating all…" : "Saving…");
    try {
      const res = await fetch(`${API_BASE}/expenses/${editing.ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      const count = result.updated_count ?? 1;
      toast.success(
        bulkSameName ? `Updated ${count} expense(s)` : "Expense updated",
        { id: toastId }
      );
      setEditOpen(false);
      setEditing(null);
      fetchPage(page);
      bumpAnalytics();
      fetchCategories();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update", { id: toastId });
    } finally {
      setEditSaving(false);
    }
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }
    setImportParsing(true);
    const toastId = toast.loading("Parsing statement...");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("bank", importBank);
      const res = await fetch(`${API_BASE}/expenses/import`, {
        method: "POST",
        body,
      });
      if (!res.ok) throw new Error(await res.text());
      const preview = (await res.json()) as StatementImportPreview;
      setPreviewBank(preview.bank || importBank);
      setPreviewWarnings(preview.warnings ?? []);
      setPreviewRows(
        (preview.lines ?? []).map((l) => ({
          ...l,
          original_name: l.original_name || l.name,
          category: l.category || "",
          checked: l.selected && !l.already_imported,
        }))
      );
      fetchCategories();
      setImportOpen(true);
      toast.success(`Parsed ${preview.lines?.length ?? 0} lines`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message || "Failed to parse PDF" : "Failed to parse PDF",
        { id: toastId }
      );
    } finally {
      setImportParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onConfirmImport() {
    const items = previewRows
      .filter((r) => r.checked && !r.already_imported)
      .map((r) => {
        const original = r.original_name || r.name;
        return {
          name: r.name.trim(),
          original_name: original,
          category: r.category || "",
          date: r.date,
          value: r.value,
          currency: r.currency,
          bank: r.bank || previewBank,
          payment_type: r.payment_type || "credit",
          external_key: r.external_key,
          installment_n: r.installment_n,
          installment_of: r.installment_of,
          // Only persist name mapping when display name differs from statement.
          save_alias: r.name.trim() !== original.trim(),
        };
      });
    if (items.length === 0) {
      toast.error("Select at least one line to import");
      return;
    }
    setImportConfirming(true);
    const toastId = toast.loading("Importing...");
    try {
      const res = await fetch(`${API_BASE}/expenses/import/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank: previewBank, items }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast.success(
        `Imported ${result.imported}, skipped ${result.skipped}`,
        { id: toastId }
      );
      setImportOpen(false);
      setPreviewRows([]);
      setPage(1);
      fetchPage(1);
      fetchCategories();
      bumpAnalytics();
    } catch (err) {
      console.error(err);
      toast.error("Failed to confirm import", { id: toastId });
    } finally {
      setImportConfirming(false);
    }
  }

  async function createCategory(name: string): Promise<ExpenseCategory | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const res = await fetch(`${API_BASE}/expense-categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      toast.error(await res.text());
      return null;
    }
    const row = (await res.json()) as ExpenseCategory;
    setCategories((prev) =>
      [...prev.filter((c) => c.ID !== row.ID), row].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    return row;
  }

  async function saveCategoryEdit() {
    if (!editingCategoryId) return;
    const name = editingCategoryName.trim();
    if (!name) return;
    const res = await fetch(
      `${API_BASE}/expense-categories/${editingCategoryId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }
    );
    if (!res.ok) {
      toast.error(await res.text());
      return;
    }
    setEditingCategoryId(null);
    fetchCategories();
    toast.success("Category renamed (existing expenses unchanged)");
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category label? Existing expenses keep their text."))
      return;
    const res = await fetch(`${API_BASE}/expense-categories/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete category");
      return;
    }
    fetchCategories();
  }

  async function onPreviewCategoryChange(idx: number, value: string) {
    if (value === NEW_CATEGORY) {
      const name = window.prompt("New category name");
      if (!name?.trim()) return;
      const created = await createCategory(name);
      if (!created) return;
      setPreviewRows((rows) =>
        rows.map((r, i) => (i === idx ? { ...r, category: created.name } : r))
      );
      return;
    }
    const category = value === NONE_CATEGORY ? "" : value;
    setPreviewRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, category } : r))
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <DashboardLayout
      onRefresh={() => {
        refreshData();
        fetchPage(page);
        bumpAnalytics();
      }}
      isLoading={loading || listLoading}
      hideValues={hideValues}
      onToggleHideValues={toggleHideValues}
    >
      <div className="mb-6">
        <ExpenseAnalyticsPanel
          hideValues={hideValues}
          refreshKey={analyticsKey}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <Select
          value={importBank}
          onValueChange={(v) =>
            setImportBank(v as "auto" | "nubank" | "inter")
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Bank" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            <SelectItem value="nubank">Nubank</SelectItem>
            <SelectItem value="inter">Inter</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          disabled={importParsing}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="mr-2 h-4 w-4" />
          {importParsing ? "Parsing..." : "Import credit card statement"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            fetchCategories();
            setCategoriesOpen(true);
          }}
        >
          Manage categories
        </Button>
      </div>

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
                  <TableHead>Bank</TableHead>
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
                    <TableCell className="font-medium min-w-[180px]">
                      {inlineEditId === e.ID ? (
                        <Input
                          ref={inlineNameRef}
                          value={inlineName}
                          className="h-8"
                          disabled={editSaving}
                          onChange={(ev) => setInlineName(ev.target.value)}
                          onBlur={() => commitInlineName(e)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") {
                              ev.preventDefault();
                              (ev.target as HTMLInputElement).blur();
                            } else if (ev.key === "Escape") {
                              ev.preventDefault();
                              cancelInlineName();
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="text-left w-full rounded px-1 -mx-1 hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring"
                          title="Click to edit name"
                          onClick={() => startInlineName(e)}
                        >
                          {e.name}
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.category || "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      {e.bank ? (
                        <Badge variant="secondary">{e.bank}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(e)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(e.ID)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data && data.items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
            <DialogDescription>
              Bank: <strong>{previewBank || "unknown"}</strong>. Edit names to
              save aliases for next time. Use original keeps the statement text
              for this import only.
            </DialogDescription>
          </DialogHeader>

          {previewWarnings.length > 0 && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              {previewWarnings.join(" · ")}
            </div>
          )}

          <div className="overflow-auto flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="min-w-[220px]">Name</TableHead>
                  <TableHead className="min-w-[160px]">Category</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, idx) => {
                  const original = row.original_name || row.name;
                  const nameChanged = row.name.trim() !== original.trim();
                  return (
                    <TableRow
                      key={row.external_key || idx}
                      className={row.already_imported ? "opacity-50" : undefined}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={row.checked}
                          disabled={row.already_imported}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPreviewRows((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, checked } : r
                              )
                            );
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(row.date).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.name}
                          disabled={row.already_imported}
                          className="h-8"
                          onChange={(e) => {
                            const name = e.target.value;
                            setPreviewRows((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, name } : r
                              )
                            );
                          }}
                        />
                        {(row.has_alias || nameChanged) && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>
                              original: <span className="font-mono">{original}</span>
                            </span>
                            {nameChanged && (
                              <button
                                type="button"
                                className="underline"
                                onClick={() =>
                                  setPreviewRows((rows) =>
                                    rows.map((r, i) =>
                                      i === idx ? { ...r, name: original } : r
                                    )
                                  )
                                }
                              >
                                Use original
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.category || NONE_CATEGORY}
                          disabled={row.already_imported}
                          onValueChange={(v) => onPreviewCategoryChange(idx, v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_CATEGORY}>—</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.ID} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={NEW_CATEGORY}>
                              + New category…
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.kind}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.value, row.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {row.already_imported
                          ? "already imported"
                          : row.skip_reason ||
                            (row.installment_n
                              ? `${row.installment_n}/${row.installment_of}`
                              : "")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <span className="text-sm text-muted-foreground mr-auto">
              {selectedCount} selected
            </span>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={importConfirming || selectedCount === 0}
              onClick={onConfirmImport}
            >
              {importConfirming ? "Importing..." : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage categories</DialogTitle>
            <DialogDescription>
              Labels only. Rename/delete does not change existing expense rows.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="New category"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <Button
              type="button"
              onClick={async () => {
                const created = await createCategory(newCategoryName);
                if (created) {
                  setNewCategoryName("");
                  toast.success("Category added");
                }
              }}
            >
              Add
            </Button>
          </div>
          <div className="max-h-64 overflow-auto space-y-2">
            {categories.map((c) => (
              <div
                key={c.ID}
                className="flex items-center gap-2 border rounded-md px-2 py-1.5"
              >
                {editingCategoryId === c.ID ? (
                  <>
                    <Input
                      className="h-8"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                    />
                    <Button size="sm" onClick={saveCategoryEdit}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingCategoryId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{c.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingCategoryId(c.ID);
                        setEditingCategoryName(c.name);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteCategory(c.ID)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No categories yet.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit expense</DialogTitle>
            <DialogDescription>
              Changing name or category will ask whether to update only this
              row or every expense with the same name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={editForm.category || NONE_CATEGORY}
                onValueChange={(v) => {
                  if (v === NEW_CATEGORY) {
                    void (async () => {
                      const name = window.prompt("New category name");
                      if (!name?.trim()) return;
                      const created = await createCategory(name);
                      if (created) {
                        setEditForm({ ...editForm, category: created.name });
                      }
                    })();
                    return;
                  }
                  setEditForm({
                    ...editForm,
                    category: v === NONE_CATEGORY ? "" : v,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_CATEGORY}>—</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.ID} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CATEGORY}>+ New category…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.value}
                  onChange={(e) =>
                    setEditForm({ ...editForm, value: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select
                  value={editForm.currency}
                  onValueChange={(v) =>
                    setEditForm({
                      ...editForm,
                      currency: v as Expense["currency"],
                    })
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
                <Label>Date</Label>
                <Input
                  type="date"
                  value={editForm.date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Recurring</Label>
                <Select
                  value={editForm.recurring || "none"}
                  onValueChange={(v) =>
                    setEditForm({
                      ...editForm,
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
              <Label>Note</Label>
              <Textarea
                rows={2}
                value={editForm.note}
                onChange={(e) =>
                  setEditForm({ ...editForm, note: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button disabled={editSaving} onClick={onEditSaveClick}>
              {editSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkOpen}
        onOpenChange={(open) => {
          setBulkOpen(open);
          if (!open && !editOpen) {
            setEditing(null);
            fetchPage(page);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply to other expenses?</DialogTitle>
            <DialogDescription>
              Update only this row, or every expense currently named{" "}
              <strong>{editing?.name}</strong> (name + category).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button
              disabled={editSaving}
              onClick={() => void saveEdit(false)}
              className="w-full"
            >
              Only this one
            </Button>
            <Button
              disabled={editSaving}
              variant="secondary"
              onClick={() => void saveEdit(true)}
              className="w-full"
            >
              Update all with the same name
            </Button>
            <Button
              variant="ghost"
              disabled={editSaving}
              onClick={() => setBulkOpen(false)}
              className="w-full"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { Check, Copy, FileUp, Pencil, Trash2 } from "lucide-react";
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
import { CategorySelect } from "@/components/organisms/CategorySelect";
import { DateField } from "@/components/molecules/DateField";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { BudgetsDialog } from "@/components/organisms/BudgetsDialog";

const API_BASE = "http://localhost:8080";
const PAGE_SIZE = 25;

// Local calendar date as "YYYY-MM-DD" (not UTC — toISOString() would roll over
// late in the day for negative-offset timezones like BRT).
const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Turn a <input type="date"> value ("YYYY-MM-DD") into an ISO instant anchored
// at local noon. `new Date("YYYY-MM-DD")` parses as UTC midnight, which displays
// as the previous day in zones behind UTC; noon keeps the calendar day stable.
const dateInputToISO = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
};

// Inverse of dateInputToISO: the stored instant's *local* calendar day, so the
// edit form shows the same date the table renders (both use local time).
const isoToDateInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; // YYYY-MM (local)
};

// Quick month choices for the All Expenses list filter: the last `count` months
// as { value: "YYYY-MM", label: "Mon YYYY" }, newest first.
function recentMonthOptions(count = 24) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    };
  });
}

// A selectable analytics/list period. `from`/`to` are YYYY-MM-DD (inclusive);
// `from` omitted means all time, `to` omitted means "up to today". `title` is a
// compact label the overview cards fold into their headings.
type PeriodOption = {
  value: string;
  label: string;
  title: string;
  from?: string;
  to?: string;
};

type PeriodGroup = { label: string; options: PeriodOption[] };

// Groups shown in the period dropdown: quick rolling ranges, whole years, then
// individual months. Values are self-describing so the resolver is a plain map.
function buildPeriodGroups(): PeriodGroup[] {
  const now = new Date();
  const todayIso = isoDate(now);
  const yr = now.getFullYear();

  const quick: PeriodOption[] = [
    { value: "all", label: "All time", title: "all time" },
    {
      value: "30d",
      label: "Last 30 days",
      title: "last 30 days",
      from: isoDate(new Date(yr, now.getMonth(), now.getDate() - 29)),
      to: todayIso,
    },
    {
      value: "90d",
      label: "Last 90 days",
      title: "last 90 days",
      from: isoDate(new Date(yr, now.getMonth(), now.getDate() - 89)),
      to: todayIso,
    },
    {
      value: "12m",
      label: "Last 12 months",
      title: "last 12 months",
      from: isoDate(new Date(yr, now.getMonth() - 11, 1)),
      to: todayIso,
    },
  ];

  const years: PeriodOption[] = Array.from({ length: 6 }, (_, i) => {
    const y = yr - i;
    const isCurrent = y === yr;
    return {
      value: `year:${y}`,
      label: isCurrent ? `This year (${y})` : String(y),
      title: isCurrent ? "this year" : String(y),
      from: `${y}-01-01`,
      to: isCurrent ? todayIso : `${y}-12-31`,
    };
  });

  const months: PeriodOption[] = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(yr, now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const isCurrent = i === 0;
    const label = d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      value: `month:${key}`,
      label: isCurrent ? `${label} (this month)` : label,
      title: isCurrent ? "this month" : label,
      from: `${key}-01`,
      to: isCurrent ? todayIso : isoDate(lastDay),
    };
  });

  return [
    { label: "Quick ranges", options: quick },
    { label: "Years", options: years },
    { label: "Months", options: months },
  ];
}

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

// Persist an in-progress import preview (with the user's name/category edits) so
// it survives a page reload, not just closing the dialog. Cleared once the
// import is confirmed and saved.
const IMPORT_DRAFT_KEY = "expense-import-draft";

type ImportDraft = {
  bank: string;
  warnings: string[];
  rows: PreviewRow[];
};

function loadImportDraft(): ImportDraft | null {
  try {
    const raw = localStorage.getItem(IMPORT_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ImportDraft;
    if (!Array.isArray(draft.rows) || draft.rows.length === 0) return null;
    return draft;
  } catch {
    return null;
  }
}

// Memoized so typing in one import row doesn't re-render all ~100 rows (each of
// which mounts a Select/Dialog). Unchanged rows keep their object identity, so
// memo skips them; all callbacks are stable (useCallback in the parent).
const ImportPreviewRow = memo(function ImportPreviewRow({
  row,
  idx,
  categories,
  sameNameCount,
  replicated,
  onCreateCategory,
  onToggle,
  onName,
  onCategory,
  onReplicate,
}: {
  row: PreviewRow;
  idx: number;
  categories: ExpenseCategory[];
  // Number of still-importable rows that share this row's original statement
  // name (including itself). Drives whether the Replicate button is shown.
  sameNameCount: number;
  // True once this row's name+category have been replicated to its siblings and
  // haven't been edited since. Swaps the button for a static "Replicated" mark.
  replicated: boolean;
  onCreateCategory: (name: string) => Promise<ExpenseCategory | null>;
  onToggle: (idx: number, checked: boolean) => void;
  onName: (idx: number, name: string) => void;
  onCategory: (idx: number, category: string) => void;
  onReplicate: (idx: number) => void;
}) {
  const original = row.original_name || row.name;
  const nameChanged = row.name.trim() !== original.trim();
  return (
    <TableRow className={row.already_imported ? "opacity-50" : undefined}>
      <TableCell>
        <input
          type="checkbox"
          checked={row.checked}
          disabled={row.already_imported}
          onChange={(e) => onToggle(idx, e.target.checked)}
        />
      </TableCell>
      <TableCell>{new Date(row.date).toLocaleDateString("pt-BR")}</TableCell>
      <TableCell>
        <Input
          value={row.name}
          disabled={row.already_imported}
          className="h-8"
          onChange={(e) => onName(idx, e.target.value)}
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
                onClick={() => onName(idx, original)}
              >
                Use original
              </button>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <CategorySelect
          value={row.category || ""}
          disabled={row.already_imported}
          categories={categories}
          onCreate={onCreateCategory}
          onChange={(category) => onCategory(idx, category)}
          triggerClassName="h-8"
        />
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
      <TableCell className="text-right">
        {!row.already_imported &&
          sameNameCount > 1 &&
          (replicated ? (
            <span
              className="inline-flex h-8 items-center gap-1 px-2 text-xs font-medium text-emerald-600"
              title="Name & category replicated to matching rows"
            >
              <Check className="h-3.5 w-3.5" />
              Replicated
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              title="Apply this name & category to all other rows with the same original name"
              onClick={() => onReplicate(idx)}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Replicate ({sameNameCount - 1})
            </Button>
          ))}
      </TableCell>
    </TableRow>
  );
});

export default function ExpensesPage() {
  const navigate = useNavigate();
  const { refreshData, loading, hideValues, toggleHideValues, dollarRate } =
    useApp();

  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedExpenses | null>(null);
  const [listLoading, setListLoading] = useState(false);
  // Search over the full expense list by name/category (debounced before it hits
  // the server so typing doesn't fire a request per keystroke).
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  // Quick month filter for the All Expenses list; "all" follows the page period.
  const [listMonth, setListMonth] = useState("all");
  const listMonths = useMemo(() => recentMonthOptions(), []);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [analyticsKey, setAnalyticsKey] = useState(0);
  // Period filter: scopes both the analytics overview and the list below.
  // Defaults to the current month to preserve the previous behaviour.
  const periodGroups = useMemo(() => buildPeriodGroups(), []);
  const periodByValue = useMemo(() => {
    const m = new Map<string, PeriodOption>();
    for (const g of periodGroups) for (const o of g.options) m.set(o.value, o);
    return m;
  }, [periodGroups]);
  const [periodValue, setPeriodValue] = useState(
    () => `month:${localMonthKey()}`
  );
  const period =
    periodByValue.get(periodValue) ?? periodGroups[0].options[0];
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
  // Empty = no bank chosen yet; the user must pick one before importing. Only
  // Nubank and Inter are supported, so auto-detection (and its confidence
  // warnings) is gone in favour of an explicit choice.
  const [importBank, setImportBank] = useState<"" | "nubank" | "inter">("");
  const [importParsing, setImportParsing] = useState(false);
  const [importConfirming, setImportConfirming] = useState(false);
  const draftRef = useRef<ImportDraft | null>(loadImportDraft());
  const [previewBank, setPreviewBank] = useState(() => draftRef.current?.bank ?? "");
  const [previewWarnings, setPreviewWarnings] = useState<string[]>(
    () => draftRef.current?.warnings ?? []
  );
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>(
    () => draftRef.current?.rows ?? []
  );
  // Mirror of previewRows so replicateRow can read the latest rows while keeping
  // a stable (empty-deps) callback — otherwise every edit would re-render all
  // the memoized preview rows.
  const previewRowsRef = useRef<PreviewRow[]>([]);
  // Row index -> name/category signature at the moment it was replicated. A row
  // shows the "Replicated" mark only while its current signature still matches,
  // so editing name/category afterwards brings the button back.
  const [replicatedSigs, setReplicatedSigs] = useState<Record<number, string>>(
    {}
  );
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description?: string;
    onConfirm: () => void;
  } | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);

  const fetchCategories = useCallback(() => {
    fetch(`${API_BASE}/expense-categories`)
      .then((r) => r.json())
      .then((rows: ExpenseCategory[]) => setCategories(rows ?? []))
      .catch(() => toast.error("Failed to load categories"));
  }, []);

  const fetchPage = useCallback(
    (p: number) => {
      setListLoading(true);
      const params = new URLSearchParams({
        page: String(p),
        page_size: String(PAGE_SIZE),
      });
      if (appliedSearch) params.set("q", appliedSearch);
      // The card's month quick-filter (when set) narrows the list to that single
      // month; otherwise the list follows the page's period selector.
      if (listMonth !== "all") {
        params.set("month", listMonth);
      } else {
        if (period.from) params.set("from", period.from);
        if (period.to) params.set("to", period.to);
      }
      fetch(`${API_BASE}/expenses?${params.toString()}`)
        .then((r) => r.json())
        .then((d: PaginatedExpenses) => {
          // The backend already returns rows newest-first (date DESC, then
          // created_at DESC), which also orders correctly across pages. Keep
          // that order as-is instead of re-sorting with a random UUID tiebreak.
          setData({ ...d, items: d.items ?? [] });
        })
        .catch((err) => {
          console.error(err);
          toast.error("Failed to load expenses");
        })
        .finally(() => setListLoading(false));
    },
    [appliedSearch, period.from, period.to, listMonth]
  );

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  // Debounce the search box, then jump back to page 1 for the new query.
  useEffect(() => {
    const id = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [appliedSearch, periodValue, listMonth]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (inlineEditId && inlineNameRef.current) {
      inlineNameRef.current.focus();
      inlineNameRef.current.select();
    }
  }, [inlineEditId]);

  useEffect(() => {
    previewRowsRef.current = previewRows;
  }, [previewRows]);

  // Mirror the live preview to localStorage so edits survive a reload. Once the
  // rows are cleared (import confirmed, or a fresh parse replaced nothing), drop
  // the draft so it does not resurface on the next visit.
  useEffect(() => {
    if (previewRows.length === 0) {
      localStorage.removeItem(IMPORT_DRAFT_KEY);
      return;
    }
    localStorage.setItem(
      IMPORT_DRAFT_KEY,
      JSON.stringify({
        bank: previewBank,
        warnings: previewWarnings,
        rows: previewRows,
      } satisfies ImportDraft)
    );
  }, [previewRows, previewBank, previewWarnings]);

  const selectedCount = useMemo(
    () => previewRows.filter((r) => r.checked && !r.already_imported).length,
    [previewRows]
  );

  // Running BRL total of the rows that will actually be imported, so the amount
  // is visible before confirming. USD rows convert via the cached dollar rate;
  // any other currency (e.g. BTC) has no frontend rate so it's left out of the
  // sum and flagged separately.
  const selectedTotal = useMemo(() => {
    let brl = 0;
    let hasUnconverted = false;
    for (const r of previewRows) {
      if (!r.checked || r.already_imported) continue;
      if (r.currency === "BRL") brl += r.value;
      else if (r.currency === "USD") brl += r.value * dollarRate;
      else hasUnconverted = true;
    }
    return { brl, hasUnconverted };
  }, [previewRows, dollarRate]);

  // Rows are grouped by their original statement text, so renaming/categorizing
  // one and replicating applies to the same merchant appearing multiple times.
  const previewNameKey = (r: PreviewRow) => r.original_name || r.name;

  // Identifies the exact name+category a row was last replicated with.
  const replicateSig = (r: PreviewRow) => `${r.name}\u0000${r.category || ""}`;

  // How many still-importable rows share each original name. original_name is
  // immutable in the preview, so these counts stay stable across name edits and
  // don't bust ImportPreviewRow's memoization.
  const sameNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of previewRows) {
      if (r.already_imported) continue;
      const key = previewNameKey(r);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [previewRows]);

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
          date: dateInputToISO(form.date),
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

  function onDelete(id: string) {
    setConfirmState({
      title: "Delete this expense?",
      onConfirm: () => void doDelete(id),
    });
  }

  async function doDelete(id: string) {
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
      date: isoToDateInput(e.date),
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
      date: isoToDateInput(expense.date),
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
      date: dateInputToISO(editForm.date),
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
    if (!importBank) {
      toast.error("Select a bank before importing");
      return;
    }
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
      setReplicatedSigs({});
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
          origin: r.origin || "",
          date: r.date,
          value: r.value,
          currency: r.currency,
          bank: r.bank || previewBank,
          payment_type: r.payment_type || "credit",
          external_key: r.external_key,
          installment_n: r.installment_n,
          installment_of: r.installment_of,
          installment_group: r.installment_group,
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
      setReplicatedSigs({});
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

  const createCategory = useCallback(
    async (name: string): Promise<ExpenseCategory | null> => {
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
    },
    []
  );

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

  function deleteCategory(id: string) {
    setConfirmState({
      title: "Delete this category label?",
      description: "Existing expenses keep their text.",
      onConfirm: () => void doDeleteCategory(id),
    });
  }

  async function doDeleteCategory(id: string) {
    const res = await fetch(`${API_BASE}/expense-categories/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete category");
      return;
    }
    fetchCategories();
  }

  const setPreviewRowCategory = useCallback((idx: number, category: string) => {
    setPreviewRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, category } : r))
    );
  }, []);

  const setPreviewRowChecked = useCallback((idx: number, checked: boolean) => {
    setPreviewRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, checked } : r))
    );
  }, []);

  const setPreviewRowName = useCallback((idx: number, name: string) => {
    setPreviewRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, name } : r))
    );
  }, []);

  // Copy this row's edited name + category onto every other still-importable row
  // with the same original statement name.
  const replicateRow = useCallback((idx: number) => {
    const rows = previewRowsRef.current;
    const src = rows[idx];
    if (!src) return;
    const key = src.original_name || src.name;
    const matchIdx = rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r, i }) =>
          i !== idx && !r.already_imported && (r.original_name || r.name) === key
      )
      .map(({ i }) => i);
    if (matchIdx.length === 0) {
      toast.info("No other rows with the same name");
      return;
    }
    setPreviewRows((prev) =>
      prev.map((r, i) =>
        i === idx || r.already_imported || (r.original_name || r.name) !== key
          ? r
          : { ...r, name: src.name, category: src.category }
      )
    );
    // Mark the source and every row it was replicated onto, so none of them show
    // the Replicate button anymore (they're all in sync now).
    const sig = replicateSig(src);
    setReplicatedSigs((prev) => {
      const next = { ...prev, [idx]: sig };
      for (const i of matchIdx) next[i] = sig;
      return next;
    });
    toast.success(
      `Applied name & category to ${matchIdx.length} matching row(s)`
    );
  }, []);

  const openBudgets = useCallback(() => {
    fetchCategories();
    setBudgetsOpen(true);
  }, [fetchCategories]);

  // Check/uncheck every importable row in an origin section at once.
  function toggleOrigin(origin: string, checked: boolean) {
    setPreviewRows((rows) =>
      rows.map((r) =>
        r.origin === origin && !r.already_imported ? { ...r, checked } : r
      )
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Overview
        </h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="analytics-period" className="text-sm">
            Period
          </Label>
          <Select value={periodValue} onValueChange={setPeriodValue}>
            <SelectTrigger id="analytics-period" className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {periodGroups.map((g) => (
                <SelectGroup key={g.label}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-6">
        <ExpenseAnalyticsPanel
          hideValues={hideValues}
          refreshKey={analyticsKey}
          from={period.from}
          to={period.to}
          periodTitle={period.title}
          onEditBudgets={openBudgets}
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
          onValueChange={(v) => setImportBank(v as "nubank" | "inter")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Select bank" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nubank">Nubank</SelectItem>
            <SelectItem value="inter">Inter</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          disabled={importParsing || !importBank}
          title={!importBank ? "Select a bank first" : undefined}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="mr-2 h-4 w-4" />
          {importParsing ? "Parsing..." : "Import credit card statement"}
        </Button>
        {!importOpen && previewRows.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            Resume import ({selectedCount} selected)
          </Button>
        )}
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
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            fetchCategories();
            setBudgetsOpen(true);
          }}
        >
          Budgets
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
                <CategorySelect
                  id="category"
                  value={form.category}
                  categories={categories}
                  onCreate={createCategory}
                  onChange={(category) => setForm({ ...form, category })}
                  triggerClassName="w-full"
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
                  <DateField
                    id="date"
                    value={form.date}
                    onChange={(date) => setForm({ ...form, date })}
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
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="shrink-0">All Expenses</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={listMonth} onValueChange={setListMonth}>
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (period)</SelectItem>
                  {listMonths.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or category…"
                className="h-8 w-44 sm:w-52"
              />
              {data && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {data.total} total
                </span>
              )}
            </div>
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
                          {e.installment_of && e.installment_of > 1 ? (
                            <Badge variant="outline" className="ml-2 font-normal">
                              {e.installment_n}/{e.installment_of}
                            </Badge>
                          ) : null}
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
                      {appliedSearch
                        ? `No expenses match “${appliedSearch}”.`
                        : "No expenses yet. Add your first one on the left."}
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
          {/* ESC / backdrop close normally; edited rows stay in previewRows
              state, and a "Resume import" button reopens them without re-parsing. */}
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, idx) => {
                  const showGroup =
                    idx === 0 || previewRows[idx - 1].origin !== row.origin;
                  const groupRows = showGroup
                    ? previewRows.filter(
                        (r) => r.origin === row.origin && !r.already_imported
                      )
                    : [];
                  const groupChecked = groupRows.filter((r) => r.checked).length;
                  const groupAll =
                    groupRows.length > 0 && groupChecked === groupRows.length;
                  const groupSome = groupChecked > 0 && !groupAll;
                  return (
                    <Fragment key={row.external_key || idx}>
                    {showGroup && row.origin && (
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={8} className="py-2">
                          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={groupAll}
                              ref={(el) => {
                                if (el) el.indeterminate = groupSome;
                              }}
                              disabled={groupRows.length === 0}
                              onChange={(e) =>
                                toggleOrigin(row.origin, e.target.checked)
                              }
                            />
                            {row.origin}
                            <span className="font-normal text-muted-foreground">
                              ({groupChecked}/{groupRows.length} selected)
                            </span>
                          </label>
                        </TableCell>
                      </TableRow>
                    )}
                    <ImportPreviewRow
                      row={row}
                      idx={idx}
                      categories={categories}
                      sameNameCount={
                        sameNameCounts.get(row.original_name || row.name) ?? 0
                      }
                      replicated={replicatedSigs[idx] === replicateSig(row)}
                      onCreateCategory={createCategory}
                      onToggle={setPreviewRowChecked}
                      onName={setPreviewRowName}
                      onCategory={setPreviewRowCategory}
                      onReplicate={replicateRow}
                    />
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <div className="mr-auto flex flex-col text-sm">
              <span className="text-muted-foreground">
                {selectedCount} selected
              </span>
              <span className="font-medium">
                Importing {formatCurrency(selectedTotal.brl, "BRL")}
                {selectedTotal.hasUnconverted && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    (+ non-BRL rows)
                  </span>
                )}
              </span>
            </div>
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
              <CategorySelect
                value={editForm.category}
                categories={categories}
                onCreate={createCategory}
                onChange={(category) => setEditForm({ ...editForm, category })}
                triggerClassName="w-full"
              />
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
                <DateField
                  value={editForm.date}
                  onChange={(date) => setEditForm({ ...editForm, date })}
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

      <ConfirmDialog
        open={confirmState !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmState(null);
        }}
        title={confirmState?.title ?? ""}
        description={confirmState?.description}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmState?.onConfirm()}
      />

      <BudgetsDialog
        open={budgetsOpen}
        onOpenChange={setBudgetsOpen}
        categories={categories}
        hideValues={hideValues}
        onChanged={bumpAnalytics}
      />
    </DashboardLayout>
  );
}

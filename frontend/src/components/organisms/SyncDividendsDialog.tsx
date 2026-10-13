import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { DividendCandidate } from "@/types";
import { formatCurrency, formatQuantity } from "@/lib/format";

const API_BASE = "http://localhost:8080";

export type SyncScope = "all" | "last-month";

interface SyncDividendsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: SyncScope;
  /** Called after rows are inserted. */
  onImported: () => void;
}

const rowKey = (c: DividendCandidate) =>
  `${c.symbol}|${c.date}|${c.amount.toFixed(4)}`;

export function SyncDividendsDialog({
  open,
  onOpenChange,
  scope,
  onImported,
}: SyncDividendsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<DividendCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/dividends/sync/preview?scope=${scope}`)
      .then((r) => r.json())
      .then((data: DividendCandidate[]) => {
        const list = Array.isArray(data) ? data : [];
        setCandidates(list);
        // Pre-select only the "new" rows; leave likely-duplicates unchecked.
        setSelected(
          new Set(list.filter((c) => c.status === "new").map(rowKey)),
        );
      })
      .catch((e) => {
        console.error("Failed to load dividend preview", e);
        toast.error("Could not fetch dividends from Yahoo");
        setCandidates([]);
      })
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allSelected =
    candidates.length > 0 && selected.size === candidates.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(candidates.map(rowKey)));

  const selectedTotal = useMemo(
    () =>
      candidates
        .filter((c) => selected.has(rowKey(c)))
        .reduce((sum, c) => sum + c.value_brl, 0),
    [candidates, selected],
  );

  const handleConfirm = async () => {
    const rows = candidates.filter((c) => selected.has(rowKey(c)));
    if (rows.length === 0) {
      toast.error("Select at least one dividend to add");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dividends/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          rows.map((c) => ({
            symbol: c.symbol,
            kind: c.kind,
            amount: c.amount,
            tax: 0,
            currency: c.currency,
            dollar_rate: c.dollar_rate,
            date: c.date,
            note: c.note,
            source: "yahoo",
          })),
        ),
      });
      if (!res.ok) throw new Error("request failed");
      const body = (await res.json()) as { inserted: number };
      toast.success(`${body.inserted} dividend(s) added`);
      onImported();
      onOpenChange(false);
    } catch {
      toast.error("Could not add dividends");
    } finally {
      setSaving(false);
    }
  };

  const title =
    scope === "last-month"
      ? "Last month's dividends"
      : "All-time dividends";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Computed from Yahoo payouts × your shares held at each ex-date.
            Nothing is saved until you confirm. Rows that look already-recorded
            are flagged and left unchecked.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              Fetching dividends from Yahoo...
            </div>
          ) : candidates.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg">
              No dividends found for this period.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Ex-date</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Per share</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">BRL</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => {
                  const key = rowKey(c);
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                          aria-label={`Select ${c.symbol}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{c.symbol}</TableCell>
                      <TableCell>{c.date.slice(0, 10)}</TableCell>
                      <TableCell className="text-right">
                        {formatQuantity(c.shares)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(c.per_share, c.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(c.amount, c.currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {c.currency === "BRL" ? "-" : c.dollar_rate.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(c.value_brl, "BRL")}
                      </TableCell>
                      <TableCell>
                        {c.status === "probably_added" ? (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-600"
                          >
                            probably added
                          </Badge>
                        ) : (
                          <Badge variant="secondary">new</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected · {formatCurrency(selectedTotal, "BRL")}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirm()}
              disabled={saving || loading || selected.size === 0}
            >
              {saving ? "Adding..." : `Add ${selected.size} selected`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

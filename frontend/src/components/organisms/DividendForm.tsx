import { useEffect, useState, type FormEvent } from "react";
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
import { toast } from "sonner";
import type { DividendKind } from "@/types";
import { useApp } from "@/contexts/AppContext";

const API_BASE = "http://localhost:8080";

const KINDS: { value: DividendKind; label: string }[] = [
  { value: "dividend", label: "Dividend" },
  { value: "jcp", label: "JCP" },
  { value: "profit", label: "Profit" },
];

const today = () => new Date().toISOString().slice(0, 10);

type FormState = {
  symbol: string;
  kind: DividendKind;
  amount: string;
  tax: string;
  currency: string;
  dollarRate: string;
  date: string;
  note: string;
};

const emptyForm = (): FormState => ({
  symbol: "",
  kind: "dividend",
  amount: "",
  tax: "",
  currency: "USD",
  dollarRate: "",
  date: today(),
  note: "",
});

interface DividendFormFieldsProps {
  /** Called after a successful save. */
  onSaved: () => void;
  /** When provided, a Cancel button is shown (e.g. in a dialog). */
  onCancel?: () => void;
  submitLabel?: string;
}

export function DividendFormFields({
  onSaved,
  onCancel,
  submitLabel = "Add dividend",
}: DividendFormFieldsProps) {
  const { stockPrices, dollarRate } = useApp();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Prefill the dollar rate with the current cached rate as a convenient starting
  // point, while leaving it fully editable so each dividend keeps its own rate.
  useEffect(() => {
    if (dollarRate > 0) {
      setForm((f) =>
        f.dollarRate === "" ? { ...f, dollarRate: String(dollarRate) } : f,
      );
    }
  }, [dollarRate]);

  // Only tickers already in the portfolio may receive a dividend.
  const knownSymbols = stockPrices.map((s) => s.symbol).sort();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.symbol.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Ticker and a positive amount are required");
      return;
    }
    if (!knownSymbols.includes(form.symbol)) {
      toast.error("Pick an existing ticker from your portfolio");
      return;
    }
    const rate = parseFloat(form.dollarRate);
    if (form.currency === "USD" && (!Number.isFinite(rate) || rate <= 0)) {
      toast.error("Enter the USD→BRL dollar rate for this dividend");
      return;
    }
    const tax = form.tax.trim() === "" ? 0 : parseFloat(form.tax);
    if (!Number.isFinite(tax) || tax < 0) {
      toast.error("Tax must be zero or a positive number");
      return;
    }
    if (tax > amount) {
      toast.error("Tax cannot exceed the amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/dividends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: form.symbol.trim().toUpperCase(),
          kind: form.kind,
          amount,
          tax,
          currency: form.currency,
          dollar_rate: form.currency === "USD" ? rate : 0,
          date: new Date(form.date).toISOString(),
          note: form.note,
        }),
      });
      if (!res.ok) throw new Error("request failed");
      toast.success("Dividend recorded");
      setForm(emptyForm());
      onSaved();
    } catch {
      toast.error("Could not save dividend");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Ticker</Label>
        <Select
          value={form.symbol}
          onValueChange={(v) => setForm((f) => ({ ...f, symbol: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a ticker" />
          </SelectTrigger>
          <SelectContent>
            {knownSymbols.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No tickers yet — add a transaction first.
              </div>
            ) : (
              knownSymbols.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Kind</Label>
        <Select
          value={form.kind}
          onValueChange={(v) =>
            setForm((f) => ({ ...f, kind: v as DividendKind }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select
            value={form.currency}
            onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="BRL">BRL</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tax">Tax ({form.currency})</Label>
        <Input
          id="tax"
          type="number"
          step="any"
          min="0"
          placeholder="0.00"
          value={form.tax}
          onChange={(e) => setForm((f) => ({ ...f, tax: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          Tax withheld on this income. Deducted before converting to BRL.
        </p>
      </div>
      {form.currency === "USD" && (
        <div className="space-y-2">
          <Label htmlFor="dollarRate">Dollar rate (USD→BRL)</Label>
          <Input
            id="dollarRate"
            type="number"
            step="any"
            min="0"
            placeholder="5.50"
            value={form.dollarRate}
            onChange={(e) =>
              setForm((f) => ({ ...f, dollarRate: e.target.value }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Rate at the time you received this dividend. Saved with the entry so
            BRL totals stay fixed.
          </p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Textarea
          id="note"
          rows={2}
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        />
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

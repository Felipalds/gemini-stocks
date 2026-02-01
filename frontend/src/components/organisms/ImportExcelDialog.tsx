import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const formSchema = z.object({
  symbol: z
    .string()
    .min(2, "Symbol must be at least 2 characters")
    .toUpperCase(),
  currency: z.enum(["USD", "BRL"]),
});

type FormValues = z.infer<typeof formSchema>;

interface ImportExcelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportExcelDialog({
  open,
  onOpenChange,
  onImported,
}: ImportExcelDialogProps) {
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      symbol: "",
      currency: "USD",
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
  }

  async function onSubmit(values: FormValues) {
    if (!file) {
      toast.error("Please select an Excel file");
      return;
    }

    setSaving(true);
    const toastId = toast.loading("Importing transactions...");

    try {
      const formData = new FormData();
      formData.append("symbol", values.symbol);
      formData.append("currency", values.currency);
      formData.append("file", file);

      const res = await fetch("http://localhost:8080/transactions/import", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (result.imported > 0 && result.failed === 0) {
        toast.success(`Imported ${result.imported} transactions`, {
          id: toastId,
        });
      } else if (result.imported > 0 && result.failed > 0) {
        toast.warning(
          `Imported ${result.imported}, failed ${result.failed} rows`,
          {
            id: toastId,
            description: result.errors
              ?.map(
                (e: { row: number; message: string }) =>
                  `Row ${e.row}: ${e.message}`,
              )
              .join("; "),
          },
        );
      } else {
        toast.error("Import failed", {
          id: toastId,
          description: result.errors
            ?.map(
              (e: { row: number; message: string }) =>
                `Row ${e.row}: ${e.message}`,
            )
            .join("; "),
        });
      }

      if (result.imported > 0) {
        onImported();
        onOpenChange(false);
        form.reset();
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Import from Excel</DialogTitle>
          <DialogDescription>
            Upload an <code>.xlsx</code> file with columns:{" "}
            <strong>Date, Quantity, Price, Fee</strong>.
            <br />
            Date format: <code>YYYY-MM-DD</code> (e.g. 2025-01-15).
            <br />
            All rows will be imported as BUY transactions for the ticker below.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticker Symbol</FormLabel>
                    <FormControl>
                      <Input placeholder="AAPL" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="BRL">BRL (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Excel File (.xlsx)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
              />
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button variant="outline" type="submit" disabled={saving}>
                {saving ? "Importing..." : "Import"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

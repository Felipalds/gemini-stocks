import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import type { Dividend, DividendSummary } from "@/types";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency } from "@/lib/format";
import { DividendFormFields } from "@/components/organisms/DividendForm";
import {
  SyncDividendsDialog,
  type SyncScope,
} from "@/components/organisms/SyncDividendsDialog";
import { DividendCharts } from "@/components/organisms/DividendCharts";

const API_BASE = "http://localhost:8080";

export default function DividendsPage() {
  const { refreshData, loading, hideValues, toggleHideValues } = useApp();

  const [items, setItems] = useState<Dividend[]>([]);
  const [summary, setSummary] = useState<DividendSummary | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [syncScope, setSyncScope] = useState<SyncScope | null>(null);
  const [searchParams] = useSearchParams();
  const formRef = useRef<HTMLDivElement>(null);

  const mask = (s: string) => (hideValues ? "••••" : s);

  // Scroll the add form into view when arriving via the dashboard "Add Dividend"
  // quick-add button (?add=1).
  useEffect(() => {
    if (searchParams.get("add") === "1") {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [searchParams]);

  const fetchAll = useCallback(() => {
    setListLoading(true);
    Promise.all([
      fetch(`${API_BASE}/dividends`).then((r) => r.json()),
      fetch(`${API_BASE}/dividends/summary`).then((r) => r.json()),
    ])
      .then(([list, sum]) => {
        setItems(list || []);
        setSummary(sum || null);
      })
      .catch((err) => console.error("Error fetching dividends:", err))
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/dividends/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error("request failed");
      toast.success("Dividend deleted");
      fetchAll();
    } catch {
      toast.error("Could not delete dividend");
    }
  };

  return (
    <DashboardLayout
      onRefresh={() => {
        refreshData();
        fetchAll();
      }}
      isLoading={loading || listLoading}
      hideValues={hideValues}
      onToggleHideValues={toggleHideValues}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Dividends & Gains
            </h2>
            <p className="text-muted-foreground">
              Record dividends, JCP, and realized profits per ticker.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setSyncScope("last-month")}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Fetch last month
            </Button>
            <Button variant="outline" onClick={() => setSyncScope("all")}>
              <DownloadCloud className="mr-2 h-4 w-4" />
              Sync all time
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {mask(formatCurrency(summary?.total_brl ?? 0, "BRL"))}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Entries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{summary?.count ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tickers paying
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {summary?.by_ticker.length ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Visual breakdown: per-ticker pie + monthly line (filterable by ticker) */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No dividends recorded yet.
              </p>
            ) : (
              <DividendCharts items={items} hideValues={hideValues} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Add form */}
          <Card ref={formRef}>
            <CardHeader>
              <CardTitle>Add dividend</CardTitle>
            </CardHeader>
            <CardContent>
              <DividendFormFields onSaved={fetchAll} />
            </CardContent>
          </Card>

          {/* Breakdowns */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Per ticker</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Total (BRL)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(summary?.by_ticker ?? []).map((t) => (
                      <TableRow key={t.symbol}>
                        <TableCell className="font-medium">{t.symbol}</TableCell>
                        <TableCell className="text-right">{t.count}</TableCell>
                        <TableCell className="text-right">
                          {mask(formatCurrency(t.total_brl, "BRL"))}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(summary?.by_ticker.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground"
                        >
                          No dividends yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>By year</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(summary?.by_year ?? []).map((b) => (
                    <div
                      key={b.key}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{b.key}</span>
                      <span className="font-medium">
                        {mask(formatCurrency(b.total_brl, "BRL"))}
                      </span>
                    </div>
                  ))}
                  {(summary?.by_year.length ?? 0) === 0 && (
                    <p className="text-sm text-muted-foreground">No data.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>By month</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                  {(summary?.by_month ?? []).map((b) => (
                    <div
                      key={b.key}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{b.key}</span>
                      <span className="font-medium">
                        {mask(formatCurrency(b.total_brl, "BRL"))}
                      </span>
                    </div>
                  ))}
                  {(summary?.by_month.length ?? 0) === 0 && (
                    <p className="text-sm text-muted-foreground">No data.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* All entries */}
        <Card>
          <CardHeader>
            <CardTitle>All entries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">BRL</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.ID}>
                    <TableCell>{d.date?.slice(0, 10)}</TableCell>
                    <TableCell className="font-medium">{d.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{d.kind}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {mask(formatCurrency(d.amount, d.currency))}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {d.tax ? mask(formatCurrency(d.tax, d.currency)) : "-"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {d.currency === "USD" && d.dollar_rate
                        ? d.dollar_rate.toFixed(2)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {mask(formatCurrency(d.value_brl ?? 0, "BRL"))}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {d.note}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(d.ID)}
                        aria-label="Delete dividend"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground"
                    >
                      No dividends recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {syncScope && (
        <SyncDividendsDialog
          open={syncScope !== null}
          onOpenChange={(o) => {
            if (!o) setSyncScope(null);
          }}
          scope={syncScope}
          onImported={fetchAll}
        />
      )}
    </DashboardLayout>
  );
}

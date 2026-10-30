import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";

const API = "http://localhost:8080";

export default function SettingsPage() {
  const { refreshData, loading, hideValues, toggleHideValues } = useApp();

  const [usdRate, setUsdRate] = useState("");
  // IOF is stored as a fraction on the backend (0.0038); shown here as a percent.
  const [iofBuyPct, setIofBuyPct] = useState("");
  const [iofSellPct, setIofSellPct] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [savingIof, setSavingIof] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    fetch(`${API}/currencies/usd`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.rate === "number") setUsdRate(String(d.rate));
      })
      .catch(() => {});
    fetch(`${API}/settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setIofBuyPct(String((d.iof_buy_rate ?? 0) * 100));
          setIofSellPct(String((d.iof_sell_rate ?? 0) * 100));
        }
      })
      .catch(() => {});
  }, []);

  async function saveUsdRate() {
    const rate = parseFloat(usdRate);
    if (!(rate > 0)) {
      toast.error("Enter a positive USD rate");
      return;
    }
    setSavingRate(true);
    const toastId = toast.loading("Saving USD rate...");
    try {
      const res = await fetch(`${API}/currencies/usd`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate }),
      });
      if (res.ok) {
        toast.success("USD rate saved", { id: toastId });
        refreshData();
      } else {
        toast.error("Failed to save USD rate", { id: toastId });
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setSavingRate(false);
    }
  }

  async function saveIof() {
    const buy = parseFloat(iofBuyPct);
    const sell = parseFloat(iofSellPct);
    if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy < 0 || sell < 0) {
      toast.error("IOF percentages must be zero or positive");
      return;
    }
    setSavingIof(true);
    const toastId = toast.loading("Saving IOF...");
    try {
      const res = await fetch(`${API}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iof_buy_rate: buy / 100,
          iof_sell_rate: sell / 100,
        }),
      });
      if (res.ok) {
        toast.success("IOF saved", {
          id: toastId,
          description: "Applies to future transactions only.",
        });
      } else {
        toast.error("Failed to save IOF", { id: toastId });
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setSavingIof(false);
    }
  }

  async function runBackfill() {
    if (
      !confirm(
        "Fill the purchase-day exchange rate for transactions that don't have one yet? This changes BRL invested/profit to reflect what you really paid.",
      )
    )
      return;
    setBackfilling(true);
    const toastId = toast.loading("Backfilling exchange rates...");
    try {
      const res = await fetch(`${API}/transactions/backfill-rates`, {
        method: "POST",
      });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as {
          updated?: number;
          failed?: number;
          candidates?: number;
        } | null;
        toast.success("Backfill complete", {
          id: toastId,
          description: `Updated ${body?.updated ?? 0}, failed ${body?.failed ?? 0} of ${body?.candidates ?? 0}.`,
        });
        refreshData();
      } else {
        toast.error("Backfill failed", { id: toastId });
      }
    } catch {
      toast.error("Connection error", { id: toastId });
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <DashboardLayout
      onRefresh={refreshData}
      isLoading={loading}
      hideValues={hideValues}
      onToggleHideValues={toggleHideValues}
    >
      <div className="py-8 max-w-xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">USD → BRL rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The current rate used to value USD holdings. Use “Update prices” on
              the dashboard to fetch it live, or set it manually here.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="usdRate">USD 1 = R$</Label>
                <Input
                  id="usdRate"
                  type="number"
                  step="0.0001"
                  value={usdRate}
                  onChange={(e) => setUsdRate(e.target.value)}
                />
              </div>
              <Button onClick={saveUsdRate} disabled={savingRate}>
                {savingRate ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">IOF (foreign exchange tax)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Added on top of the historical FX rate when computing the real cost of
              USD purchases. Buy and sell differ; update these whenever the
              government changes them. Changes apply to <strong>future</strong>{" "}
              transactions only — existing ones keep the rate they were saved with.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="iofBuy">IOF buy (%)</Label>
                <Input
                  id="iofBuy"
                  type="number"
                  step="0.01"
                  value={iofBuyPct}
                  onChange={(e) => setIofBuyPct(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="iofSell">IOF sell (%)</Label>
                <Input
                  id="iofSell"
                  type="number"
                  step="0.01"
                  value={iofSellPct}
                  onChange={(e) => setIofSellPct(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={saveIof} disabled={savingIof}>
              {savingIof ? "Saving..." : "Save IOF"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backfill purchase-day rates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Fills the historical USD→BRL rate (plus IOF) for older transactions
              that don’t have one yet, so BRL invested/profit reflect what you really
              paid. Safe to run multiple times; only untouched rows change.
            </p>
            <Button
              variant="outline"
              onClick={runBackfill}
              disabled={backfilling}
            >
              {backfilling ? "Backfilling..." : "Run backfill"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

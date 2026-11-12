import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";

// Scaffold for the News page. Three components will be filled in one by one:
//   1. Variation squares (owned stocks, intraday graph, daily/monthly/yearly %)
//   2. Next dividends (right column)
//   3. News feed (owned stocks + general market)
export default function NewsPage() {
  const {
    refreshData,
    loading,
    syncing,
    syncPrices,
    hideValues,
    toggleHideValues,
    currencyView,
    toggleCurrencyView,
  } = useApp();

  return (
    <DashboardLayout
      onRefresh={refreshData}
      isLoading={loading}
      onSyncPrices={syncPrices}
      isSyncing={syncing}
      hideValues={hideValues}
      onToggleHideValues={toggleHideValues}
      currencyView={currencyView}
      onToggleCurrencyView={toggleCurrencyView}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your stocks — variation</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Variation squares (intraday graph, daily/monthly/yearly) — coming next.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">News</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              News about your stocks and the market — coming soon.
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Next dividends</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Upcoming dividends, yield, and your projected payout — coming soon.
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

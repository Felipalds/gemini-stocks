import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import {
  TransactionFormFields,
  type TransactionFormValues,
} from "@/components/organisms/TransactionForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";

export default function AddTransactionPage() {
  const navigate = useNavigate();
  const { refreshData, loading, hideValues, toggleHideValues } = useApp();

  function onSubmit(values: TransactionFormValues) {
    const payload = {
      ...values,
      date: new Date(values.date).toISOString(),
    };

    fetch("http://localhost:8080/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (res.ok) {
          refreshData();
          navigate("/");
        } else {
          console.error("Failed to save");
          alert("Error saving transaction");
        }
      })
      .catch((error) => console.error(error));
  }

  return (
    <DashboardLayout
      onRefresh={refreshData}
      isLoading={loading}
      hideValues={hideValues}
      onToggleHideValues={toggleHideValues}
    >
      <div className="py-10">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>New Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionFormFields
              onSubmit={onSubmit}
              onCancel={() => navigate("/")}
              submitLabel="Save Transaction"
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

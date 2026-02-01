import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { TransactionForm } from "@/components/organisms/TransactionForm";

export default function AddTransactionPage() {
  // We reuse the DashboardLayout to keep the Header/Navigation consistent
  return (
    <DashboardLayout
      onRefresh={() => {}} // No refresh action needed on the form page
      isLoading={false}
    >
      <div className="py-10">
        <TransactionForm />
      </div>
    </DashboardLayout>
  );
}

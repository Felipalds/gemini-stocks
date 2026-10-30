import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import DashboardPage from "@/pages/Dashboard";
import AddTransactionPage from "@/pages/AddTransaction";
import ExpensesPage from "@/pages/Expenses";
import DividendsPage from "@/pages/Dividends";
import QAPage from "@/pages/QA";
import SettingsPage from "@/pages/Settings";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          {/* Same dashboard; the :symbol param just drives which ticker's
              detail dialog is open, so the URL reflects the opened square. */}
          <Route path="/ticker/:symbol" element={<DashboardPage />} />
          <Route path="/add" element={<AddTransactionPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/dividends" element={<DividendsPage />} />
          <Route path="/qa" element={<QAPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <Toaster />
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;

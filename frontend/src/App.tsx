import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import DashboardPage from "@/pages/Dashboard";
import AddTransactionPage from "@/pages/AddTransaction";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/add" element={<AddTransactionPage />} />
        </Routes>
        <Toaster />
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;

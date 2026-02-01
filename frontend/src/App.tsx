import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "@/pages/Dashboard";
import AddTransactionPage from "@/pages/AddTransaction"; // We will create this next
import { Toaster } from "@/components/ui/sonner"; // <--- CHANGED THIS IMPORT

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/add" element={<AddTransactionPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;

import { Toaster } from "@/components/safe-ui/toaster";
import { Toaster as Sonner } from "@/components/safe-ui/sonner";
import { TooltipProvider } from "@/components/safe-ui/tooltip";
import { QueryClient } from "@tanstack/query-core";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AccessModeProvider } from "@/contexts/AccessModeContext";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import PageBackground from "@/components/ui/PageBackground";
import FinancialDurabilityNotifier from "@/components/ui/FinancialDurabilityNotifier";

import Homepage from "./pages/Homepage";
import { DevAdminRoute, NormalAdminRoute } from "./pages/AdminModeRoutes";
import StudentDashboard from "./pages/StudentDashboard";
import StudentsSystem from "./pages/StudentsSystem";
import StudentsViewSystem from "./pages/StudentsViewSystem";
import NotFound from "./pages/NotFound";
import Metronome from "./pages/Metronome";

const queryClient = new QueryClient();

const AppContent = () => {
  useVersionCheck();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <Sonner />
      <FinancialDurabilityNotifier />

      <BrowserRouter>
        <PageBackground />
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/admin" element={<NormalAdminRoute />} />
          <Route path="/dev-admin" element={<DevAdminRoute />} />
          <Route path="/student/:studentId" element={<StudentDashboard />} />
          <Route path="/students-system" element={<StudentsSystem />} />
          <Route path="/students-view" element={<StudentsViewSystem />} />
          <Route path="/metronome" element={<Metronome />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AccessModeProvider>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </AccessModeProvider>
  </QueryClientProvider>
);

export default App;

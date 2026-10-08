import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Eventi from "./pages/Eventi.tsx";
import EventoIscrizione from "./pages/EventoIscrizione.tsx";
import Community from "./pages/Community.tsx";
import Contatti from "./pages/Contatti.tsx";
import Articoli from "./pages/Articoli.tsx";
import QuandoAutoEpoca from "./pages/QuandoAutoEpoca.tsx";
import Gallery from "./pages/Gallery.tsx";
import ChiSiamo from "./pages/ChiSiamo.tsx";
import Associazione from "./pages/Associazione.tsx";
import Adesione from "./pages/Adesione.tsx";
import AdminDashboard from "./pages/AdminDashboard.tsx";
import AdminEventEditor from "./pages/AdminEventEditor.tsx";
import AdminArticleEditor from "./pages/AdminArticleEditor.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import UserProtectedRoute from "./components/UserProtectedRoute.tsx";
import Auth from "./pages/Auth.tsx";
import Account from "./pages/Account.tsx";
import NotFound from "./pages/NotFound.tsx";
import ScrollToTop from "./components/ScrollToTop.tsx";
import { Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/use-auth.ts";
import { TreasuryGuard } from "./components/treasury/TreasuryLayout.tsx";
import TreasuryDashboard from "./pages/treasury/TreasuryDashboard.tsx";
import Movements from "./pages/treasury/Movements.tsx";
import MovementForm from "./pages/treasury/MovementForm.tsx";
import MovementDetail from "./pages/treasury/MovementDetail.tsx";
import QuoteYear from "./pages/treasury/QuoteYear.tsx";
import MemberDetail from "./pages/treasury/MemberDetail";
import MemberForm from "./pages/treasury/MemberForm.tsx";
import FeeSettings from "./pages/treasury/FeeSettings.tsx";
import BudgetYear from "./pages/treasury/BudgetYear.tsx";
import ReportYear from "./pages/treasury/ReportYear.tsx";
import Documents from "./pages/treasury/Documents.tsx";
import DocumentDetail from "./pages/treasury/DocumentDetail.tsx";
import Audit from "./pages/treasury/Audit.tsx";
import { Years, YearDetail } from "./pages/treasury/Years.tsx";
import YearPicker from "./components/treasury/YearPicker.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/chi-siamo" element={<ChiSiamo />} />
           <Route path="/associazione" element={<Associazione />} />
           <Route path="/associazione/iscrizione" element={<Adesione />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/eventi" element={<Eventi />} />
          <Route path="/eventi/:id/iscrizione" element={<EventoIscrizione />} />
          <Route path="/community" element={<Community />} />
          <Route path="/contatti" element={<Contatti />} />
          <Route path="/articoli" element={<Articoli />} />
          <Route path="/articoli/quando-auto-diventa-epoca" element={<QuandoAutoEpoca />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/account"
            element={
              <UserProtectedRoute>
                <Account />
              </UserProtectedRoute>
            }
          />
          <Route path="/admin/login" element={<Navigate to="/auth?next=/admin" replace />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/eventi/:id"
            element={
              <ProtectedRoute adminOnly>
                <AdminEventEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/articoli/:id"
            element={
              <ProtectedRoute adminOnly>
                <AdminArticleEditor />
              </ProtectedRoute>
            }
          />
          <Route path="/tesoreria" element={<TreasuryGuard />}>
            <Route index element={<TreasuryDashboard />} />
            <Route path="movimenti" element={<Movements />} />
            <Route path="movimenti/nuovo" element={<MovementForm />} />
            <Route path="movimenti/:id" element={<MovementDetail />} />
            <Route path="movimenti/:id/modifica" element={<MovementForm key="edit" />} />
            <Route path="quote" element={<YearPicker section="quote" title="Quote soci" />} />
            <Route path="quote/:anno" element={<QuoteYear />} />
            <Route path="quote/:anno/impostazioni" element={<FeeSettings />} />
            <Route path="quote/:anno/soci/:id" element={<MemberForm />} />
            <Route path="quote/:anno/socio/:id" element={<MemberDetail />} />
            <Route path="budget" element={<YearPicker section="budget" title="Budget" />} />
            <Route path="budget/:anno" element={<BudgetYear />} />
            <Route path="rendiconto" element={<YearPicker section="rendiconto" title="Rendiconto" />} />
            <Route path="rendiconto/:anno" element={<ReportYear />} />
            <Route path="documenti" element={<Documents />} />
            <Route path="documenti/:id" element={<DocumentDetail />} />
            <Route path="audit" element={<Audit />} />
            <Route path="esercizi" element={<Years />} />
            <Route path="esercizi/:anno" element={<YearDetail />} />
            <Route path="*" element={<NotFound />} />
          </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

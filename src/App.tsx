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
import Gallery from "./pages/Gallery.tsx";
import ChiSiamo from "./pages/ChiSiamo.tsx";
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
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/eventi" element={<Eventi />} />
          <Route path="/eventi/:id/iscrizione" element={<EventoIscrizione />} />
          <Route path="/community" element={<Community />} />
          <Route path="/contatti" element={<Contatti />} />
          <Route path="/articoli" element={<Articoli />} />
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
              <ProtectedRoute>
                <AdminEventEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/articoli/:id"
            element={
              <ProtectedRoute>
                <AdminArticleEditor />
              </ProtectedRoute>
            }
          />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

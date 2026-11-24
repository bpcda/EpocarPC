import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Shooting from "./pages/Shooting";
import Eventi from "./pages/Eventi.tsx";
import EventoIscrizione from "./pages/EventoIscrizione.tsx";
import Community from "./pages/Community.tsx";
import PrivacyAccount from "./pages/PrivacyAccount";
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
import ShootingFieldSheet from "./pages/ShootingFieldSheet";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import UserProtectedRoute from "./components/UserProtectedRoute.tsx";
import Auth from "./pages/Auth.tsx";
import Account from "./pages/Account.tsx";
import NotFound from "./pages/NotFound.tsx";
import CmsPage from "./pages/CmsPage.tsx";
import { NewsList, NewsDetail } from "./pages/News.tsx";
import Faq from "./pages/Faq.tsx";
import Novita, { futureFeatures, InCostruzione } from "./pages/Novita.tsx";
import VerificaTessera from "./pages/VerificaTessera.tsx";
import GestioneTessere from "./pages/GestioneTessere.tsx";
import Consiglio from "./pages/Consiglio.tsx";
import ScrollToTop from "./components/ScrollToTop.tsx";
import { Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/use-auth.ts";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { publicAnalyticsEvent } from "./lib/analytics";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          {import.meta.env.PROD && <>
            <Analytics beforeSend={publicAnalyticsEvent} />
            <SpeedInsights beforeSend={publicAnalyticsEvent} />
          </>}
          <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/chi-siamo" element={<ChiSiamo />} />
           <Route path="/associazione" element={<Associazione />} />
           <Route path="/associazione/iscrizione" element={<Adesione />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/natale-su-ruote/shooting" element={<Shooting />} />
          <Route path="/natale-su-ruote/shooting/richiesta" element={<UserProtectedRoute><Shooting booking /></UserProtectedRoute>} />
          <Route path="/eventi" element={<Eventi />} />
          <Route path="/eventi/:id/iscrizione" element={<EventoIscrizione />} />
          <Route path="/community" element={<Community />} />
          <Route path="/novita" element={<Novita />} />
          <Route path="/verifica-tessera" element={<VerificaTessera />} />
          <Route path="/gestione-tessere" element={<UserProtectedRoute><GestioneTessere /></UserProtectedRoute>} />
          {futureFeatures.map(feature => <Route key={feature.path} path={feature.path} element={<InCostruzione feature={feature} />} />)}
          <Route path="/privacy-account" element={<PrivacyAccount />} />
          <Route path="/contatti" element={<Contatti />} />
          <Route path="/articoli" element={<Navigate to="/news" replace />} />
          <Route path="/articoli/quando-auto-diventa-epoca" element={<QuandoAutoEpoca />} />
          <Route path="/articoli/:id" element={<Articoli />} />
          <Route path="/news" element={<NewsList />} />
          <Route path="/news/:slug" element={<NewsDetail />} />
          <Route path="/pagine/:slug" element={<CmsPage />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/consiglio-direttivo" element={<Consiglio />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/account"
            element={
              <UserProtectedRoute>
                <Account />
              </UserProtectedRoute>
            }
          />
          <Route path="/admin/shooting/:day/foglio-fotografo" element={<ProtectedRoute adminOnly><ShootingFieldSheet /></ProtectedRoute>} />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

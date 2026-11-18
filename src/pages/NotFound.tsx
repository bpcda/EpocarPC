import { Link, useLocation } from "react-router-dom";
import PageMeta from "@/components/PageMeta";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  return (
    <>
      <PageMeta
        title="Pagina non trovata — Epocar"
        description="La pagina che stai cercando non esiste o è stata spostata. Torna alla home di Epocar per esplorare eventi, news e gallery."
        path={location.pathname}
        noIndex
      />
      <Navbar />
      <main className="min-h-[75vh] flex items-center pt-32 pb-16 lg:pt-40 lg:pb-24">
        <div className="max-w-7xl w-full mx-auto px-6 lg:px-8">
          <p className="font-headline text-7xl lg:text-9xl text-foreground/30 mb-4">404</p>
          <h1 className="font-headline text-4xl sm:text-6xl lg:text-7xl tracking-wide leading-tight mb-5">Pagina non trovata</h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-lg mb-8">Il collegamento potrebbe essere cambiato oppure la pagina non è più disponibile. Puoi ripartire dalla home o scoprire i prossimi incontri.</p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-5">
            <Button size="lg" className="min-h-12" asChild><Link to="/"><ArrowLeft aria-hidden="true" /> Torna alla home</Link></Button>
            <Button variant="outline" size="lg" className="min-h-12" asChild><Link to="/eventi">Scopri gli eventi <ArrowUpRight aria-hidden="true" /></Link></Button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default NotFound;

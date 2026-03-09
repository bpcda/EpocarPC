import { Link } from "react-router-dom";
import logoEpocar from "@/assets/logo-epocar.png";

export default function Footer() {
  return (
    <footer className="bg-foreground text-primary-foreground">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <img src={logoEpocar} alt="Epocar" className="h-12 w-auto brightness-0 invert mb-4" />
            <p className="text-sm text-primary-foreground/60 max-w-sm leading-relaxed">
              La nuova generazione degli appassionati di motori storici. Una community che unisce persone attraverso la passione per auto d'epoca, moto storiche e Vespa.
            </p>
            <p className="text-sm text-primary-foreground/40 mt-3">📍 Piacenza, Italia</p>
          </div>
          <div>
            <h4 className="font-headline text-xl tracking-wider mb-4">NAVIGAZIONE</h4>
            <div className="flex flex-col gap-2">
              <Link to="/" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">Home</Link>
              <Link to="/#chi-siamo" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">Chi Siamo</Link>
              <Link to="/eventi" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">Eventi</Link>
              <Link to="/articoli" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">Articoli</Link>
              <Link to="/community" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">Community</Link>
              <Link to="/contatti" className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">Contatti</Link>
            </div>
          </div>
          <div>
            <h4 className="font-headline text-xl tracking-wider mb-4">CONTATTI</h4>
            <p className="text-sm text-primary-foreground/60">Piacenza, Italia</p>
            <p className="text-sm text-primary-foreground/60 mt-1">info@epocar.it</p>
            <div className="flex gap-4 mt-6">
              <a
                href="https://instagram.com/epocar.official"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors"
              >
                Instagram
              </a>
              <a
                href="https://tiktok.com/@epocar"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors"
              >
                TikTok
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-primary-foreground/20 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-primary-foreground/40">© {new Date().getFullYear()} Epocar. Tutti i diritti riservati.</p>
          <p className="text-xs text-primary-foreground/40">Piacenza, Italia — La community dei motori storici</p>
        </div>
      </div>
    </footer>
  );
}

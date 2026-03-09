import { Link } from "react-router-dom";
import logoEpocar from "@/assets/logo-epocar.png";

export default function Footer() {
  return (
    <footer className="bg-foreground text-background">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <img src={logoEpocar} alt="Epocar" className="h-12 w-auto brightness-0 invert mb-4" />
            <p className="text-sm text-background/60 max-w-xs">
              La nuova generazione degli appassionati di motori storici. Piacenza, Italia.
            </p>
          </div>
          <div>
            <h4 className="font-headline text-lg mb-4">Navigazione</h4>
            <div className="flex flex-col gap-2">
              <Link to="/" className="text-sm text-background/60 hover:text-background transition-colors">Home</Link>
              <Link to="/eventi" className="text-sm text-background/60 hover:text-background transition-colors">Eventi</Link>
              <Link to="/rubricar" className="text-sm text-background/60 hover:text-background transition-colors">Rubricar</Link>
              <Link to="/community" className="text-sm text-background/60 hover:text-background transition-colors">Community</Link>
              <Link to="/contatti" className="text-sm text-background/60 hover:text-background transition-colors">Contatti</Link>
            </div>
          </div>
          <div>
            <h4 className="font-headline text-lg mb-4">Contatti</h4>
            <p className="text-sm text-background/60">Piacenza, Italia</p>
            <p className="text-sm text-background/60 mt-1">info@epocar.it</p>
            <div className="flex gap-4 mt-4">
              <a href="https://instagram.com/epocar" target="_blank" rel="noopener noreferrer" className="text-sm text-background/60 hover:text-background transition-colors">
                Instagram
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-background/20 mt-12 pt-8 text-center">
          <p className="text-xs text-background/40">© {new Date().getFullYear()} Epocar. Tutti i diritti riservati.</p>
        </div>
      </div>
    </footer>
  );
}

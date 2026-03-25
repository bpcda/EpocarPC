import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import logoEpocar from "@/assets/logo-epocar.png";

const navLinks = [
  { label: "Chi Siamo", href: "/chi-siamo" },
  { label: "Eventi", href: "/eventi" },
  { label: "Articoli", href: "/articoli" },
  { label: "Gallery", href: "/gallery" },
  { label: "Contatti", href: "/contatti" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-foreground/95 backdrop-blur-sm border-b border-primary-foreground/10"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16 lg:h-20">
        <Link to="/" className="flex items-center gap-3">
          <img src={logoEpocar} alt="Epocar" className="h-10 lg:h-12 w-auto brightness-0 invert" />
        </Link>

        {/* Desktop nav - bordered boxes */}
        <div className="hidden md:flex items-center gap-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="font-headline text-sm tracking-[0.15em] text-primary-foreground border border-primary-foreground/40 px-5 py-2 hover:bg-primary-foreground/10 transition-colors duration-200"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          <span className={`block w-6 h-0.5 bg-primary-foreground transition-transform duration-200 ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-6 h-0.5 bg-primary-foreground transition-opacity duration-200 ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`block w-6 h-0.5 bg-primary-foreground transition-transform duration-200 ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-foreground border-b border-primary-foreground/10">
          <div className="px-6 py-4 flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="font-headline text-base tracking-[0.15em] text-primary-foreground border border-primary-foreground/30 px-5 py-3 text-center hover:bg-primary-foreground/10 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

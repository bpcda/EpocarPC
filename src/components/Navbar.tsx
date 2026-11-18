import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import logoEpocar from "@/assets/logo-epocar.png";
import { useAuth } from "@/hooks/use-auth";
import { User as UserIcon, LayoutDashboard } from "lucide-react";

const navLinks = [
  { label: "Chi Siamo", href: "/chi-siamo" },
   { label: "Associazione", href: "/associazione" },
  { label: "Eventi", href: "/eventi" },
  { label: "News", href: "/news" },
  { label: "Gallery", href: "/gallery" },
  { label: "Contatti", href: "/contatti" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const { user, canAccessDashboard } = useAuth();
  const isHome = location.pathname === "/";
  const solid = !isHome || scrolled;
  const activePath = location.pathname.startsWith("/articoli/") ? "/news" : location.pathname;
  const currentSection = navLinks.find(link => activePath === link.href || activePath.startsWith(`${link.href}/`))?.href;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <nav
      aria-label="Navigazione principale"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        solid
          ? "bg-foreground/95 backdrop-blur-sm border-b border-primary-foreground/10"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16 lg:h-20">
        <Link to="/" className="flex items-center gap-3">
          <img src={logoEpocar} alt="Epocar — Community motori storici" className="h-10 lg:h-12 w-auto brightness-0 invert" />
        </Link>

        {/* Desktop nav - bordered boxes */}
        <div className="hidden xl:flex items-center gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              aria-current={currentSection === link.href ? "page" : undefined}
              className={`inline-flex items-center min-h-11 font-headline text-sm tracking-[0.15em] text-primary-foreground border border-primary-foreground/40 px-5 py-2 hover:bg-primary-foreground/10 transition-colors duration-200 motion-reduce:transition-none ${currentSection === link.href ? "bg-primary-foreground/15 border-primary-foreground" : ""}`}
            >
              {link.label}
            </Link>
          ))}
          {user && canAccessDashboard && (
            <Link
              to="/admin"
              className="min-h-11 font-headline text-sm tracking-[0.15em] text-primary-foreground border border-primary-foreground/40 px-5 py-2 hover:bg-primary-foreground/10 transition-colors duration-200 flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Link>
          )}
          <Link
            to={user ? "/account" : "/auth"}
            className="min-h-11 font-headline text-sm tracking-[0.15em] text-foreground bg-primary-foreground border border-primary-foreground px-5 py-2 hover:bg-primary-foreground/90 transition-colors duration-200 flex items-center gap-2"
          >
            <UserIcon className="w-4 h-4" />
            {user ? "Account" : "Accedi"}
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          ref={menuButton}
          type="button"
          className="xl:hidden flex flex-col items-center justify-center min-h-11 min-w-11 gap-1.5 p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          <span className={`block w-6 h-0.5 bg-primary-foreground transition-transform duration-200 ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-6 h-0.5 bg-primary-foreground transition-opacity duration-200 ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`block w-6 h-0.5 bg-primary-foreground transition-transform duration-200 ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div id="mobile-navigation" className="xl:hidden bg-foreground border-b border-primary-foreground/10 max-h-[calc(100dvh-80px)] overflow-y-auto">
          <div className="px-6 py-4 flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                aria-current={currentSection === link.href ? "page" : undefined}
                className={`font-headline text-base tracking-[0.15em] text-primary-foreground border border-primary-foreground/30 px-5 py-3 text-center hover:bg-primary-foreground/10 transition-colors motion-reduce:transition-none ${currentSection === link.href ? "bg-primary-foreground/15 border-primary-foreground" : ""}`}
              >
                {link.label}
              </Link>
            ))}
            {user && canAccessDashboard && (
              <Link
                to="/admin"
                className="font-headline text-base tracking-[0.15em] text-primary-foreground border border-primary-foreground/30 px-5 py-3 text-center hover:bg-primary-foreground/10 transition-colors"
              >
                Dashboard
              </Link>
            )}
            <Link
              to={user ? "/account" : "/auth"}
              className="font-headline text-base tracking-[0.15em] text-foreground bg-primary-foreground border border-primary-foreground px-5 py-3 text-center transition-colors"
            >
              {user ? "Account" : "Accedi"}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

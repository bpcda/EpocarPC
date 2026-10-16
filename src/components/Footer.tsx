import { Link } from "react-router-dom";
import logoEpocar from "@/assets/logo-epocar.png";
import { useSiteSettings } from "@/hooks/use-cms";
import { SmartLink } from "@/components/cms/CmsContent";

const FALLBACK = {
  text: "La nuova generazione degli appassionati di motori storici. Una community che unisce persone attraverso la passione per auto d'epoca, moto storiche e Vespa.",
  address: "Piacenza, Italia",
  email: "epocarpc@gmail.com",
  social: [
    { label: "Instagram", url: "https://instagram.com/epocar.official" },
    { label: "TikTok", url: "https://tiktok.com/@epocar" },
  ],
};

const linkCls = "text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors";

export default function Footer() {
  const { data: s } = useSiteSettings();
  const address = s?.address ?? FALLBACK.address;
  const email = s?.email ?? FALLBACK.email;
  const social = s?.social.length ? s.social : FALLBACK.social;
  return (
    <footer className="bg-foreground text-primary-foreground">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <img src={s?.logo?.url ?? logoEpocar} alt={s?.siteName ?? "Epocar"} className="h-12 w-auto brightness-0 invert mb-4" />
            <p className="text-sm text-primary-foreground/60 max-w-sm leading-relaxed">{s?.footerText ?? FALLBACK.text}</p>
            <p className="text-sm text-primary-foreground/40 mt-3">📍 {address}</p>
          </div>
          <div>
            <h4 className="font-headline text-xl tracking-wider mb-4">NAVIGAZIONE</h4>
            <div className="flex flex-col gap-2">
              <Link to="/" className={linkCls}>Home</Link>
              <Link to="/chi-siamo" className={linkCls}>Chi Siamo</Link>
              <Link to="/associazione" className={linkCls}>Associazione</Link>
              <Link to="/associazione/iscrizione" className={linkCls}>Diventa socio</Link>
              <Link to="/eventi" className={linkCls}>Eventi</Link>
              <Link to="/articoli" className={linkCls}>Articoli</Link>
              <Link to="/community" className={linkCls}>Community</Link>
              <Link to="/contatti" className={linkCls}>Contatti</Link>
            </div>
          </div>
          <div>
            <h4 className="font-headline text-xl tracking-wider mb-4">CONTATTI</h4>
            <p className="text-sm text-primary-foreground/60">{address}</p>
            <p className="text-sm text-primary-foreground/60 mt-1">{email}</p>
            {s?.phone && <p className="text-sm text-primary-foreground/60 mt-1">{s.phone}</p>}
            <div className="flex gap-4 mt-6 flex-wrap">
              {social.map((l) => <SmartLink key={l.url} href={l.url} className={linkCls}>{l.label}</SmartLink>)}
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

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useHomepage } from "@/hooks/use-cms";
import { useAuth } from "@/hooks/use-auth";
import { RichTextView } from "@/components/cms/CmsContent";

const APPLY = "/associazione/iscrizione";

/** Homepage banner "Iscrizioni aperte". Text is editable in the CMS (Homepage → membership*); fallback below. */
export default function MembershipCtaSection() {
  const { data: home } = useHomepage();
  const { user } = useAuth();
  if (home && !home.membershipOpen) return null;

  const href = user ? APPLY : `/auth?next=${encodeURIComponent(APPLY)}`;
  const hasCmsText = !!home?.membershipText?.length;

  return (
    <section className="bg-primary text-primary-foreground border-y-2 border-primary-foreground/20">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-xs font-body font-medium tracking-widest uppercase text-primary-foreground/60 mb-2">Associazione Epocar</p>
          <h2 className="font-headline text-3xl md:text-5xl tracking-wider leading-none mb-4">
            {home?.membershipTitle ?? "ISCRIZIONI APERTE: DIVENTA SOCIO"}
          </h2>
          <div className="text-sm md:text-base text-primary-foreground/80 space-y-2 max-w-3xl">
            {hasCmsText ? (
              <RichTextView value={home!.membershipText} />
            ) : (
              <>
                <p>Crea il tuo account sul sito e compila la domanda di ammissione online.</p>
                <p>La quota associativa vale solo per l'anno sociale in corso, fino al 31 dicembre 2026. Dall'anno successivo, per restare socio, la quota va versata nuovamente, nei limiti e alle condizioni previste dallo statuto.</p>
                <p>Il pagamento avverrà tramite bonifico bancario: le coordinate saranno comunicate a breve.</p>
              </>
            )}
          </div>
        </div>
        <Button variant="hero-secondary" asChild>
          <Link to={href}>{home?.membershipButtonLabel ?? (user ? "Compila la domanda" : "Registrati e diventa socio")}</Link>
        </Button>
      </div>
    </section>
  );
}

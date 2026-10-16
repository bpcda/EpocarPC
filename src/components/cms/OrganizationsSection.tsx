import { useHomepage, usePartners, useSponsors } from "@/hooks/use-cms";
import { CmsImg, SmartLink } from "./CmsContent";
import type { Organization } from "@/lib/cms";

function Row({ title, items }: { title: string; items: Organization[] }) {
  return (
    <div>
      <h2 className="font-headline text-4xl md:text-5xl tracking-wider text-foreground mb-8">{title}</h2>
      <ul className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.map((o) => {
          const inner = o.logo ? <CmsImg image={{ ...o.logo, alt: o.logo.alt || o.name }} className="max-h-16 w-auto mx-auto object-contain" sizes="160px" />
            : <span className="font-headline text-xl tracking-wide text-foreground">{o.name}</span>;
          return (
            <li key={o.name} className="border-2 border-foreground/20 p-4 flex items-center justify-center min-h-24 text-center">
              {o.website ? <SmartLink href={o.website}>{inner}</SmartLink> : inner}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Renders nothing unless the CMS has active sponsors/partners (keeps the homepage light). */
export default function OrganizationsSection() {
  const { data: home } = useHomepage();
  const { data: sponsors = [] } = useSponsors();
  const { data: partners = [] } = usePartners();
  const s = home?.showSponsors === false ? [] : sponsors;
  const p = home?.showPartners === false ? [] : partners;
  if (!s.length && !p.length) return null;
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 space-y-16">
        {s.length > 0 && <Row title="SPONSOR" items={s} />}
        {p.length > 0 && <Row title="PARTNER" items={p} />}
      </div>
    </section>
  );
}

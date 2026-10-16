import { Link } from "react-router-dom";
import { useHomepage, useNewsList } from "@/hooks/use-cms";
import { CmsImg } from "./CmsContent";

/** Up to 3 news flagged "in evidenza"; hidden when none exist. */
export default function FeaturedNewsSection() {
  const { data: home } = useHomepage();
  const { data = [] } = useNewsList();
  const items = data.filter((n) => n.featured).slice(0, 3);
  if (home?.showNews === false || items.length === 0) return null;
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <h2 className="font-headline text-5xl md:text-6xl tracking-wider text-foreground">NEWS</h2>
          <Link to="/news" className="text-sm uppercase tracking-widest text-foreground hover:underline">Tutte →</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((n) => (
            <Link key={n.slug} to={`/news/${n.slug}`} className="block border-2 border-foreground group">
              {n.cover && <CmsImg image={n.cover} className="w-full aspect-[4/3] object-cover" sizes="(min-width: 768px) 33vw, 100vw" />}
              <h3 className="font-headline text-2xl tracking-wide text-foreground p-4 group-hover:underline">{n.title}</h3>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

import { Link, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import NotFound from "./NotFound";
import { useNews, useNewsList } from "@/hooks/use-cms";
import { BlockRenderer, CmsImg } from "@/components/cms/CmsContent";

const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }) : "");

export function NewsList() {
  const { data = [], isLoading } = useNewsList();
  return (
    <>
      <PageMeta title="News — Epocar" description="Le ultime notizie dalla community Epocar di Piacenza." path="/news" />
      <Navbar />
      <main className="pt-28 pb-24 min-h-screen">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <h1 className="font-headline text-6xl md:text-8xl tracking-wider text-foreground leading-none mb-12">NEWS</h1>
          {isLoading ? <p role="status" className="text-muted-foreground">Caricamento…</p>
            : data.length === 0 ? <p className="text-muted-foreground">Nessuna notizia pubblicata al momento.</p>
            : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {data.map((n) => (
                  <Link key={n.slug} to={`/news/${n.slug}`} className="group block border-2 border-foreground">
                    {n.cover && <CmsImg image={n.cover} className="w-full aspect-[4/3] object-cover" sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" />}
                    <div className="p-5">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{fmt(n.date)}</p>
                      <h2 className="font-headline text-3xl tracking-wide text-foreground group-hover:underline">{n.title}</h2>
                      {n.excerpt && <p className="text-sm text-foreground/75 mt-2">{n.excerpt}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
        </div>
      </main>
      <Footer />
    </>
  );
}

export function NewsDetail() {
  const { slug = "" } = useParams();
  const { data: n, isLoading } = useNews(slug);
  if (isLoading) return <><Navbar /><main className="min-h-screen pt-32 px-6"><p role="status" className="max-w-4xl mx-auto text-muted-foreground">Caricamento…</p></main></>;
  if (!n) return <NotFound />;
  return (
    <>
      <PageMeta title={`${n.seo.title ?? n.title} — Epocar`} description={n.seo.description ?? n.excerpt ?? ""} path={`/news/${n.slug}`} image={n.seo.image?.url ?? n.cover?.url} />
      <Navbar />
      <main className="pt-28 pb-24">
        <article className="max-w-4xl mx-auto px-6 lg:px-8">
          <Link to="/news" className="text-sm uppercase tracking-widest text-muted-foreground hover:text-foreground">← Tutte le news</Link>
          <h1 className="font-headline text-5xl md:text-7xl tracking-wider text-foreground leading-none mt-4 mb-3">{n.title}</h1>
          <p className="text-sm text-muted-foreground mb-8">{fmt(n.date)}{n.author ? ` · ${n.author}` : ""}</p>
          {n.cover && <CmsImg image={n.cover} eager className="w-full h-auto mb-12" sizes="(min-width: 1024px) 896px, 100vw" />}
          <BlockRenderer blocks={n.blocks} />
          {n.gallery.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-12">
              {n.gallery.map((img, i) => <CmsImg key={i} image={img} className="w-full aspect-square object-cover" sizes="(min-width: 768px) 33vw, 50vw" />)}
            </div>
          )}
        </article>
      </main>
      <Footer />
    </>
  );
}

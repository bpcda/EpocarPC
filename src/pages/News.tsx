import { Link, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import NotFound from "./NotFound";
import { useNews, useNewsList } from "@/hooks/use-cms";
import { BlockRenderer, CmsImg } from "@/components/cms/CmsContent";
import { useArticles } from "@/hooks/use-articles";
import { articleDate } from "@/lib/article-publication";

const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }) : "");

export function NewsList() {
  const cms = useNewsList();
  const archive = useArticles();
  const items = [
    ...(cms.data ?? []).map(n => ({ href: `/news/${n.slug}`, title: n.title, excerpt: n.excerpt, date: n.date, image: n.cover })),
    ...(archive.data ?? []).map(n => ({ href: `/articoli/${n.id}`, title: n.title, excerpt: n.summary, date: articleDate(n), image: n.image_url ? { url: n.image_url, alt: n.title } : undefined })),
  ].sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0));
  const isLoading = (cms.isLoading || archive.isLoading) && items.length === 0;
  return (
    <>
      <PageMeta title="News — Epocar" description="Le ultime notizie dalla community Epocar di Piacenza." path="/news" />
      <Navbar />
      <main className="bg-background text-foreground pt-32 pb-16 lg:pt-40 lg:pb-24 min-h-screen">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] mb-6">Dalla community Epocar</p>
          <h1 className="font-headline text-6xl md:text-8xl tracking-wider leading-none mb-6">NEWS</h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed mb-12">Storie, incontri e curiosità dal mondo dei motori storici.</p>
          {(cms.isError || archive.isError) && <p role="alert" className="mb-8">Alcune notizie non sono disponibili. Riprova tra poco.</p>}
          {isLoading ? <p role="status" className="text-muted-foreground">Caricamento…</p>
            : items.length === 0 ? !(cms.isError || archive.isError) && <p className="text-muted-foreground">Nessuna notizia pubblicata al momento.</p>
            : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {items.map((n) => (
                  <Link key={n.href} to={n.href} className="group block border-t border-border pt-5">
                    <div className="aspect-[4/3] bg-secondary overflow-hidden">
                      {n.image && <CmsImg image={n.image} className="w-full h-full object-contain transition-transform duration-300 motion-reduce:transition-none group-hover:scale-[1.02]" sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" />}
                    </div>
                    <div className="pt-5">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{fmt(n.date)}</p>
                      <h2 className="font-headline text-3xl tracking-wide leading-tight group-hover:underline">{n.title}</h2>
                      {n.excerpt && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mt-3">{n.excerpt}</p>}
                      <span className="inline-block text-sm underline underline-offset-4 mt-4">Leggi la notizia <span aria-hidden="true">↗</span></span>
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
      <main className="bg-background text-foreground pt-32 pb-16 lg:pt-40 lg:pb-24">
        <article className="max-w-3xl mx-auto px-6 lg:px-8">
          <Link to="/news" className="inline-flex items-center min-h-11 text-sm underline underline-offset-4">← Tutte le news</Link>
          <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl tracking-wide leading-tight break-words mt-6 mb-4">{n.title}</h1>
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

import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import NotFound from "./NotFound";
import { useCmsPage } from "@/hooks/use-cms";
import { BlockRenderer, CmsImg } from "@/components/cms/CmsContent";

export default function CmsPage() {
  const { slug = "" } = useParams();
  const { data: page, isLoading } = useCmsPage(slug);

  if (isLoading) return <><Navbar /><main className="min-h-screen pt-32 px-6"><p role="status" className="max-w-4xl mx-auto text-muted-foreground">Caricamento…</p></main></>;
  if (!page) return <NotFound />;

  return (
    <>
      <PageMeta title={`${page.seo.title ?? page.title} — Epocar`} description={page.seo.description ?? page.excerpt ?? ""} path={`/pagine/${page.slug}`} image={page.seo.image?.url ?? page.heroImage?.url} />
      <Navbar />
      <main className="pt-28 pb-24">
        <article className="max-w-4xl mx-auto px-6 lg:px-8">
          <h1 className="font-headline text-5xl md:text-7xl tracking-wider text-foreground leading-none mb-4">{page.title}</h1>
          {page.excerpt && <p className="text-lg text-muted-foreground mb-8">{page.excerpt}</p>}
          {page.heroImage && <CmsImg image={page.heroImage} eager className="w-full h-auto mb-12" sizes="(min-width: 1024px) 896px, 100vw" />}
          <BlockRenderer blocks={page.blocks} />
        </article>
      </main>
      <Footer />
    </>
  );
}

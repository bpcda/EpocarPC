import { Link, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { Button } from "@/components/ui/button";
import { useArticles } from "@/hooks/use-articles";
import NotFound from "./NotFound";

export default function Articoli() {
  const { id } = useParams();
  const { data = [], isLoading, isError, refetch } = useArticles(id);
  const article = data[0];
  if (!isLoading && !isError && !article) return <NotFound />;

  return (
    <>
      {article && <PageMeta title={`${article.title} — Epocar`} description={article.summary ?? "Notizie dalla community Epocar di Piacenza."} path={`/articoli/${article.id}`} image={article.image_url ?? undefined} />}
      <Navbar />
      <main className="bg-background text-foreground pt-32 pb-16 lg:pt-40 lg:pb-24 min-h-screen">
        <article className="max-w-3xl mx-auto px-6 lg:px-8">
          <Link to="/news" className="inline-flex items-center min-h-11 text-sm underline underline-offset-4 mb-8">← Tutte le news</Link>
          {isLoading ? <p role="status">Caricamento…</p>
            : isError ? <div role="alert"><p className="mb-4">Non riusciamo a caricare la notizia. Riprova tra poco.</p><Button onClick={() => refetch()}>Riprova</Button></div>
            : article && <>
              <time dateTime={article.created_at} className="block text-sm text-muted-foreground mb-4">
                {new Date(article.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" })}
              </time>
              <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl tracking-wide leading-tight break-words mb-6">{article.title}</h1>
              {article.summary && <p className="text-lg leading-relaxed text-foreground/80 mb-8">{article.summary}</p>}
              {article.image_url && <img src={article.image_url} alt={article.title} className="w-full max-h-[65vh] object-contain mb-10" />}
              {article.content && <div className="prose prose-lg max-w-none prose-headings:font-body prose-headings:font-medium prose-headings:leading-snug prose-h2:text-2xl prose-h3:text-xl prose-p:leading-relaxed prose-p:my-5 prose-a:text-foreground" dangerouslySetInnerHTML={{ __html: article.content }} />}
              <Link to="/news" className="inline-flex items-center min-h-11 text-sm underline underline-offset-4 mt-10">← Tutte le news</Link>
            </>}
        </article>
      </main>
      <Footer />
    </>
  );
}

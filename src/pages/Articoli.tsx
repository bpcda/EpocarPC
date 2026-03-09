import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Calendar } from "lucide-react";

interface Article {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  created_at: string;
}

export default function Articoli() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      const { data } = await supabase
        .from("articles")
        .select("*")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (data) setArticles(data);
      setLoading(false);
    };
    fetchArticles();
  }, []);

  if (selectedArticle) {
    return (
      <div className="min-h-screen bg-foreground">
        <Navbar />
        <main className="pt-32 pb-16">
          <article className="max-w-3xl mx-auto px-6">
            <button
              onClick={() => setSelectedArticle(null)}
              className="font-headline text-sm tracking-widest text-primary-foreground/50 hover:text-primary-foreground mb-8 inline-block transition-colors"
            >
              ← TORNA AGLI ARTICOLI
            </button>
            {selectedArticle.image_url && (
              <div className="aspect-video w-full overflow-hidden mb-8">
                <img
                  src={selectedArticle.image_url}
                  alt={selectedArticle.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-primary-foreground/50 mb-4">
              <Calendar className="h-4 w-4" />
              {new Date(selectedArticle.created_at).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
            <h1 className="font-headline text-4xl lg:text-6xl text-primary-foreground mb-6 leading-none tracking-wider">
              {selectedArticle.title.toUpperCase()}
            </h1>
            {selectedArticle.summary && (
              <p className="text-lg text-primary-foreground/70 mb-8 leading-relaxed">
                {selectedArticle.summary}
              </p>
            )}
            {selectedArticle.content && (
              <div className="text-primary-foreground/80 leading-relaxed whitespace-pre-wrap text-base">
                {selectedArticle.content}
              </div>
            )}
          </article>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-foreground">
      <Navbar />
      <main>
        <section className="pt-32 pb-24 lg:pt-40 lg:pb-32">
          <div className="max-w-7xl mx-auto px-6">
            <h1 className="font-headline text-6xl md:text-8xl lg:text-9xl text-primary-foreground leading-none tracking-wider mb-4">
              ARTICOLI
            </h1>
            <div className="w-24 h-0.5 bg-primary-foreground/30 mb-4" />
            <p className="text-primary-foreground/60 text-base mb-12 max-w-2xl">
              Storie, approfondimenti e curiosità dal mondo dei motori storici.
            </p>

            {loading ? (
              <p className="text-primary-foreground/50 text-center py-12">Caricamento...</p>
            ) : articles.length === 0 ? (
              <p className="text-primary-foreground/50 text-center py-12">
                Nessun articolo pubblicato al momento.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {articles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => setSelectedArticle(article)}
                    className="group text-left overflow-hidden"
                  >
                    {article.image_url ? (
                      <div className="aspect-video overflow-hidden">
                        <img
                          src={article.image_url}
                          alt={article.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-primary-foreground/5 flex items-center justify-center">
                        <span className="text-primary-foreground/30 text-sm">Nessuna immagine</span>
                      </div>
                    )}
                    <div className="py-4">
                      <div className="flex items-center gap-2 text-xs text-primary-foreground/40 mb-2">
                        <Calendar className="h-3 w-3" />
                        {new Date(article.created_at).toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <h2 className="font-headline text-xl text-primary-foreground tracking-wider group-hover:text-primary-foreground/80 transition-colors">
                        {article.title.toUpperCase()}
                      </h2>
                      {article.summary && (
                        <p className="text-sm text-primary-foreground/50 line-clamp-3 mt-2">
                          {article.summary}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

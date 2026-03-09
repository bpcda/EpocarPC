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
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-16">
          <article className="max-w-3xl mx-auto px-6">
            <button
              onClick={() => setSelectedArticle(null)}
              className="text-sm text-accent hover:underline mb-8 inline-block"
            >
              ← Torna agli articoli
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Calendar className="h-4 w-4" />
              {new Date(selectedArticle.created_at).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
            <h1 className="font-headline text-3xl lg:text-5xl text-foreground mb-6 leading-tight">
              {selectedArticle.title}
            </h1>
            {selectedArticle.summary && (
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                {selectedArticle.summary}
              </p>
            )}
            {selectedArticle.content && (
              <div className="prose prose-lg max-w-none text-foreground/90 leading-relaxed whitespace-pre-wrap">
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
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <h1 className="font-headline text-4xl lg:text-6xl text-foreground mb-4">
            Articoli
          </h1>
          <p className="text-muted-foreground text-lg mb-12 max-w-2xl">
            Storie, approfondimenti e curiosità dal mondo dei motori storici.
          </p>

          {loading ? (
            <p className="text-muted-foreground text-center py-12">Caricamento...</p>
          ) : articles.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              Nessun articolo pubblicato al momento.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {articles.map((article) => (
                <button
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className="group text-left bg-card border border-border overflow-hidden hover:shadow-lg transition-all duration-300"
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
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      <span className="text-muted-foreground text-sm">Nessuna immagine</span>
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <Calendar className="h-3 w-3" />
                      {new Date(article.created_at).toLocaleDateString("it-IT", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                    <h2 className="font-headline text-xl text-foreground mb-2 group-hover:text-accent transition-colors">
                      {article.title}
                    </h2>
                    {article.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {article.summary}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

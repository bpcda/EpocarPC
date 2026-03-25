import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import RichTextEditor from "@/components/RichTextEditor";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, LogOut, Upload, X, Image as ImageIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import GalleryTab from "@/components/admin/GalleryTab";
import EventsTab from "@/components/admin/EventsTab";

interface Article {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  published: boolean | null;
  created_at: string;
}

const emptyArticleForm = {
  title: "",
  summary: "",
  content: "",
  image_url: "",
  published: false,
};

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Articles state
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleForm, setArticleForm] = useState(emptyArticleForm);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);


  const fetchArticles = async () => {
    try {
      const { data } = await supabase
        .from("articles")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setArticles(data);
    } catch {
      // Backend unavailable
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const removeImage = (formType: "event" | "article") => {
    setImageFile(null);
    setImagePreview(null);
    if (formType === "event") setEventForm({ ...eventForm, image_url: "" });
    else setArticleForm({ ...articleForm, image_url: "" });
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("event-images")
      .upload(fileName, file, { contentType: file.type });
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    const { data } = supabase.storage.from("event-images").getPublicUrl(fileName);
    return data.publicUrl;
  };

  // ── Articles CRUD ──
  const handleSaveArticle = async () => {
    setLoading(true);
    let imageUrl = articleForm.image_url || null;
    if (imageFile) {
      const uploaded = await uploadImage(imageFile);
      if (uploaded) imageUrl = uploaded;
    }
    const payload = {
      title: articleForm.title,
      summary: articleForm.summary || null,
      content: articleForm.content || null,
      image_url: imageUrl,
      published: articleForm.published,
      uploaded_by: user?.id || null,
    };
    if (editingArticleId) {
      await supabase.from("articles").update(payload).eq("id", editingArticleId);
    } else {
      await supabase.from("articles").insert(payload);
    }
    setArticleForm(emptyArticleForm);
    setEditingArticleId(null);
    setImageFile(null);
    setImagePreview(null);
    setArticleDialogOpen(false);
    setLoading(false);
    fetchArticles();
  };

  const handleEditArticle = (article: Article) => {
    setArticleForm({
      title: article.title,
      summary: article.summary || "",
      content: article.content || "",
      image_url: article.image_url || "",
      published: article.published ?? false,
    });
    setImageFile(null);
    setImagePreview(article.image_url || null);
    setEditingArticleId(article.id);
    setArticleDialogOpen(true);
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo articolo?")) return;
    await supabase.from("articles").delete().eq("id", id);
    fetchArticles();
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/admin/login");
  };

  const ImageUploadArea = ({ formType }: { formType: "event" | "article" }) => (
    <div>
      <label className="text-sm text-muted-foreground mb-2 block">Immagine</label>
      {imagePreview ? (
        <div className="relative rounded-md overflow-hidden border border-border">
          <img src={imagePreview} alt="Anteprima" className="w-full h-40 object-cover" />
          <button
            type="button"
            onClick={() => removeImage(formType)}
            className="absolute top-2 right-2 bg-foreground/70 text-background rounded-full p-1 hover:bg-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFileSelect(file);
            };
            input.click();
          }}
          className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            {dragging ? (
              <Upload className="h-8 w-8 text-accent" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {dragging ? "Rilascia qui" : "Trascina un'immagine o clicca per selezionare"}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-headline font-semibold text-foreground">
            Dashboard Epocar
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              Esci
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs defaultValue="events">
          <TabsList className="mb-6">
            <TabsTrigger value="events">Eventi</TabsTrigger>
            <TabsTrigger value="articles">Articoli</TabsTrigger>
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
          </TabsList>

          {/* ════════ EVENTS TAB ════════ */}
          <TabsContent value="events">
            <EventsTab user={user} />
          </TabsContent>

          {/* ════════ ARTICLES TAB ════════ */}
          <TabsContent value="articles">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-headline font-medium text-foreground">Articoli</h2>
              <Dialog
                open={articleDialogOpen}
                onOpenChange={(open) => {
                  setArticleDialogOpen(open);
                  if (!open) {
                    setArticleForm(emptyArticleForm);
                    setEditingArticleId(null);
                    setImageFile(null);
                    setImagePreview(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Nuovo articolo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
                  <DialogHeader>
                    <DialogTitle className="font-headline">
                      {editingArticleId ? "Modifica articolo" : "Nuovo articolo"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <Input
                      placeholder="Titolo *"
                      value={articleForm.title}
                      onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                    />
                    <Textarea
                      placeholder="Sommario (breve descrizione)"
                      value={articleForm.summary}
                      onChange={(e) => setArticleForm({ ...articleForm, summary: e.target.value })}
                      rows={2}
                    />
                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">Contenuto</label>
                      <RichTextEditor
                        content={articleForm.content}
                        onChange={(html) => setArticleForm({ ...articleForm, content: html })}
                      />
                    </div>
                    <ImageUploadArea formType="article" />
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={articleForm.published}
                        onCheckedChange={(checked) => setArticleForm({ ...articleForm, published: checked })}
                      />
                      <span className="text-sm text-muted-foreground">Pubblicato</span>
                    </div>
                    <Button className="w-full" onClick={handleSaveArticle} disabled={!articleForm.title || loading}>
                      {loading ? "Salvataggio..." : editingArticleId ? "Salva modifiche" : "Crea articolo"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {articles.length === 0 ? (
              <p className="text-muted-foreground text-sm py-12 text-center">
                Nessun articolo ancora. Clicca "Nuovo articolo" per iniziare.
              </p>
            ) : (
              <div className="border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titolo</TableHead>
                      <TableHead className="hidden md:table-cell">Data</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="w-24">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articles.map((article) => (
                      <TableRow key={article.id}>
                        <TableCell className="font-medium">{article.title}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {new Date(article.created_at).toLocaleDateString("it-IT", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-1 ${
                              article.published ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {article.published ? "Pubblicato" : "Bozza"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditArticle(article)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteArticle(article.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ════════ GALLERY TAB ════════ */}
          <TabsContent value="gallery">
            <GalleryTab userId={user?.id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

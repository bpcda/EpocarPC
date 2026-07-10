import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import GalleryTab from "@/components/admin/GalleryTab";
import RegistrationsTab from "@/components/admin/RegistrationsTab";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  location: string | null;
  image_url: string | null;
  category: string | null;
  published: boolean | null;
  created_at: string;
  registration_link: string | null;
}

interface Article {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  image_url: string | null;
  published: boolean | null;
  created_at: string;
}

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [events, setEvents] = useState<Event[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  const fetchEvents = async () => {
    try {
      const { data } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setEvents(data);
    } catch {
      // Backend unavailable
    }
  };

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
    fetchEvents();
    fetchArticles();
  }, []);

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo evento?")) return;
    await supabase.from("events").delete().eq("id", id);
    fetchEvents();
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
            <TabsTrigger value="registrations">Iscrizioni</TabsTrigger>
          </TabsList>

          {/* ════════ EVENTS TAB ════════ */}
          <TabsContent value="events">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-headline font-medium text-foreground">Eventi</h2>
              <Dialog
                open={eventDialogOpen}
                onOpenChange={(open) => {
                  setEventDialogOpen(open);
                  if (!open) {
                    setEventForm(emptyEventForm);
                    setEditingEventId(null);
                    setImageFile(null);
                    setImagePreview(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Nuovo evento
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
                  <DialogHeader>
                    <DialogTitle className="font-headline">
                      {editingEventId ? "Modifica evento" : "Nuovo evento"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <Input
                      placeholder="Titolo *"
                      value={eventForm.title}
                      onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    />
                    <Textarea
                      placeholder="Descrizione"
                      value={eventForm.description}
                      onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                      rows={3}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="datetime-local"
                        value={eventForm.date}
                        onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                      />
                      <AddressAutocomplete
                        value={eventForm.location}
                        onChange={(val) => setEventForm({ ...eventForm, location: val })}
                        placeholder="Luogo"
                      />
                    </div>
                    <ImageUploadArea formType="event" />
                    <Input
                      placeholder="Categoria"
                      value={eventForm.category}
                      onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}
                    />
                    <Input
                      placeholder="Link Registrazione"
                      value={eventForm.registration_link}
                      onChange={(e) => setEventForm({...eventForm, registration_link: e.target.value})}
                    />
                    <div className="border border-border p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Form di iscrizione interno</span>
                        <Switch
                          checked={eventForm.registration_enabled}
                          onCheckedChange={(checked) =>
                            setEventForm({ ...eventForm, registration_enabled: checked })
                          }
                        />
                      </div>
                      {eventForm.registration_enabled && (
                        <>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={eventForm.allow_guests}
                              onCheckedChange={(checked) =>
                                setEventForm({ ...eventForm, allow_guests: checked })
                              }
                            />
                            <span className="text-sm text-muted-foreground">
                              Consenti iscrizioni da ospiti (non registrati)
                            </span>
                          </div>
                          <FormBuilder
                            fields={eventForm.form_fields}
                            onChange={(fields) => setEventForm({ ...eventForm, form_fields: fields })}
                          />
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={eventForm.published}
                        onCheckedChange={(checked) => setEventForm({ ...eventForm, published: checked })}
                      />
                      <span className="text-sm text-muted-foreground">Pubblicato</span>
                    </div>
                    <Button className="w-full" onClick={handleSaveEvent} disabled={!eventForm.title || loading}>
                      {loading ? "Salvataggio..." : editingEventId ? "Salva modifiche" : "Crea evento"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm py-12 text-center">
                Nessun evento ancora. Clicca "Nuovo evento" per iniziare.
              </p>
            ) : (
              <div className="border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titolo</TableHead>
                      <TableHead className="hidden md:table-cell">Data</TableHead>
                      <TableHead className="hidden sm:table-cell">Luogo</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="w-24">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.title}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {event.date
                            ? new Date(event.date).toLocaleDateString("it-IT", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {event.location || "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-1 ${
                              event.published ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {event.published ? "Pubblicato" : "Bozza"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditEvent(event)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteEvent(event.id)}>
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

          <TabsContent value="registrations">
            <RegistrationsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

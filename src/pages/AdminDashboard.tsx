import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Pencil, Trash2, LogOut, Upload, X, Image as ImageIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
}

const emptyForm = {
  title: "",
  description: "",
  date: "",
  location: "",
  image_url: "",
  category: "event",
  published: false,
};

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fetchEvents = async () => {
    const { data } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setEvents(data);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
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

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setForm({ ...form, image_url: "" });
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

    const { data } = supabase.storage
      .from("event-images")
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  const handleSave = async () => {
    setLoading(true);

    let imageUrl = form.image_url || null;

    if (imageFile) {
      const uploaded = await uploadImage(imageFile);
      if (uploaded) imageUrl = uploaded;
    }

    const payload = {
      title: form.title,
      description: form.description || null,
      date: form.date || null,
      location: form.location || null,
      image_url: imageUrl,
      category: form.category || "event",
      published: form.published,
    };

    if (editingId) {
      await supabase.from("events").update(payload).eq("id", editingId);
    } else {
      await supabase.from("events").insert(payload);
    }

    setForm(emptyForm);
    setEditingId(null);
    setImageFile(null);
    setImagePreview(null);
    setDialogOpen(false);
    setLoading(false);
    fetchEvents();
  };

  const handleEdit = (event: Event) => {
    setForm({
      title: event.title,
      description: event.description || "",
      date: event.date ? event.date.slice(0, 16) : "",
      location: event.location || "",
      image_url: event.image_url || "",
      category: event.category || "event",
      published: event.published ?? false,
    });
    setImageFile(null);
    setImagePreview(event.image_url || null);
    setEditingId(event.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo evento?")) return;
    await supabase.from("events").delete().eq("id", id);
    fetchEvents();
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
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              Esci
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-headline font-medium text-foreground">
            Eventi
          </h2>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setForm(emptyForm);
              setEditingId(null);
              setImageFile(null);
              setImagePreview(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Nuovo evento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle className="font-headline">
                  {editingId ? "Modifica evento" : "Nuovo evento"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <Input
                  placeholder="Titolo *"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <Textarea
                  placeholder="Descrizione"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="datetime-local"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                  <Input
                    placeholder="Luogo"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>

                {/* Drag & Drop Image Upload */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Immagine</label>
                  {imagePreview ? (
                    <div className="relative rounded-md overflow-hidden border border-border">
                      <img
                        src={imagePreview}
                        alt="Anteprima"
                        className="w-full h-40 object-cover"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
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
                        dragging
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-muted-foreground"
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

                <Input
                  placeholder="Categoria"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.published}
                    onCheckedChange={(checked) => setForm({ ...form, published: checked })}
                  />
                  <span className="text-sm text-muted-foreground">Pubblicato</span>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSave}
                  disabled={!form.title || loading}
                >
                  {loading ? "Salvataggio..." : editingId ? "Salva modifiche" : "Crea evento"}
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
                          event.published
                            ? "bg-accent/10 text-accent"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {event.published ? "Pubblicato" : "Bozza"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(event)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(event.id)}
                        >
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
      </main>
    </div>
  );
}

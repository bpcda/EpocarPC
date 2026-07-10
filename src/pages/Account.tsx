import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, LogOut, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";

type VehicleType = "auto" | "moto" | "vespa";
interface Vehicle {
  id: string;
  type: VehicleType;
  brand: string;
  model: string;
  year: number | null;
  plate: string | null;
  photo_url: string | null;
  notes: string | null;
}
interface Profile {
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  phone: string | null;
  avatar_url: string | null;
}

const emptyVehicle: Omit<Vehicle, "id"> = {
  type: "auto", brand: "", model: "", year: null, plate: "", photo_url: null, notes: "",
};

export default function Account() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile>({
    first_name: "", last_name: "", city: "", phone: "", avatar_url: null,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [vForm, setVForm] = useState<Omit<Vehicle, "id">>(emptyVehicle);
  const [vPhotoFile, setVPhotoFile] = useState<File | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("first_name,last_name,city,phone,avatar_url").eq("user_id", user.id).maybeSingle();
    if (data) setProfile(data);
  }, [user]);

  const loadVehicles = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("vehicles").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setVehicles(data as Vehicle[]);
  }, [user]);

  useEffect(() => { loadProfile(); loadVehicles(); }, [loadProfile, loadVehicles]);

  const signedUrl = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from("vehicles").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }, []);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!profile.avatar_url) { setAvatarUrl(null); return; }
      const { data } = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_url, 3600);
      setAvatarUrl(data?.signedUrl ?? null);
    })();
  }, [profile.avatar_url]);

  const [vehiclePhotoUrls, setVehiclePhotoUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      for (const v of vehicles) {
        if (v.photo_url) {
          const url = await signedUrl(v.photo_url);
          if (url) map[v.id] = url;
        }
      }
      setVehiclePhotoUrls(map);
    })();
  }, [vehicles, signedUrl]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").upsert({
      user_id: user.id,
      first_name: profile.first_name,
      last_name: profile.last_name,
      city: profile.city,
      phone: profile.phone,
      avatar_url: profile.avatar_url,
    }, { onConflict: "user_id" });
    setSavingProfile(false);
    if (error) toast.error(error.message); else toast.success("Profilo salvato");
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setAvatarUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setAvatarUploading(false); return; }
    setProfile((p) => ({ ...p, avatar_url: path }));
    setAvatarUploading(false);
    toast.success("Avatar caricato — ricordati di salvare");
  };

  const openNew = () => {
    setEditing(null); setVForm(emptyVehicle); setVPhotoFile(null); setDialogOpen(true);
  };
  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setVForm({ type: v.type, brand: v.brand, model: v.model, year: v.year, plate: v.plate, photo_url: v.photo_url, notes: v.notes });
    setVPhotoFile(null); setDialogOpen(true);
  };

  const saveVehicle = async () => {
    if (!user) return;
    if (!vForm.brand || !vForm.model) { toast.error("Marca e modello richiesti"); return; }
    setSavingVehicle(true);
    let photo_url = vForm.photo_url;
    if (vPhotoFile) {
      const ext = vPhotoFile.name.split(".").pop();
      const path = `${user.id}/vehicle-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("vehicles").upload(path, vPhotoFile, { upsert: true });
      if (error) { toast.error(error.message); setSavingVehicle(false); return; }
      photo_url = path;
    }
    const payload = { ...vForm, photo_url, user_id: user.id };
    if (editing) {
      const { error } = await supabase.from("vehicles").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); setSavingVehicle(false); return; }
    } else {
      const { error } = await supabase.from("vehicles").insert(payload);
      if (error) { toast.error(error.message); setSavingVehicle(false); return; }
    }
    setSavingVehicle(false); setDialogOpen(false);
    toast.success("Veicolo salvato");
    loadVehicles();
  };

  const deleteVehicle = async (v: Vehicle) => {
    if (!confirm(`Eliminare ${v.brand} ${v.model}?`)) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    if (v.photo_url) await supabase.storage.from("vehicles").remove([v.photo_url]);
    toast.success("Veicolo eliminato");
    loadVehicles();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-foreground pt-32 pb-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-start justify-between mb-2 gap-4">
            <h1 className="font-headline text-5xl md:text-7xl text-primary-foreground tracking-wider">
              IL MIO ACCOUNT
            </h1>
            <Button variant="outline" onClick={handleSignOut}
              className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
              <LogOut className="w-4 h-4 mr-2" /> Esci
            </Button>
          </div>
          <p className="text-primary-foreground/60 text-sm mb-8">{user?.email}</p>
          <div className="w-24 h-0.5 bg-primary-foreground/30 mb-10" />

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="bg-primary-foreground/10 border border-primary-foreground/20">
              <TabsTrigger value="profile" className="font-headline tracking-widest data-[state=active]:bg-primary-foreground data-[state=active]:text-foreground">Profilo</TabsTrigger>
              <TabsTrigger value="vehicles" className="font-headline tracking-widest data-[state=active]:bg-primary-foreground data-[state=active]:text-foreground">I Miei Veicoli</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-8">
              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-32 h-32 bg-primary-foreground/10 border border-primary-foreground/20 overflow-hidden">
                    {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-primary-foreground/40 text-xs">Nessuna foto</div>}
                  </div>
                  <label className="cursor-pointer text-xs text-primary-foreground/70 hover:text-primary-foreground flex items-center gap-1">
                    <Upload className="w-3 h-3" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
                    {avatarUploading ? "Caricamento..." : "Cambia foto"}
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-primary-foreground/70">Nome</Label>
                    <Input value={profile.first_name ?? ""} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                      className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                  </div>
                  <div>
                    <Label className="text-primary-foreground/70">Cognome</Label>
                    <Input value={profile.last_name ?? ""} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                      className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                  </div>
                  <div>
                    <Label className="text-primary-foreground/70">Città / zona</Label>
                    <Input value={profile.city ?? ""} onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                      className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                  </div>
                  <div>
                    <Label className="text-primary-foreground/70">Telefono</Label>
                    <Input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                  </div>
                  <div className="sm:col-span-2">
                    <Button onClick={saveProfile} disabled={savingProfile}
                      className="bg-primary-foreground text-foreground hover:bg-primary-foreground/90 font-headline tracking-widest">
                      {savingProfile ? "Salvataggio..." : "Salva profilo"}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="vehicles" className="mt-8">
              <div className="flex justify-between items-center mb-6">
                <p className="text-primary-foreground/60 text-sm">I tuoi veicoli d'epoca — verranno mostrati nelle iscrizioni agli eventi.</p>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={openNew} className="bg-primary-foreground text-foreground hover:bg-primary-foreground/90 font-headline tracking-widest">
                      <Plus className="w-4 h-4 mr-2" /> Aggiungi
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-foreground border border-primary-foreground/20 text-primary-foreground max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="font-headline text-2xl tracking-wider">
                        {editing ? "MODIFICA VEICOLO" : "NUOVO VEICOLO"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-primary-foreground/70">Tipo</Label>
                        <Select value={vForm.type} onValueChange={(v) => setVForm({ ...vForm, type: v as VehicleType })}>
                          <SelectTrigger className="bg-transparent border-primary-foreground/30 text-primary-foreground"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="moto">Moto</SelectItem>
                            <SelectItem value="vespa">Vespa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-primary-foreground/70">Marca</Label>
                          <Input value={vForm.brand} onChange={(e) => setVForm({ ...vForm, brand: e.target.value })}
                            className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                        </div>
                        <div>
                          <Label className="text-primary-foreground/70">Modello</Label>
                          <Input value={vForm.model} onChange={(e) => setVForm({ ...vForm, model: e.target.value })}
                            className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                        </div>
                        <div>
                          <Label className="text-primary-foreground/70">Anno</Label>
                          <Input type="number" value={vForm.year ?? ""} onChange={(e) => setVForm({ ...vForm, year: e.target.value ? parseInt(e.target.value) : null })}
                            className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                        </div>
                        <div>
                          <Label className="text-primary-foreground/70">Targa</Label>
                          <Input value={vForm.plate ?? ""} onChange={(e) => setVForm({ ...vForm, plate: e.target.value })}
                            className="bg-transparent border-primary-foreground/30 text-primary-foreground" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-primary-foreground/70">Foto</Label>
                        <Input type="file" accept="image/*" onChange={(e) => setVPhotoFile(e.target.files?.[0] ?? null)}
                          className="bg-transparent border-primary-foreground/30 text-primary-foreground file:text-primary-foreground" />
                      </div>
                      <Button onClick={saveVehicle} disabled={savingVehicle}
                        className="w-full bg-primary-foreground text-foreground hover:bg-primary-foreground/90 font-headline tracking-widest">
                        {savingVehicle ? "Salvataggio..." : "Salva"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {vehicles.length === 0 ? (
                <p className="text-primary-foreground/50 text-center py-16 border border-dashed border-primary-foreground/20">
                  Nessun veicolo ancora. Aggiungi il tuo primo per essere pronto agli eventi.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {vehicles.map((v) => (
                    <div key={v.id} className="border border-primary-foreground/20 bg-primary-foreground/5 flex">
                      <div className="w-28 h-28 shrink-0 bg-primary-foreground/10">
                        {vehiclePhotoUrls[v.id] ? <img src={vehiclePhotoUrls[v.id]} alt={`${v.brand} ${v.model}`} className="w-full h-full object-cover" /> : null}
                      </div>
                      <div className="flex-1 p-3 flex flex-col justify-between">
                        <div>
                          <p className="text-xs text-primary-foreground/50 uppercase tracking-wider">{v.type}{v.year ? ` · ${v.year}` : ""}</p>
                          <p className="font-headline text-lg text-primary-foreground tracking-wide leading-tight">{v.brand} {v.model}</p>
                          {v.plate && <p className="text-xs text-primary-foreground/60 mt-1">Targa: {v.plate}</p>}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(v)}
                            className="h-7 px-2 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => deleteVehicle(v)}
                            className="h-7 px-2 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </>
  );
}
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { FileDown, FileUp, FileText } from "lucide-react";
import {
  ALLOWED_UPLOAD_ACCEPT,
  isAllowedUploadFile,
  type FormField,
} from "@/lib/form-fields";

interface Props {
  eventId: string;
  allowGuests: boolean;
  fields: FormField[];
}

interface Vehicle {
  id: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  type: string | null;
}

export default function EventRegistrationForm({ eventId, allowGuests, fields }: Props) {
  const auth = useAuth();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.user) return;
    supabase
      .from("vehicles")
      .select("id, brand, model, year, type")
      .eq("user_id", auth.user.id)
      .then(({ data }) => {
        if (data) setVehicles(data as Vehicle[]);
      });
  }, [auth.user]);

  const setValue = (id: string, v: unknown) => setValues((prev) => ({ ...prev, [id]: v }));

  const validate = (): string | null => {
    for (const f of fields) {
      if (f.type === "document") continue;
      if (!f.required) continue;
      const v = values[f.id];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
        return `Il campo "${f.label}" è obbligatorio`;
      }
    }
    if (!auth.user) {
      if (!guestName.trim()) return "Inserisci il tuo nome";
      if (!guestEmail.trim()) return "Inserisci la tua email";
    }
    return null;
  };

  const uploadUserFile = async (field: FormField, file: File) => {
    if (!auth.user) {
      toast({
        title: "Login richiesto",
        description: "Per caricare file devi accedere.",
        variant: "destructive",
      });
      return;
    }
    if (!isAllowedUploadFile(file.name)) {
      toast({
        title: "Formato non consentito",
        description: "Solo PDF, DOCX o immagini (JPG, PNG, WEBP, HEIC).",
        variant: "destructive",
      });
      return;
    }
    setUploadingFieldId(field.id);
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${auth.user.id}/${eventId}/${field.id}-${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from("registration-uploads")
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    setUploadingFieldId(null);
    if (error) {
      toast({ title: "Upload fallito", description: error.message, variant: "destructive" });
      return;
    }
    setValue(field.id, { path, filename: file.name, size: file.size });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: "Compila il form", description: err, variant: "destructive" });
      return;
    }
    setSubmitting(true);

    // Extract vehicle_id if a vehicle field is present
    const vehicleField = fields.find((f) => f.type === "vehicle");
    const vehicleId = vehicleField ? (values[vehicleField.id] as string) || null : null;

    const answers: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (f.type === "document") return; // display-only
      answers[f.id] = { label: f.label, type: f.type, value: values[f.id] ?? null };
    });

    const { error } = await supabase.from("event_registrations").insert({
      event_id: eventId,
      user_id: auth.user?.id ?? null,
      vehicle_id: vehicleId,
      guest_name: auth.user ? null : guestName.trim(),
      guest_email: auth.user ? null : guestEmail.trim(),
      answers: answers as never,
    });

    setSubmitting(false);
    if (error) {
      const msg =
        error.code === "23505"
          ? "Risulti già iscritto a questo evento."
          : error.message;
      toast({ title: "Errore", description: msg, variant: "destructive" });
      if (error.code === "23505") setDone(true);
      return;
    }
    setDone(true);
    toast({ title: "Iscrizione confermata", description: "Ci vediamo all'evento!" });
  };

  if (done) {
    return (
      <div className="border border-primary-foreground/30 p-6 bg-primary-foreground/5">
        <p className="font-headline text-xl text-primary-foreground tracking-wider">ISCRIZIONE CONFERMATA</p>
        <p className="text-primary-foreground/60 text-sm mt-2">Grazie! Ti aspettiamo all'evento.</p>
      </div>
    );
  }

  if (!auth.user && !allowGuests) {
    return (
      <div className="border border-primary-foreground/30 p-6 bg-primary-foreground/5 space-y-3">
        <p className="text-primary-foreground/80 text-sm">
          Per iscriverti a questo evento devi avere un account.
        </p>
        <Link to="/auth">
          <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 font-headline tracking-widest">
            ACCEDI / REGISTRATI
          </Button>
        </Link>
      </div>
    );
  }

  const inputClass = "bg-primary-foreground/5 border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/40";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border border-primary-foreground/30 p-6 bg-primary-foreground/5">
      <p className="font-headline text-2xl text-primary-foreground tracking-wider">ISCRIVITI</p>

      {!auth.user && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            className={inputClass}
            placeholder="Nome e cognome *"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
          <Input
            className={inputClass}
            type="email"
            placeholder="Email *"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
        </div>
      )}

      {fields.map((f) => (
        <div key={f.id} className="space-y-1">
          <label className="text-xs uppercase tracking-widest text-primary-foreground/60">
            {f.label} {f.required && f.type !== "document" && <span className="text-primary-foreground">*</span>}
          </label>
          {renderField(
            f,
            values[f.id],
            (v) => setValue(f.id, v),
            vehicles,
            inputClass,
            uploadingFieldId === f.id,
            (file) => uploadUserFile(f, file),
            !!auth.user,
          )}
        </div>
      ))}

      <Button
        type="submit"
        disabled={submitting}
        variant="outline"
        className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 font-headline tracking-widest"
      >
        {submitting ? "INVIO..." : "CONFERMA ISCRIZIONE"}
      </Button>
    </form>
  );
}

function renderField(
  f: FormField,
  value: unknown,
  onChange: (v: unknown) => void,
  vehicles: Vehicle[],
  inputClass: string,
  uploading: boolean,
  onUpload: (file: File) => void,
  isAuthenticated: boolean,
) {
  switch (f.type) {
    case "textarea":
      return (
        <Textarea
          className={inputClass}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "email":
    case "phone":
    case "number":
    case "date":
    case "datetime":
    case "text": {
      const typeMap: Record<string, string> = {
        email: "email",
        phone: "tel",
        number: "number",
        date: "date",
        datetime: "datetime-local",
        text: "text",
      };
      return (
        <Input
          className={inputClass}
          type={typeMap[f.type]}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    case "select":
      return (
        <select
          className={`w-full h-10 px-3 text-sm ${inputClass}`}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" className="bg-background text-foreground">— seleziona —</option>
          {(f.options || []).map((o) => (
            <option key={o} value={o} className="bg-background text-foreground">{o}</option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="space-y-1">
          {(f.options || []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-primary-foreground/80">
              <input
                type="radio"
                name={f.id}
                checked={value === o}
                onChange={() => onChange(o)}
              />
              {o}
            </label>
          ))}
        </div>
      );
    case "checkbox": {
      const arr = (value as string[]) || [];
      return (
        <div className="space-y-1">
          {(f.options || []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-primary-foreground/80">
              <input
                type="checkbox"
                checked={arr.includes(o)}
                onChange={(e) => {
                  if (e.target.checked) onChange([...arr, o]);
                  else onChange(arr.filter((x) => x !== o));
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case "vehicle":
      if (vehicles.length === 0) {
        return (
          <p className="text-xs text-primary-foreground/60">
            Nessun veicolo registrato. <Link to="/account" className="underline">Aggiungine uno</Link>.
          </p>
        );
      }
      return (
        <select
          className={`w-full h-10 px-3 text-sm ${inputClass}`}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" className="bg-background text-foreground">— seleziona veicolo —</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id} className="bg-background text-foreground">
              {[v.type, v.brand, v.model, v.year].filter(Boolean).join(" · ")}
            </option>
          ))}
        </select>
      );
    case "document":
      return (
        <div className="space-y-1">
          {(f.documents || []).length === 0 ? (
            <p className="text-xs text-primary-foreground/60">Nessun documento allegato.</p>
          ) : (
            (f.documents || []).map((d) => (
              <button
                key={d.path}
                type="button"
                onClick={() => openDocument(d.path)}
                className="w-full flex items-center gap-2 text-left text-sm border border-primary-foreground/30 px-3 py-2 bg-primary-foreground/5 hover:bg-primary-foreground/10 text-primary-foreground"
              >
                <FileText className="h-4 w-4" />
                <span className="flex-1 truncate">{d.filename}</span>
                <span className="text-xs opacity-60">{Math.max(1, Math.round(d.size / 1024))} KB</span>
                <FileDown className="h-4 w-4" />
              </button>
            ))
          )}
        </div>
      );
    case "file_upload": {
      if (!isAuthenticated) {
        return (
          <p className="text-xs text-primary-foreground/60">
            Per caricare un file <Link to="/auth" className="underline">accedi al tuo account</Link>.
          </p>
        );
      }
      const uploaded = value as { filename?: string; size?: number; path?: string } | null;
      return (
        <div className="space-y-2">
          {f.hint && <p className="text-xs text-primary-foreground/60">{f.hint}</p>}
          <label className="flex items-center gap-2 text-sm border border-dashed border-primary-foreground/40 px-3 py-3 cursor-pointer text-primary-foreground/80 hover:bg-primary-foreground/5">
            <FileUp className="h-4 w-4" />
            {uploading
              ? "Upload in corso..."
              : uploaded?.filename
                ? `Sostituisci "${uploaded.filename}"`
                : "Seleziona un file (PDF, DOCX, immagine)"}
            <input
              type="file"
              className="hidden"
              accept={ALLOWED_UPLOAD_ACCEPT}
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          {uploaded?.filename && (
            <p className="text-xs text-primary-foreground/60">
              Caricato: <span className="text-primary-foreground">{uploaded.filename}</span>
            </p>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

async function openDocument(path: string) {
  const { data, error } = await supabase.storage
    .from("event-documents")
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    toast({
      title: "Impossibile aprire il documento",
      description: error?.message || "Riprova più tardi.",
      variant: "destructive",
    });
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import type { FormField } from "@/lib/form-fields";

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
            {f.label} {f.required && <span className="text-primary-foreground">*</span>}
          </label>
          {renderField(f, values[f.id], (v) => setValue(f.id, v), vehicles, inputClass)}
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
    default:
      return null;
  }
}
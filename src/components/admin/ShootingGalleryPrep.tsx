import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { RequestRow } from "@/hooks/use-shooting-agenda";
import { type ShootingSlot, slotLabel } from "./ShootingSlotGenerator";
import { Button } from "@/components/ui/button";

const db: SupabaseClient = supabase;
interface Delivery {
  id: string;
  slot_id: string;
  recipients: string[];
  eligible: boolean;
  expires_at: string;
  gallery_id: string | null;
}
interface AdminAlbum {
  permissions: Record<string, boolean>;
  photos: Delivery[];
}

async function jpeg(photo: File) {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(photo);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error();
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!jpg) throw new Error();
    return jpg;
  } finally {
    bitmap?.close();
  }
}

function Publication({ photo, labels, refresh }: { photo: Delivery; labels: string[]; refresh: () => void }) {
  const [verified, setVerified] = useState(false);
  const [preview, setPreview] = useState("");
  const [viewed, setViewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function inspect() {
    const result = await db.storage.from("shooting-photos").createSignedUrl(photo.id + ".jpg", 120);
    if (result.error) setMessage("Anteprima non disponibile.");
    else setPreview(result.data.signedUrl);
  }
  async function publish() {
    setBusy(true);
    try {
      const result = await db.rpc("shooting_publish_photo", {
        p_id: photo.id,
        p_publish: !photo.gallery_id,
        p_verified: verified,
      });
      if (result.error) throw result.error;
      setVerified(false);
      setMessage(photo.gallery_id ? "Foto ritirata." : "Foto pubblicata.");
      await refresh();
    } catch {
      setMessage("Operazione non riuscita. Aggiorna le consegne e riprova.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-2 border-t py-3">
      <p className="font-semibold">{labels.join(" · ")}</p>
      <p>
        {photo.gallery_id
          ? "Pubblicata nella Gallery"
          : photo.eligible
          ? "Pubblicazione consentita dai destinatari"
          : "Solo consegna privata"}
      </p>
      <Button variant="outline" onClick={inspect}>Vedi scatto</Button>
      {preview && (
        <img
          src={preview}
          className="max-h-64 object-contain"
          alt="Scatto consegnato"
          onLoad={() => setViewed(true)}
          onError={() => {
            setPreview("");
            setViewed(false);
            setVerified(false);
            setMessage("Anteprima non disponibile. Riprova.");
          }}
        />
      )}
      {viewed && photo.eligible && !photo.gallery_id && (
        <label className="block">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />{" "}
          Ho verificato per questo scatto le autorizzazioni di tutte le persone riconoscibili, dei
          responsabili dei minori e le targhe visibili.
        </label>
      )}
      {(photo.gallery_id || photo.eligible) && (
        <Button disabled={busy || (!photo.gallery_id && !verified)} onClick={publish}>
          {photo.gallery_id ? "Ritira dalla Gallery" : "Pubblica in Gallery"}
        </Button>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}

export default function ShootingGalleryPrep(
  { day, slots, rows, owner }: { day: string; slots: ShootingSlot[]; rows: RequestRow[]; owner: string },
) {
  const [photo, setPhoto] = useState<File>();
  const [id, setId] = useState("");
  const [preview, setPreview] = useState("");
  const [slot, setSlot] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const album = useQuery({
    queryKey: ["shooting-photo-admin", owner, day],
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const result = await db.rpc("shooting_photo_admin", { p_day: day });
      if (result.error) throw result.error;
      return result.data as AdminAlbum;
    },
  });
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  async function prepare(deliver: boolean) {
    if (!photo || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const blob = await jpeg(photo);
      if (deliver) {
        const upload = await db.storage.from("shooting-photos").upload(id + ".jpg", blob, {
          contentType: "image/jpeg",
          cacheControl: "0",
        });
        // A retry may find the immutable file from the first upload.
        if (
          upload.error &&
          !["Duplicate", "ResourceAlreadyExists"].includes(
            (upload.error as { error?: string }).error ?? upload.error.message,
          ) &&
          String((upload.error as { statusCode?: string }).statusCode) !== "409"
        ) throw upload.error;
        const saved = await db.rpc("shooting_deliver_photo", {
          p_id: id,
          p_slot: slot,
          p_requests: recipients,
        });
        if (saved.error) throw saved.error;
        setDelivered(true);
        setMessage("Foto consegnata. I destinatari hanno 30 giorni per scaricarla.");
        await album.refetch();
      } else {
        const link = document.createElement("a");
        link.download = `epocar-shooting-${day}-${id.slice(0, 8)}.jpg`;
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        setMessage("Copia JPEG pronta.");
      }
    } catch {
      setMessage("Operazione non riuscita. Verifica lo scatto e i destinatari, poi riprova.");
    } finally {
      setBusy(false);
    }
  }
  const confirmed = rows.filter((r) => r.state === "confirmed");
  const label = (r: RequestRow) =>
    [r.first_name, r.last_name, r.brand, r.model].filter(Boolean).join(" ") || r.email;
  return (
    <section className="space-y-5 border bg-card p-5">
      <h3 className="font-headline text-3xl">Prepara uno scatto</h3>
      <label className="block">
        Foto della serata<input
          type="file"
          disabled={busy}
          accept="image/jpeg,image/png,image/webp"
          className="block w-full py-2"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setApproved(false);
            setDelivered(false);
            setRecipients([]);
            setMessage("");
            setPhoto(undefined);
            if (
              file &&
              (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 25 * 1024 * 1024)
            ) setMessage("Scegli un JPEG, PNG o WebP di massimo 25 MB.");
            else {
              setPhoto(file);
              setId(crypto.randomUUID());
            }
          }}
        />
      </label>
      {preview && (
        <fieldset disabled={busy} className="space-y-3">
          <img className="max-h-72 max-w-full object-contain" src={preview} alt="Anteprima dello scatto" />
          <label className="block">
            Appuntamento<select
              disabled={delivered}
              className="block w-full border p-2"
              value={slot}
              onChange={(e) => {
                setSlot(e.target.value);
                setRecipients([]);
              }}
            >
              <option value="">Seleziona lo slot</option>
              {slots.filter((s) => confirmed.some((r) => r.slot_id === s.id)).map((s) => (
                <option key={s.id} value={s.id}>{slotLabel(s)}</option>
              ))}
            </select>
          </label>
          {slot && (
            <fieldset disabled={delivered}>
              <legend>Destinatari dello scatto</legend>
              {confirmed.filter((r) => r.slot_id === slot).map((r) => (
                <label key={r.id} className="block py-1">
                  <input
                    type="checkbox"
                    checked={recipients.includes(r.id)}
                    onChange={(e) =>
                      setRecipients(
                        e.target.checked ? [...recipients, r.id] : recipients.filter((v) =>
                          v !== r.id
                        ),
                      )}
                  />{" "}
                  {label(r)} · {r.email} ·{" "}
                  {r.image_permission ? "Ritratto autorizzato" : "Ritratto non autorizzato"} ·{" "}
                  {album.data?.permissions?.[r.id] ? "Gallery consentita" : "Solo privato"}
                </label>
              ))}
            </fieldset>
          )}
          <Button disabled={!album.data || !recipients.length || delivered} onClick={() => prepare(true)}>
            Consegna al socio
          </Button>
          <details>
            <summary className="cursor-pointer">Esporta una copia locale</summary>
            <label className="block">
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
              {" "}
              Ho verificato le autorizzazioni per lo scatto.
            </label>
            <Button variant="outline" disabled={!approved} onClick={() => prepare(false)}>
              Scarica JPEG senza metadati originali
            </Button>
          </details>
        </fieldset>
      )}
      {message && <p role="status">{message}</p>}
      <h3 className="font-headline text-2xl">Scatti consegnati</h3>
      {album.isError
        ? (
          <p>
            Consegne non disponibili.{" "}
            <button className="underline" onClick={() => album.refetch()}>Riprova</button>
          </p>
        )
        : album.isPending
        ? <p>Caricamento…</p>
        : !album.data?.photos?.length
        ? <p>Nessuno scatto consegnato per questa serata.</p>
        : album.data.photos.map((p) => (
          <Publication
            key={p.id}
            photo={p}
            refresh={() => album.refetch()}
            labels={p.recipients.map((id) => {
              const row = rows.find((r) => r.id === id);
              return row
                ? `${label(row)} · ${
                  row.image_permission ? "ritratto autorizzato" : "ritratto non autorizzato"
                }`
                : "Partecipante";
            })}
          />
        ))}
    </section>
  );
}

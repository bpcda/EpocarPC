import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const db: SupabaseClient = supabase;
interface Photo {
  id: string;
  day: string;
  expires_at: string;
}
const date = (value: string) => new Date(value).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });

function DeliveredPhoto({ photo }: { photo: Photo }) {
  const [blob, setBlob] = useState<Blob>();
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  async function open() {
    setLoading(true);
    setError(false);
    try {
      const { data, error } = await supabase.functions.invoke("shooting-photo", { body: { id: photo.id } });
      if (error || !(data instanceof Blob)) throw new Error();
      setBlob(data.slice(0, data.size, "image/jpeg"));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <article className="space-y-3 rounded border border-current/25 p-4">
      <h3 className="font-headline text-xl">Shooting del {date(photo.day + "T12:00:00Z")}</h3>
      <p>
        Scaricabile fino al {new Date(photo.expires_at).toLocaleString("it-IT", {
          timeZone: "Europe/Rome",
          dateStyle: "short",
          timeStyle: "short",
        })} (ora italiana)
      </p>
      {src
        ? (
          <>
            <img className="max-h-72 rounded object-contain" src={src} alt="Scatto dello shooting" />
            <a
              className="inline-block underline"
              download={`epocar-${photo.day}-${photo.id.slice(0, 8)}.jpg`}
              href={src}
            >
              Scarica foto
            </a>
          </>
        )
        : (
          <Button variant="secondary" onClick={open} disabled={loading}>
            {loading ? "Apertura…" : "Apri foto"}
          </Button>
        )}
      {error && <p role="alert">Foto non disponibile. Verifica la scadenza o riprova.</p>}
    </article>
  );
}

export default function MyPhotos({ owner }: { owner: string }) {
  const photos = useQuery({
    queryKey: ["my-shooting-photos", owner],
    gcTime: 0,
    queryFn: async () => {
      const result = await db.rpc("my_shooting_photos");
      if (result.error?.code === "PGRST202") return [] as Photo[];
      if (result.error) throw new Error();
      return result.data as Photo[];
    },
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const next = Math.min(
      ...(photos.data ?? []).map((p) => Date.parse(p.expires_at)).filter((exp) => exp > now),
    );
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(1, Math.min(2147483647, next - Date.now() + 1)),
    );
    return () => clearTimeout(timer);
  }, [photos.data, now]);
  const visible = photos.data?.filter((p) => Date.parse(p.expires_at) > Date.now());
  return (
    <section className="space-y-4">
      <h2 className="text-3xl font-headline">Le mie foto</h2>
      {photos.isPending ? <p>Caricamento…</p> : photos.isError
        ? (
          <p role="alert">
            Album non disponibile.{" "}
            <button className="underline" onClick={() => photos.refetch()}>Riprova</button>
          </p>
        )
        : visible?.length
        ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {visible.map((p) => <DeliveredPhoto key={p.id} photo={p} />)}
          </div>
        )
        : <p>Qui troverai le foto che EPOCAR ti consegna. Potrai scaricarle per 30 giorni.</p>}
    </section>
  );
}

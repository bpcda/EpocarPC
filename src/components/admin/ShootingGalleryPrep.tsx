import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function ShootingGalleryPrep({ day }: { day: string }) {
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState("");
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  async function prepare() {
    if (!photo || !approved || busy) return;
    setBusy(true);
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
      const jpg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!jpg) throw new Error();
      const link = document.createElement("a");
      link.download = `epocar-shooting-${day}-${crypto.randomUUID().slice(0,8)}.jpg`;
      link.href = URL.createObjectURL(jpg);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setMessage("Copia JPEG pronta. Puoi caricarla nella Gallery del sito.");
    } catch { setMessage("Impossibile preparare questa immagine. Prova un file JPEG o PNG."); }
    finally { bitmap?.close(); setBusy(false); }
  }
  return <section className="space-y-4 border bg-card p-5">
    <h3 className="font-headline text-3xl">Prepara uno scatto</h3>
    <p>Seleziona una foto già ritoccata. L’anteprima resta su questo dispositivo fino alla pubblicazione tramite la Gallery.</p>
    <label className="block">Foto della serata<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" className="block w-full py-2" onChange={e=>{
      const file=e.target.files?.[0];
      setApproved(false); setMessage(""); setPhoto(undefined);
      if(file && (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>25*1024*1024)) setMessage("Scegli un JPEG, PNG o WebP di massimo 25 MB.");
      else setPhoto(file);
    }} /></label>
    {preview && <><img className="max-h-72 max-w-full object-contain" src={preview} alt="Scatto da verificare prima della pubblicazione" />
      <label className="block"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} /> Ho verificato le autorizzazioni per il sito di ogni persona riconoscibile, incluse quelle per i minori, e le targhe visibili.</label>
      <Button type="button" disabled={!approved || busy} onClick={prepare}>Scarica JPEG senza metadati originali</Button></>}
    {message && <p role="status">{message}</p>}
    <a className="block underline" href="/admin?tab=gallery">Apri la Gallery per pubblicare</a>
  </section>;
}

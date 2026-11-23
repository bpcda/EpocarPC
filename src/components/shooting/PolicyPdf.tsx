import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// The existing booking RPC snapshots the full text, including this immutable attachment reference.
export function splitPolicy(value = "") {
  const match = /(?:^|\n\n)\[PDF: (shooting\/\d{4}-\d{2}-\d{2}\/(?:privacy|images)\/[a-f0-9-]{36}\.pdf)\]$/.exec(value);
  return { text: match ? value.slice(0, match.index) : value, path: match?.[1] };
}

export async function policyWithFile(day: string, kind: "privacy" | "images", text: string, old: string, file?: File) {
  let path = splitPolicy(old).path;
  if (file?.size) {
    if (file.size > 10 * 1024 * 1024 || await file.slice(0, 5).text() !== "%PDF-") {
      throw new Error("Seleziona un PDF valido di massimo 10 MB.");
    }
    path = `shooting/${day}/${kind}/${crypto.randomUUID()}.pdf`;
    const result = await supabase.storage.from("event-documents").upload(path, file, { contentType: "application/pdf" });
    if (result.error) throw new Error("Caricamento PDF non riuscito. Riprova.");
  }
  return [text.trim(), path && `[PDF: ${path}]`].filter(Boolean).join("\n\n");
}

export function PolicyDownload({ value, title }: { value: string; title: string }) {
  const [error, setError] = useState(false);
  const { path } = splitPolicy(value);
  if (!path) return null;
  async function download() {
    setError(false);
    try {
      const result = await supabase.storage.from("event-documents").createSignedUrl(path!, 120, { download: title + ".pdf" });
      if (result.error) throw result.error;
      window.location.assign(result.data.signedUrl);
    } catch { setError(true); }
  }
  return <div><button type="button" className="py-2 text-sm font-semibold underline underline-offset-4" onClick={download}>Scarica {title.toLowerCase()} (PDF)</button>{error && <p role="alert">Download non riuscito. Riprova.</p>}</div>;
}

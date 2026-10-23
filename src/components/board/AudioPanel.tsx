import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Square, Pause, Play, Upload, Trash2, FileAudio, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Meeting } from "@/lib/board";
import {
  ATTRIBUTION_LABEL, RECORDING_NOTICE, TRACK_STATUS, currentConsent, deleteAudioTrack, finishAudioTrack,
  formatDuration, loadAudioData, saveAiSettings, setRecordingConsent, startAudioTrack, transcribeTrack,
  type AiSettings, type AudioTrack,
} from "@/lib/board-audio";

function Transcript({ track }: { track: AudioTrack }) {
  if (track.status === "errore") return <p role="alert" className="text-sm text-destructive">Trascrizione non riuscita: {track.transcript_error ?? "errore sconosciuto"}</p>;
  if (!track.transcript?.length) return null;
  return (
    <ol className="space-y-2 max-h-72 overflow-y-auto border border-border p-3 bg-muted/40">
      {track.transcript.map((s, i) => (
        <li key={i} className="text-sm">
          <span className="text-xs text-muted-foreground">{formatDuration(Math.floor(s.start))} · </span>
          <strong>{s.speaker ?? ATTRIBUTION_LABEL[s.attribution]}</strong>
          {s.speaker && s.attribution !== "verificata" && <span className="text-xs text-muted-foreground"> ({ATTRIBUTION_LABEL[s.attribution].toLowerCase()})</span>}
          <p>{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

function AiSettingsForm({ settings, onSaved }: { settings: AiSettings; onSaved: () => void }) {
  const [form, setForm] = useState(settings);
  const save = useMutation({
    mutationFn: () => saveAiSettings(form),
    onSuccess: () => { toast.success("Impostazioni salvate"); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito"),
  });
  const set = (k: keyof AiSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  return (
    <div className="border border-border p-4 space-y-3 bg-card">
      <h4 className="font-headline text-xl tracking-wider">Impostazioni trascrizione IA</h4>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v === true })} />
        <span>Trascrizione IA attiva. La chiave del provider resta nei segreti del server e non passa mai dal browser.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm space-y-1">Provider<Input value={form.provider} onChange={set("provider")} /></label>
        <label className="text-sm space-y-1">Modello di trascrizione<Input value={form.transcription_model} onChange={set("transcription_model")} /></label>
        <label className="text-sm space-y-1">Modello di redazione del verbale<Input value={form.drafting_model} onChange={set("drafting_model")} /></label>
        <label className="text-sm space-y-1">Indirizzo API (https)<Input value={form.api_base} onChange={set("api_base")} /></label>
        <label className="text-sm space-y-1">Costo stimato €/min<Input type="number" step="0.0001" min="0" value={form.cost_per_min_eur} onChange={set("cost_per_min_eur")} /></label>
        <label className="text-sm space-y-1">Limite di spesa per riunione (€)<Input type="number" step="0.5" min="0" value={form.max_cost_eur} onChange={set("max_cost_eur")} /></label>
      </div>
      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>Salva impostazioni</Button>
    </div>
  );
}

export default function AudioPanel({ m, me, president, manager, active, live }: {
  m: Meeting; me: string; president: boolean; manager: boolean; active: boolean; live: boolean;
}) {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["board-audio", m.id], queryFn: () => loadAudioData(m.id), refetchInterval: active ? 15000 : false });
  const [consentOpen, setConsentOpen] = useState(false);
  const [noticeRead, setNoticeRead] = useState(false);
  const [recording, setRecording] = useState<{ trackId: string; started: number; paused: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["board-audio", m.id] });
  const act = useMutation({
    mutationFn: (f: () => Promise<void>) => f(),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });

  useEffect(() => {
    if (!recording || recording.paused) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - recording.started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => recorder.current?.state !== "inactive" && recorder.current?.stop(), []);

  const mine = m.board_meeting_participants.find((p) => p.user_id === me && p.kind === "member");
  const myConsent = mine ? currentConsent(data.data?.consents ?? [], mine.id) : null;
  const consented = myConsent?.consented ?? false;
  const settings = data.data?.settings ?? null;
  const participantName = (t: AudioTrack) =>
    t.kind === "shared" ? "Traccia condivisa" :
    m.board_meeting_participants.find((p) => p.id === t.participant_id)?.display_name ?? "Componente";

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Questo browser non supporta la registrazione audio"); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const trackId = await startAudioTrack(m.id, "individual");
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => stream.getTracks().forEach((t) => t.stop());
      rec.start(1000);
      recorder.current = rec;
      setRecording({ trackId, started: Date.now(), paused: false });
      setElapsed(0);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Microfono non autorizzato dal browser");
    }
  };
  const stopRecording = () => {
    const rec = recorder.current, recState = recording;
    if (!rec || !recState) return;
    rec.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
      const duration = (Date.now() - recState.started) / 1000;
      act.mutate(() => finishAudioTrack(m.id, recState.trackId, blob, duration));
    };
    rec.stop();
    recorder.current = null;
    setRecording(null);
  };
  const uploadShared = (file: File) => act.mutate(async () => {
    const trackId = await startAudioTrack(m.id, "shared");
    await finishAudioTrack(m.id, trackId, file, 0);
  });

  return (
    <section className="border border-border p-5 bg-card space-y-4" aria-label="Registrazione e trascrizione">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-headline text-2xl tracking-wider">Registrazione e trascrizione</h3>
        {recording && (
          <p role="status" className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <span className="inline-block h-3 w-3 rounded-full bg-destructive animate-pulse" aria-hidden />
            {recording.paused ? "Registrazione in pausa" : "Registrazione in corso"} · {formatDuration(elapsed)}
          </p>
        )}
      </header>

      {mine && active && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            Consenso alla registrazione: <strong>{consented ? `prestato (informativa ${myConsent?.notice_version})` : "non prestato"}</strong>
          </p>
          <Button size="sm" variant="outline" onClick={() => { setNoticeRead(false); setConsentOpen(true); }}>
            {consented ? "Revoca o rinnova il consenso" : "Leggi l'informativa e decidi"}
          </Button>
        </div>
      )}

      {live && mine?.present && consented && !recording && (
        <Button size="sm" onClick={startRecording} disabled={act.isPending}><Mic className="h-4 w-4 mr-2" />Avvia la mia registrazione</Button>
      )}
      {recording && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            const rec = recorder.current;
            if (!rec) return;
            if (recording.paused) { rec.resume(); setRecording({ ...recording, paused: false }); }
            else { rec.pause(); setRecording({ ...recording, paused: true }); }
          }}>{recording.paused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}{recording.paused ? "Riprendi" : "Sospendi"}</Button>
          <Button size="sm" variant="destructive" onClick={stopRecording}><Square className="h-4 w-4 mr-2" />Termina e carica</Button>
        </div>
      )}

      {manager && active && (
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer border border-border px-3 py-2 hover:bg-muted">
          <Upload className="h-4 w-4" />Carica traccia condivisa della riunione
          <input type="file" accept="audio/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadShared(f); e.target.value = ""; }} />
        </label>
      )}

      {data.error && <p role="alert" className="text-destructive text-sm">Modulo audio non disponibile: occorre installare l'aggiornamento SQL della Fase 4.</p>}
      {settings && !settings.enabled && <p className="text-sm text-muted-foreground">Trascrizione IA disattivata: le registrazioni restano disponibili, il verbale si redige manualmente.</p>}

      {!!data.data?.tracks.length && (
        <ul className="space-y-3">
          {data.data.tracks.map((t) => (
            <li key={t.id} className="border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold flex items-center gap-2"><FileAudio className="h-4 w-4" />{participantName(t)} · {formatDuration(t.duration_seconds)}</p>
                <span className="text-xs uppercase tracking-widest border border-border px-2 py-1">{TRACK_STATUS[t.status] ?? t.status}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {manager && settings?.enabled && ["caricata", "errore"].includes(t.status) && (
                  <Button size="sm" variant="outline" disabled={act.isPending}
                    onClick={() => act.mutate(() => transcribeTrack(t.id))}>
                    <Sparkles className="h-4 w-4 mr-2" />{t.status === "errore" ? "Riprova trascrizione" : "Trascrivi"}
                  </Button>
                )}
                {manager && ["in_registrazione", "caricata", "errore"].includes(t.status) && (
                  <Button size="sm" variant="outline" disabled={act.isPending}
                    onClick={() => act.mutate(() => deleteAudioTrack(m.id, t.id))}>
                    <Trash2 className="h-4 w-4 mr-2" />Elimina
                  </Button>
                )}
              </div>
              <Transcript track={t} />
            </li>
          ))}
        </ul>
      )}

      {president && settings && <AiSettingsForm settings={settings} onSaved={refresh} />}

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Informativa sulla registrazione della seduta</DialogTitle>
            <DialogDescription>Versione informativa {settings?.notice_version ?? "v1"}</DialogDescription>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{RECORDING_NOTICE}</p>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={noticeRead} onCheckedChange={(v) => setNoticeRead(v === true)} />
            <span>Ho letto e compreso l'informativa sulla registrazione.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!noticeRead || act.isPending}
              onClick={async () => { await act.mutateAsync(() => setRecordingConsent(m.id, true, settings?.notice_version ?? "v1")); setConsentOpen(false); }}>
              Acconsento alla registrazione
            </Button>
            <Button size="sm" variant="outline" disabled={!noticeRead || act.isPending}
              onClick={async () => { await act.mutateAsync(() => setRecordingConsent(m.id, false, settings?.notice_version ?? "v1")); setConsentOpen(false); }}>
              Non acconsento
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">La scelta è registrata a verbale e può essere modificata in qualunque momento prima o durante la seduta.</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}

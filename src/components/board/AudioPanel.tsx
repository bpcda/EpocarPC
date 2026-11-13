import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mic,
  Square,
  Pause,
  Play,
  Upload,
  Trash2,
  FileAudio,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { downloadBlob } from "@/lib/board-docx";
import {
  BoardRecorder,
  localRecordings,
  localRecordingBlob,
  saveLocalRecording,
  saveLocalChunk,
  removeLocalRecording,
  type LocalRecording,
} from "@/lib/board-recording";
import type { Meeting } from "@/lib/board";
import {
  ATTRIBUTION_LABEL,
  RECORDING_NOTICE,
  TRACK_STATUS,
  currentConsent,
  deleteAudioTrack,
  finishAudioTrack,
  formatDuration,
  loadAudioData,
  saveAiSettings,
  setRecordingConsent,
  startAudioTrack,
  transcribeTrack,
  abortAudioTrack,
  recordingLease,
  setGuestConsent,
  loadAiJobs,
  interruptAiJob,
  type AiSettings,
  type AudioTrack,
} from "@/lib/board-audio";

function Transcript({ track }: { track: AudioTrack }) {
  if (track.status === "errore")
    return (
      <p role="alert" className="text-sm text-destructive">
        Trascrizione non riuscita:{" "}
        {track.transcript_error ?? "errore sconosciuto"}
      </p>
    );
  if (!track.transcript?.length) return null;
  return (
    <ol className="space-y-2 max-h-72 overflow-y-auto border border-border p-3 bg-muted/40">
      {track.transcript.map((s, i) => (
        <li key={i} className="text-sm">
          <span className="text-xs text-muted-foreground">
            {formatDuration(Math.floor(s.start))} ·{" "}
          </span>
          <strong>{s.speaker ?? ATTRIBUTION_LABEL[s.attribution]}</strong>
          {s.speaker && s.attribution !== "verificata" && (
            <span className="text-xs text-muted-foreground">
              {" "}
              ({ATTRIBUTION_LABEL[s.attribution].toLowerCase()})
            </span>
          )}
          <p>{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

function AiSettingsForm({
  settings,
  onSaved,
}: {
  settings: AiSettings;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(settings);
  const save = useMutation({
    mutationFn: () => saveAiSettings(form),
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      onSaved();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito"),
  });
  const set =
    (k: keyof AiSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({
        ...form,
        [k]:
          e.target.type === "number" ? Number(e.target.value) : e.target.value,
      });
  return (
    <div className="border border-border p-4 space-y-3 bg-card">
      <h4 className="font-headline text-xl tracking-wider">Impostazioni IA</h4>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={form.enabled}
          onCheckedChange={(v) => setForm({ ...form, enabled: v === true })}
        />
        <span>
          Servizi IA attivi. La chiave del provider resta nei segreti del server
          e non passa mai dal browser.
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm space-y-1">
          Provider
          <Input value={form.provider} onChange={set("provider")} />
        </label>
        <label className="text-sm space-y-1">
          Modello di trascrizione
          <Input
            value={form.transcription_model}
            onChange={set("transcription_model")}
          />
        </label>
        <label className="text-sm space-y-1">
          Modello di redazione del verbale
          <Input value={form.drafting_model} onChange={set("drafting_model")} />
        </label>
        <label className="text-sm space-y-1">
          Indirizzo API (https)
          <Input value={form.api_base} onChange={set("api_base")} />
        </label>
        <label className="text-sm space-y-1">
          Costo stimato €/min
          <Input
            type="number"
            step="0.0001"
            min="0"
            value={form.cost_per_min_eur}
            onChange={set("cost_per_min_eur")}
          />
        </label>
        <label className="text-sm space-y-1">
          Redazione: €/milione token in ingresso
          <Input
            type="number"
            step="0.000001"
            min="0"
            value={form.draft_input_per_million_eur ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                draft_input_per_million_eur:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label className="text-sm space-y-1">
          Redazione: €/milione token in uscita
          <Input
            type="number"
            step="0.000001"
            min="0"
            value={form.draft_output_per_million_eur ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                draft_output_per_million_eur:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label className="text-sm space-y-1">
          Massimo token della bozza
          <Input
            type="number"
            min="256"
            max="12000"
            value={form.draft_max_tokens}
            onChange={set("draft_max_tokens")}
          />
        </label>
        <label className="text-sm space-y-1">
          Limite di spesa per riunione (€)
          <Input
            type="number"
            step="0.5"
            min="0"
            value={form.max_cost_eur}
            onChange={set("max_cost_eur")}
          />
        </label>
      </div>
      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        Salva impostazioni
      </Button>
    </div>
  );
}

export default function AudioPanel({
  m,
  me,
  president,
  manager,
  active,
  live,
  onRecordingChange,
}: {
  m: Meeting;
  me: string;
  president: boolean;
  manager: boolean;
  active: boolean;
  live: boolean;
  onRecordingChange?: (status: string | null) => void;
}) {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["board-audio", m.id],
    queryFn: () => loadAudioData(m.id),
    refetchInterval: active ? 15000 : false,
  });
  const [consentOpen, setConsentOpen] = useState(false);
  const [noticeRead, setNoticeRead] = useState(false);
  const [recording, setRecording] = useState<{
    trackId: string;
    paused: boolean;
  } | null>(null);
  useEffect(() => {
    onRecordingChange?.(recording ? recording.paused ? "Registrazione in pausa" : "Registrazione in corso" : null);
  }, [recording, onRecordingChange]);
  const [pending, setPending] = useState<LocalRecording[]>([]);
  const [included, setIncluded] = useState<string[]>([]);
  const [sharedEvidence, setSharedEvidence] = useState("");
  const [guestEvidence, setGuestEvidence] = useState("");
  const jobs = useQuery({
    queryKey: ["board-ai-jobs", m.id],
    queryFn: () => loadAiJobs(m.id),
    refetchInterval: active ? 5000 : false,
  });
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<BoardRecorder | null>(null);
  const disposed = useRef(false);
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: ["board-audio", m.id] }),
    [qc, m.id],
  );
  const act = useMutation({
    mutationFn: (f: () => Promise<void>) => f(),
    onSuccess: refresh,
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });

  const refreshLocal = useCallback(
    () =>
      localRecordings(me, m.id)
        .then(setPending)
        .catch(() => toast.error("Archivio audio del browser non disponibile")),
    [me, m.id],
  );
  const uploadLocal = useCallback(
    async (r: LocalRecording) => {
      const blob = await localRecordingBlob(r);
      if (!blob.size) throw new Error("Nessun dato audio recuperato");
      await finishAudioTrack(m.id, r.id, blob, r.seconds);
      await removeLocalRecording(r.id);
      await refreshLocal();
      await refresh();
    },
    [m.id, refreshLocal, refresh],
  );
  const stopRecording = useCallback(async () => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setRecording(null);
    try {
      const r = await rec.stop();
      await refreshLocal();
      await uploadLocal(r);
    } catch (e) {
      await refreshLocal();
      toast.error(
        `${e instanceof Error ? e.message : "Caricamento non riuscito"}. Recupera la copia locale qui sotto.`,
      );
    }
  }, [refreshLocal, uploadLocal]);
  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      const rec = recorder.current;
      recorder.current = null;
      if (rec) void rec.stop().catch(() => {});
    };
  }, []);
  const recordingId = recording?.trackId;
  useEffect(() => {
    if (!recordingId) return;
    let checking = false;
    const timer = setInterval(() => {
      setElapsed(recorder.current?.seconds ?? 0);
      if ((recorder.current?.seconds ?? 0) >= 21600) {
        void stopRecording();
        return;
      }
      if (checking) return;
      checking = true;
      void recordingLease(recordingId)
        .then((valid) => {
          if (!valid) void stopRecording();
        })
        .catch(() => {
          toast.error(
            "Verifica del consenso non disponibile: registrazione fermata",
          );
          void stopRecording();
        })
        .finally(() => {
          checking = false;
        });
    }, 2000);
    return () => clearInterval(timer);
  }, [recordingId, stopRecording]);

  const mine = m.board_meeting_participants.find(
    (p) => p.user_id === me && p.kind === "member",
  );
  const myConsent = mine
    ? currentConsent(data.data?.consents ?? [], mine.id)
    : null;
  const consented = myConsent?.consented ?? false;
  const settings = data.data?.settings ?? null;
  const participantName = (t: AudioTrack) =>
    t.kind === "shared"
      ? "Traccia condivisa"
      : (m.board_meeting_participants.find((p) => p.id === t.participant_id)
          ?.display_name ?? "Componente");

  useEffect(() => {
    if (recordingId && (!live || !mine?.present || !consented))
      void stopRecording();
  }, [recordingId, live, mine?.present, consented, stopRecording]);
  const startRecording = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Questo browser non supporta la registrazione audio");
      return;
    }
    let stream: MediaStream | undefined, trackId: string | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (disposed.current) throw new Error("Registrazione annullata");
      trackId = await startAudioTrack(m.id, "individual");
      if (disposed.current) throw new Error("Registrazione annullata");
      const rec = new BoardRecorder(
        stream,
        {
          id: trackId,
          userId: me,
          meetingId: m.id,
          mime: "audio/webm",
          seconds: 0,
          bytes: 0,
          created: new Date().toISOString(),
        },
        (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Registrazione fermata: errore del dispositivo o dello spazio locale",
          );
          void stopRecording();
        },
      );
      recorder.current = rec;
      await rec.start();
      setRecording({ trackId, paused: false });
      setElapsed(0);
      void refresh();
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      if (trackId) {
        await abortAudioTrack(trackId).catch(() => {});
        await removeLocalRecording(trackId).catch(() => {});
      }
      toast.error(e instanceof Error ? e.message : "Microfono non autorizzato");
    }
  };
  const uploadShared = (file: File) =>
    act.mutate(async () => {
      const { probeAudio } = await import(
        "../../../setup/functions/_shared/board-media"
      );
      const media = await probeAudio(new Uint8Array(await file.arrayBuffer()));
      const trackId = await startAudioTrack(
        m.id,
        "shared",
        included,
        sharedEvidence,
      );
      const r = {
        id: trackId,
        userId: me,
        meetingId: m.id,
        mime: media.mime,
        seconds: media.seconds,
        bytes: file.size,
        created: new Date().toISOString(),
      };
      await saveLocalRecording(r);
      await saveLocalChunk(trackId, 0, file);
      await refreshLocal();
      await uploadLocal(r);
    });

  return (
    <section
      className="border border-border p-5 bg-card space-y-4"
      aria-label="Registrazione e trascrizione"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-headline text-2xl tracking-wider">
          Registrazione e trascrizione
        </h3>
        {recording && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm font-semibold text-destructive"
          >
            <span
              className="inline-block h-3 w-3 rounded-full bg-destructive animate-pulse"
              aria-hidden
            />
            {recording.paused
              ? "Registrazione in pausa"
              : "Registrazione in corso"}{" "}
            · {formatDuration(elapsed)}
          </p>
        )}
      </header>

      {mine && active && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            Consenso alla registrazione:{" "}
            <strong>
              {consented
                ? `prestato (informativa ${myConsent?.notice_version})`
                : "non prestato"}
            </strong>
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNoticeRead(false);
              setConsentOpen(true);
            }}
          >
            {consented
              ? "Revoca o rinnova il consenso"
              : "Leggi l'informativa e decidi"}
          </Button>
        </div>
      )}

      {live && mine?.present && consented && !recording && (
        <Button size="sm" onClick={startRecording} disabled={act.isPending}>
          <Mic className="h-4 w-4 mr-2" />
          Avvia la mia registrazione
        </Button>
      )}
      {recording && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const rec = recorder.current;
              if (!rec) return;
              if (recording.paused) {
                rec.resume();
                setRecording({ ...recording, paused: false });
              } else {
                rec.pause();
                setRecording({ ...recording, paused: true });
              }
            }}
          >
            {recording.paused ? (
              <Play className="h-4 w-4 mr-2" />
            ) : (
              <Pause className="h-4 w-4 mr-2" />
            )}
            {recording.paused ? "Riprendi" : "Sospendi"}
          </Button>
          <Button size="sm" variant="destructive" onClick={stopRecording}>
            <Square className="h-4 w-4 mr-2" />
            Termina e carica
          </Button>
        </div>
      )}

      {!!pending.filter((r) => r.id !== recording?.trackId).length && (
        <div className="border border-border p-3 space-y-2">
          <h4>Audio conservato su questo dispositivo</h4>
          <p className="text-sm">
            Le copie restano nel browser fino al caricamento riuscito. Scaricale
            prima di cancellare i dati del sito o cambiare dispositivo.
          </p>
          {pending
            .filter((r) => r.id !== recording?.trackId)
            .map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  {new Date(r.created).toLocaleString("it-IT")} ·{" "}
                  {formatDuration(r.seconds)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={act.isPending}
                  onClick={() => act.mutate(() => uploadLocal(r))}
                >
                  Riprova caricamento
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    act.mutate(async () =>
                      downloadBlob(
                        await localRecordingBlob(r),
                        `audio-${r.id}.${r.mime.includes("ogg") ? "ogg" : r.mime.includes("wav") ? "wav" : "webm"}`,
                      ),
                    )
                  }
                >
                  Scarica copia locale
                </Button>
              </div>
            ))}
        </div>
      )}
      {manager && live && (
        <details className="border border-border p-3 space-y-3">
          <summary>Carica una registrazione condivisa</summary>
          <p className="text-sm">
            Seleziona tutte le persone udibili. Ogni persona deve essere
            identificata, presente e aver prestato il consenso. La trascrizione
            condivisa non attribuisce automaticamente gli interventi.
          </p>
          {m.board_meeting_participants
            .filter((p) => p.present && p.identified_at)
            .map((p) => (
              <label key={p.id} className="flex gap-2 text-sm">
                <Checkbox
                  checked={included.includes(p.id)}
                  onCheckedChange={(v) =>
                    setIncluded(
                      v
                        ? [...included, p.id]
                        : included.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.display_name} ·{" "}
                {currentConsent(data.data?.consents ?? [], p.id)?.consented
                  ? "consenso presente"
                  : "consenso mancante"}
              </label>
            ))}
          <label className="block text-sm">
            Attestazione: quando è stata acquisita la traccia e come sono stati
            verificati i consensi prima della registrazione
            <Input
              value={sharedEvidence}
              maxLength={1000}
              onChange={(e) => setSharedEvidence(e.target.value)}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <Upload className="h-4 w-4" />
            Audio (WebM, Ogg, WAV o MP3, fino a 25 MB)
            <input
              aria-label="Audio condiviso"
              type="file"
              accept="audio/*"
              disabled={
                !included.length ||
                sharedEvidence.trim().length < 5 ||
                act.isPending
              }
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadShared(f);
                e.target.value = "";
              }}
            />
          </label>
        </details>
      )}
      {manager &&
        active &&
        m.board_meeting_participants.some(
          (p) => p.kind === "guest" && p.present,
        ) && (
          <details className="border border-border p-3 space-y-3">
            <summary>Consenso degli ospiti</summary>
            <p className="text-sm whitespace-pre-wrap">{RECORDING_NOTICE}</p>
            <label className="block text-sm">
              Attestazione della lettura dell'informativa e della risposta
              esplicita dell'ospite
              <Input
                value={guestEvidence}
                maxLength={1000}
                onChange={(e) => setGuestEvidence(e.target.value)}
              />
            </label>
            {m.board_meeting_participants
              .filter((p) => p.kind === "guest" && p.present && p.identified_at)
              .map((p) => (
                <div key={p.id} className="flex flex-wrap gap-2 items-center">
                  <span>{p.display_name}</span>
                  {[true, false].map((consent) => (
                    <Button
                      key={String(consent)}
                      size="sm"
                      variant="outline"
                      disabled={
                        guestEvidence.trim().length < 5 || act.isPending
                      }
                      onClick={() =>
                        act.mutate(() =>
                          setGuestConsent(m.id, p.id, consent, guestEvidence),
                        )
                      }
                    >
                      {consent
                        ? "Registra consenso esplicito"
                        : "Registra diniego o revoca"}
                    </Button>
                  ))}
                </div>
              ))}
          </details>
        )}
      {jobs.data && (
        <div className="space-y-2">
          <p className="text-sm">
            Stima IA cumulata: €{jobs.data.usage.reserved} su €
            {jobs.data.usage.limit}. Comprende trascrizioni, bozze e richieste
            avviate anche se fallite.
          </p>
          {jobs.data.jobs.map((j) => (
            <details key={j.id} className="border border-border p-2 text-sm">
              <summary>
                {j.kind === "draft" ? "Bozza" : "Trascrizione"} · {j.status} · €
                {j.reserved_cost}
              </summary>
              {j.error && <p>{j.error}</p>}
              {j.result && (
                <pre className="whitespace-pre-wrap">{j.result}</pre>
              )}
              {manager &&
                ["reserved", "running"].includes(j.status) &&
                Date.now() - new Date(j.started_at ?? j.created_at).getTime() >
                  600000 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(async () => {
                        await interruptAiJob(j.id);
                        await qc.invalidateQueries({
                          queryKey: ["board-ai-jobs", m.id],
                        });
                      })
                    }
                  >
                    Sblocca richiesta interrotta (la stima avviata resta
                    conteggiata)
                  </Button>
                )}
            </details>
          ))}
        </div>
      )}

      {data.error && (
        <p role="alert" className="text-destructive text-sm">
          Registrazioni non disponibili. Verifica la connessione e riprova.
        </p>
      )}
      {settings && !settings.enabled && (
        <p className="text-sm text-muted-foreground">
          Trascrizione IA disattivata: le registrazioni restano disponibili, il
          verbale si redige manualmente.
        </p>
      )}

      {!!data.data?.tracks.length && (
        <ul className="space-y-3">
          {data.data.tracks.map((t) => (
            <li key={t.id} className="border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <FileAudio className="h-4 w-4" />
                  {participantName(t)} · {formatDuration(t.duration_seconds)}
                </p>
                <span className="text-xs uppercase tracking-widest border border-border px-2 py-1">
                  {TRACK_STATUS[t.status] ?? t.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {manager &&
                  settings?.enabled &&
                  ["caricata", "errore"].includes(t.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => act.mutate(() => transcribeTrack(t.id))}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t.status === "errore"
                        ? "Riprova trascrizione"
                        : "Trascrivi"}
                    </Button>
                  )}
                {manager &&
                  ["in_registrazione", "caricata", "errore"].includes(
                    t.status,
                  ) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate(() => deleteAudioTrack(m.id, t.id))
                      }
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Elimina
                    </Button>
                  )}
              </div>
              <Transcript track={t} />
            </li>
          ))}
        </ul>
      )}

      {president && settings && (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-medium">Impostazioni IA e limiti di spesa</summary>
          <div className="mt-4"><AiSettingsForm settings={settings} onSaved={refresh} /></div>
        </details>
      )}

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Informativa sulla registrazione della seduta
            </DialogTitle>
            <DialogDescription>
              Versione informativa {settings?.notice_version ?? "v1"}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{RECORDING_NOTICE}</p>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={noticeRead}
              onCheckedChange={(v) => setNoticeRead(v === true)}
            />
            <span>Ho letto e compreso l'informativa sulla registrazione.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!noticeRead || act.isPending}
              onClick={async () => {
                await act.mutateAsync(() =>
                  setRecordingConsent(
                    m.id,
                    true,
                    settings?.notice_version ?? "v1",
                  ),
                );
                setConsentOpen(false);
              }}
            >
              Acconsento alla registrazione
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!noticeRead || act.isPending}
              onClick={async () => {
                await act.mutateAsync(() =>
                  setRecordingConsent(
                    m.id,
                    false,
                    settings?.notice_version ?? "v1",
                  ),
                );
                setConsentOpen(false);
              }}
            >
              Non acconsento
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            La scelta è registrata e revocabile. Il diniego non impedisce la
            partecipazione alla seduta.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Headphones, Mic, MicOff, Video, VideoOff, LogOut, Volume2 } from "lucide-react";
import { boardClient, type Meeting } from "@/lib/board";
import type { Room, RemoteTrack } from "livekit-client";

export default function LiveRoomPanel({
  m,
  boardMember,
}: {
  m: Meeting;
  boardMember: boolean;
}) {
  const room = useRef<Room | null>(null),
    container = useRef<HTMLDivElement>(null),
    generation = useRef(0);
  const [status, setStatus] = useState("Disconnesso"),
    [joining, setJoining] = useState(false),
    [connected, setConnected] = useState(false),
    [mic, setMic] = useState(false),
    [camera, setCamera] = useState(false),
    [names, setNames] = useState<string[]>([]),
    [error, setError] = useState("");
  const active =
    boardMember &&
    !m.ended_at &&
    ["CONVOCATO", "IN_CORSO", "SOSPESO"].includes(m.status);
  const leave = () => {
    generation.current++;
    const current = room.current;
    room.current = null;
    void current?.disconnect(true);
    container.current?.replaceChildren();
    setConnected(false);
    setJoining(false);
    setMic(false);
    setCamera(false);
    setNames([]);
    setStatus("Disconnesso");
  };
  useEffect(() => {
    if (!active) leave();
  }, [active]);
  useEffect(
    () => () => {
      generation.current++;
      void room.current?.disconnect(true);
      room.current = null;
    },
    [],
  );
  async function join() {
    const attempt = ++generation.current;
    setJoining(true);
    setError("");
    setStatus("Collegamento in corso");
    try {
      const { data, error: failure } = await boardClient.functions.invoke(
        "board-room",
        { body: { meeting_id: m.id } },
      );
      if (failure) {
        const detail =
          failure.context instanceof Response
            ? await failure.context.json().catch(() => null)
            : null;
        throw new Error(
          detail?.message ?? "Server audio/video non disponibile",
        );
      }
      if (!data?.url || !data?.token)
        throw new Error("Configurazione della stanza incompleta");
      const { Room, RoomEvent, Track } = await import("livekit-client");
      if (attempt !== generation.current) return;
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        publishDefaults: {
          audioPreset: { maxBitrate: 24000 },
          videoEncoding: { maxBitrate: 250000, maxFramerate: 15 },
        },
      });
      room.current = r;
      const elements = new Map<
        RemoteTrack,
        { element: HTMLMediaElement; identity: string }
      >();
      const refresh = () =>
        setNames(
          [r.localParticipant, ...r.remoteParticipants.values()].map(
            (p) => p.name || "Componente",
          ),
        );
      r.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        const element = track.attach();
        if (track.kind === Track.Kind.Video) {
          element.setAttribute(
            "aria-label",
            `Webcam di ${participant.name || "componente"}`,
          );
          element.className = "max-h-48 w-full rounded-lg object-contain bg-black";
        }
        container.current?.appendChild(element);
        elements.set(track, { element, identity: participant.identity });
      });
      r.on(RoomEvent.TrackUnsubscribed, (track) => {
        elements.get(track)?.element.remove();
        elements.delete(track);
        track.detach();
      });
      r.on(RoomEvent.ParticipantConnected, refresh).on(
        RoomEvent.ParticipantDisconnected,
        (p) => {
          for (const [track, item] of elements)
            if (item.identity === p.identity) {
              item.element.remove();
              track.detach();
              elements.delete(track);
            }
          refresh();
        },
      );
      r.on(RoomEvent.Reconnecting, () => setStatus("Riconnessione in corso"));
      r.on(RoomEvent.Reconnected, () => setStatus("Collegato"));
      r.on(RoomEvent.Disconnected, () => {
        if (room.current === r) {
          room.current = null;
          container.current?.replaceChildren();
          setConnected(false);
          setMic(false);
          setCamera(false);
          setStatus("Disconnesso");
        }
      });
      await r.connect(data.url, data.token, { autoSubscribe: true });
      if (attempt !== generation.current) {
        await r.disconnect(true);
        return;
      }
      await r.startAudio();
      refresh();
      setConnected(true);
      setStatus("Collegato");
    } catch (e) {
      if (attempt !== generation.current) return;
      leave();
      setError(e instanceof Error ? e.message : "Collegamento non riuscito");
    } finally {
      if (attempt === generation.current) setJoining(false);
    }
  }
  async function toggle(kind: "mic" | "camera") {
    const r = room.current;
    if (!r) return;
    try {
      if (kind === "mic") {
        await r.localParticipant.setMicrophoneEnabled(!mic);
        setMic(!mic);
      } else {
        await r.localParticipant.setCameraEnabled(!camera);
        setCamera(!camera);
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dispositivo non disponibile");
    }
  }
  if (!active) return null;
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 space-y-4"
      aria-label="Stanza audio e video"
    >
      <header className="space-y-2">
        <h3 className="flex items-center gap-2 text-base font-semibold"><Headphones className="h-5 w-5 text-primary" aria-hidden />Audio e video</h3>
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><span className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-primary" : "bg-muted-foreground"}`} aria-hidden />{status}{connected && status === "Collegato" ? ` · microfono ${mic ? "acceso" : "spento"}` : ""}</p>
      </header>
      <div className={connected ? "grid grid-cols-4 gap-2 xl:grid-cols-2" : "grid gap-2"}>
        {!connected ? (
          <Button className="min-h-11" disabled={joining} onClick={() => void join()}>
            <Headphones className="mr-2 h-4 w-4" aria-hidden />{joining ? "Collegamento…" : "Entra nella stanza"}
          </Button>
        ) : (
          <>
            <Button
              variant={mic ? "default" : "outline"}
              className="h-auto min-h-11 flex-col justify-center gap-1 whitespace-normal px-2 py-2 text-center text-xs xl:flex-row xl:justify-start xl:gap-2 xl:px-3 xl:text-left xl:text-sm"
              aria-label={`${mic ? "Spegni" : "Accendi"} microfono`}
              aria-pressed={mic}
              onClick={() => void toggle("mic")}
            >
              {mic ? <Mic className="h-4 w-4 shrink-0" aria-hidden /> : <MicOff className="h-4 w-4 shrink-0" aria-hidden />}<span className="hidden xl:inline">{mic ? "Spegni" : "Accendi"} microfono</span><span className="xl:hidden">Microfono</span>
            </Button>
            <Button
              variant={camera ? "default" : "outline"}
              className="h-auto min-h-11 flex-col justify-center gap-1 whitespace-normal px-2 py-2 text-center text-xs xl:flex-row xl:justify-start xl:gap-2 xl:px-3 xl:text-left xl:text-sm"
              aria-label={`${camera ? "Spegni" : "Accendi"} webcam`}
              aria-pressed={camera}
              onClick={() => void toggle("camera")}
            >
              {camera ? <Video className="h-4 w-4 shrink-0" aria-hidden /> : <VideoOff className="h-4 w-4 shrink-0" aria-hidden />}<span className="hidden xl:inline">{camera ? "Spegni" : "Accendi"} webcam</span><span className="xl:hidden">Webcam</span>
            </Button>
            <Button variant="outline" aria-label="Esci dalla stanza" className="h-auto min-h-11 flex-col justify-center gap-1 whitespace-normal px-2 py-2 text-center text-xs xl:flex-row xl:justify-start xl:gap-2 xl:px-3 xl:text-left xl:text-sm" onClick={leave}>
              <LogOut className="h-4 w-4 shrink-0" aria-hidden /><span className="hidden xl:inline">Esci dalla stanza</span><span className="xl:hidden">Esci</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto min-h-11 flex-col justify-center gap-1 whitespace-normal px-2 py-2 text-center text-xs xl:flex-row xl:justify-start xl:gap-2 xl:px-3 xl:text-left xl:text-sm"
              aria-label="Abilita ascolto"
              onClick={() =>
                void room.current
                  ?.startAudio()
                  .catch(() =>
                    setError("Abilita la riproduzione audio nel browser"),
                  )
              }
            >
              <Volume2 className="h-4 w-4 shrink-0" aria-hidden /><span className="hidden xl:inline">Abilita ascolto</span><span className="xl:hidden">Ascolto</span>
            </Button>
          </>
        )}
      </div>
      {!!names.length && (
        <div><p className="mb-2 text-xs font-medium text-muted-foreground">Collegati ({names.length})</p><ul className="flex flex-wrap gap-1.5">{names.map((name, index) => <li key={index} className="rounded-full bg-muted px-2.5 py-1 text-xs break-words">{name}</li>)}</ul></div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div ref={container} className="grid gap-3 empty:hidden" />
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Come funziona il collegamento</summary>
        <p className="mt-2 leading-relaxed">Microfono e webcam si attivano su richiesta. Entrare nella stanza non conferma la presenza e non avvia una registrazione. Il collegamento usa il server dell’associazione.</p>
      </details>
    </section>
  );
}

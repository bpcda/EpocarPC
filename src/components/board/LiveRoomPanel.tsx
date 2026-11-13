import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
          element.className = "max-h-48 max-w-full";
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
      setStatus("Collegato · microfono spento");
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
      className="border border-border bg-card p-5 space-y-3"
      aria-label="Stanza audio e video"
    >
      <h3 className="font-headline text-2xl">Audio della seduta</h3>
      <p role="status" className="text-sm">
        {status}
      </p>
      <p className="text-sm">
        Il collegamento usa il server dell’associazione. Microfono e webcam si
        attivano su richiesta; entrare nella stanza non conferma la presenza e
        non avvia una registrazione.
      </p>
      <div className="flex gap-2 flex-wrap">
        {!connected ? (
          <Button disabled={joining} onClick={() => void join()}>
            Entra nella stanza
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              aria-pressed={mic}
              onClick={() => void toggle("mic")}
            >
              {mic ? "Spegni" : "Accendi"} microfono
            </Button>
            <Button
              variant="outline"
              aria-pressed={camera}
              onClick={() => void toggle("camera")}
            >
              {camera ? "Spegni" : "Accendi"} webcam
            </Button>
            <Button variant="outline" onClick={leave}>
              Esci dalla stanza
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void room.current
                  ?.startAudio()
                  .catch(() =>
                    setError("Abilita la riproduzione audio nel browser"),
                  )
              }
            >
              Abilita ascolto
            </Button>
          </>
        )}
      </div>
      {!!names.length && (
        <p className="text-sm">Collegati: {names.join(", ")}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div ref={container} className="flex flex-wrap gap-3" />
    </section>
  );
}

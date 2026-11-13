import type { Room } from "livekit-client";

/** Mix only the authorised, published microphone tracks; never open a second microphone. */
export async function roomRecordingSource(room: Room, identities: string[], onInterrupted: () => void) {
  if (room.state !== "connected") throw new Error("Entra nella stanza prima di registrare");
  const { RoomEvent, Track } = await import("livekit-client");
  const allowed = new Set(identities);
  const context = new AudioContext();
  const output = context.createMediaStreamDestination();
  const sources = new Map<MediaStreamTrack, { source: MediaStreamAudioSourceNode; gain: GainNode }>();
  const refresh = () => {
    const current = new Set<MediaStreamTrack>();
    for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
      if (!allowed.has(participant.identity)) continue;
      for (const publication of participant.audioTrackPublications.values()) {
        const track = publication.track?.mediaStreamTrack;
        if (!track || publication.source !== Track.Source.Microphone || track.readyState === "ended") continue;
        current.add(track);
        let nodes = sources.get(track);
        if (!nodes) {
          const source = context.createMediaStreamSource(new MediaStream([track]));
          const gain = context.createGain();
          source.connect(gain).connect(output);
          nodes = { source, gain };
          sources.set(track, nodes);
        }
        nodes.gain.gain.value = publication.isMuted || !track.enabled || track.muted ? 0 : 1;
      }
    }
    for (const [track, nodes] of sources) if (!current.has(track)) {
      nodes.source.disconnect(); nodes.gain.disconnect(); sources.delete(track);
    }
  };
  const events = [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.LocalTrackPublished,
    RoomEvent.LocalTrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.ParticipantDisconnected];
  for (const event of events) room.on(event, refresh);
  room.on(RoomEvent.Disconnected, onInterrupted).on(RoomEvent.Reconnecting, onInterrupted);
  const timer = setInterval(refresh, 200);
  const close = () => {
    clearInterval(timer);
    for (const event of events) room.off(event, refresh);
    room.off(RoomEvent.Disconnected, onInterrupted).off(RoomEvent.Reconnecting, onInterrupted);
    for (const { source, gain } of sources.values()) { source.disconnect(); gain.disconnect(); }
    output.stream.getTracks().forEach((t) => t.stop());
    void context.close();
  };
  try { await context.resume(); refresh(); } catch (error) { close(); throw error; }
  return { stream: output.stream, close };
}

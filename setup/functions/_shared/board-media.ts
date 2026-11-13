import {
  ALL_FORMATS,
  BufferSource,
  EncodedPacketSink,
  Input,
} from "mediabunny";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
/** Conta la durata dei pacchetti audio, senza fidarsi della durata inviata dal browser. */
export async function probeAudio(bytes: Uint8Array) {
  if (bytes.length < 16 || bytes.length > MAX_AUDIO_BYTES)
    throw new Error("File audio vuoto o oltre 25 MB");
  const magic = new TextDecoder().decode(bytes.subarray(0, 12));
  const format =
    magic.startsWith("RIFF") && magic.slice(8) === "WAVE"
      ? { extension: "wav", mime: "audio/wav" }
      : magic.startsWith("OggS")
        ? { extension: "ogg", mime: "audio/ogg" }
        : bytes[0] === 0x1a &&
            bytes[1] === 0x45 &&
            bytes[2] === 0xdf &&
            bytes[3] === 0xa3
          ? { extension: "webm", mime: "audio/webm" }
          : magic.startsWith("ID3") ||
              (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
            ? { extension: "mp3", mime: "audio/mpeg" }
            : null;
  if (!format) throw new Error("Usa un file WAV, WebM, Ogg o MP3 valido");
  const input = new Input({
    source: new BufferSource(bytes),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("Il file non contiene audio");
    let seconds = 0,
      count = 0;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      if (
        !Number.isFinite(packet.duration) ||
        packet.duration < 0 ||
        ++count > 2000000
      )
        throw new Error("Durata audio non verificabile");
      seconds += packet.duration;
      if (seconds > 21600) throw new Error("Audio oltre sei ore");
    }
    if (seconds <= 0) throw new Error("Durata audio non verificabile");
    return { ...format, seconds: Math.ceil(seconds) };
  } finally {
    input.dispose();
  }
}

"""Local Italian transcription; stdout contains only the validated segment array."""
import json
import sys
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, _ = model.transcribe(sys.argv[1], language="it", vad_filter=True)
result = [{"start": s.start, "end": s.end, "text": s.text.strip(),
           "speaker": None, "attribution": "non_attribuita"}
          for s in segments if s.text.strip()]
if not result:
    raise ValueError("Nessun parlato riconosciuto: integrare il verbale manualmente")
print(json.dumps(result, ensure_ascii=False))

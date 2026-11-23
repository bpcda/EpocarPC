import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ShootingSlot {
  id: string;
  day: string;
  starts: string;
  capacity: number;
  duration_minutes?: number;
}

interface SlotPlan {
  start: string;
  end: string;
  count: number;
  duration: number;
}

const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const toTime = (minutes: number) =>
  [Math.floor(minutes / 60), minutes % 60].map(part => String(part).padStart(2, "0")).join(":");

export function slotLabel(slot: ShootingSlot) {
  return `${slot.starts.slice(0, 5)}–${toTime(toMinutes(slot.starts) + (slot.duration_minutes ?? 15))}`;
}

export default function ShootingSlotGenerator({ slots, save }: {
  slots: ShootingSlot[];
  save: (plan: SlotPlan) => void;
}) {
  const first = slots[0];
  const last = slots[slots.length - 1];
  const [start, setStart] = useState(first?.starts.slice(0, 5) ?? "18:30");
  const [end, setEnd] = useState(last ? toTime(toMinutes(last.starts) + (last.duration_minutes ?? 15)) : "19:45");
  const [count, setCount] = useState(String(slots.length || 5));
  const [duration, setDuration] = useState(String(first?.duration_minutes ?? 15));
  const total = Number(count);
  const minutes = Number(duration);
  const from = toMinutes(start);
  const to = toMinutes(end);
  const valid = Number.isInteger(total) && total >= 1 && total <= 100 &&
    Number.isInteger(minutes) && minutes >= 1 && minutes <= 240 &&
    from + total * minutes <= to;
  const preview = valid ? Array.from({ length: total }, (_, i) => {
    const begin = from + i * minutes;
    return `${toTime(begin)}–${toTime(begin + minutes)}`;
  }) : [];

  return <form className="space-y-3 border p-4" onSubmit={event => {
    event.preventDefault();
    if (valid) save({ start, end, count: total, duration: minutes });
  }}>
    <h4 className="font-semibold">Genera slot della serata</h4>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label>Dalle<Input type="time" required value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>Fino alle<Input type="time" required value={end} onChange={e => setEnd(e.target.value)} /></label>
      <label>Numero di slot<Input type="number" required min="1" max="100" value={count} onChange={e => setCount(e.target.value)} /></label>
      <label>Minuti per slot<Input type="number" required min="1" max="240" value={duration} onChange={e => setDuration(e.target.value)} /></label>
    </div>
    <p className="text-sm">Gli slot partono dall’orario iniziale e si susseguono senza pause. L’eventuale tempo residuo resta libero.</p>
    {valid ? <p className="text-sm">Anteprima · {preview.join(" · ")}</p> :
      <p role="status" className="text-sm">Scegli una fascia che contenga tutti gli slot per la durata indicata.</p>}
    <Button type="submit" disabled={!valid}>Genera e salva slot</Button>
  </form>;
}

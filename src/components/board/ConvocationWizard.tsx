import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AGENDA_KINDS, BOARD_ROLE_LABEL, draftProblem, loadBoardMembers, memberName, MODE_LABEL, type Meeting, type MeetingDraft } from "@/lib/board";
import { convocationRows } from "@/lib/board-docx";

const STEPS = ["Informazioni", "Partecipanti", "Verbalizzante", "Ordine del giorno", "Conferma"];
const sel = "w-full h-10 border border-input bg-background px-3 text-sm";
let seq = 0;
const key = () => `n${++seq}`;

const toLocalInput = (iso: string) => {
  const d = new Date(iso); const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

export function draftFrom(m?: Meeting): MeetingDraft {
  if (!m) return { scheduled_at: "", mode: "presenza", location: "", video_link: "", description: "", urgency_reason: "", minute_taker_id: "", agenda: [], guests: [] };
  return {
    scheduled_at: toLocalInput(m.scheduled_at), mode: m.mode, location: m.location ?? "", video_link: m.video_link ?? "",
    description: m.description ?? "", urgency_reason: m.urgency_reason ?? "", minute_taker_id: m.minute_taker_id ?? "",
    agenda: m.board_agenda_items.map((a) => ({ key: key(), kind: a.kind, title: a.title, description: a.description ?? "", proposal: a.proposal ?? "" })),
    guests: m.board_meeting_participants.filter((p) => p.kind === "guest").map((p) => ({ name: p.display_name })),
  };
}

function AgendaRow({ item, onChange, onRemove }: { item: MeetingDraft["agenda"][number]; onChange: (v: Partial<MeetingDraft["agenda"][number]>) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.key });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="border border-border p-3 bg-card space-y-2">
      <div className="flex gap-2 items-center">
        <button type="button" aria-label="Trascina per riordinare" className="cursor-grab text-muted-foreground" {...attributes} {...listeners}><GripVertical className="h-5 w-5" /></button>
        <Input aria-label="Titolo del punto" placeholder="Titolo" value={item.title} onChange={(e) => onChange({ title: e.target.value })} />
        <select aria-label="Tipo del punto" className={sel + " max-w-56"} value={item.kind} onChange={(e) => onChange({ kind: e.target.value })}>
          {Object.entries(AGENDA_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button type="button" variant="ghost" size="icon" aria-label="Rimuovi punto" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <Textarea placeholder="Descrizione (facoltativa)" value={item.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} />
      {["deliberazione", "questione_economica", "ammissione_associati", "approvazione_documento"].includes(item.kind) && (
        <Textarea placeholder="Proposta di deliberazione (facoltativa)" value={item.proposal} onChange={(e) => onChange({ proposal: e.target.value })} rows={2} />
      )}
    </li>
  );
}

export default function ConvocationWizard({ open, onOpenChange, initial, onSubmit }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial?: Meeting;
  onSubmit: (d: MeetingDraft, convene: boolean) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<MeetingDraft>(() => draftFrom(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const members = useQuery({ queryKey: ["board-members"], queryFn: loadBoardMembers, enabled: open });
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const set = (v: Partial<MeetingDraft>) => setD((p) => ({ ...p, ...v }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = d.agenda.findIndex((a) => a.key === active.id), to = d.agenda.findIndex((a) => a.key === over.id);
    set({ agenda: arrayMove(d.agenda, from, to) });
  };
  const submit = async (convene: boolean) => {
    const problem = draftProblem(d);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    try { await onSubmit(d, convene); setStep(0); onOpenChange(false); }
    catch (e) { setErr(e instanceof Error ? e.message : "Operazione non riuscita"); }
    finally { setBusy(false); }
  };
  const preview: Meeting = {
    id: "", meeting_number: null, meeting_year: null, scheduled_at: d.scheduled_at ? new Date(d.scheduled_at).toISOString() : new Date().toISOString(),
    location: d.location || null, mode: d.mode, video_link: d.video_link || null, description: d.description || null, urgency_reason: d.urgency_reason || null,
    status: "DRAFT", status_reason: null, minute_taker_id: d.minute_taker_id || null, board_meeting_participants: [],
    board_agenda_items: d.agenda.map((a, i) => ({ id: a.key, position: i + 1, kind: a.kind, title: a.title, description: a.description || null, proposal: a.proposal || null })),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-headline tracking-wider text-3xl">{initial ? "Modifica convocazione" : "Convoca Consiglio Direttivo"}</DialogTitle></DialogHeader>
        <ol className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
          {STEPS.map((s, i) => <li key={s}><button type="button" onClick={() => setStep(i)} className={`px-2 py-1 border ${i === step ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>{i + 1}. {s}</button></li>)}
        </ol>

        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="when">Data e ora di inizio</Label><Input id="when" type="datetime-local" value={d.scheduled_at} onChange={(e) => set({ scheduled_at: e.target.value })} /></div>
            <div><Label htmlFor="mode">Modalità</Label>
              <select id="mode" className={sel} value={d.mode} onChange={(e) => set({ mode: e.target.value as MeetingDraft["mode"] })}>
                {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            {d.mode !== "remoto" && <div className="sm:col-span-2"><Label htmlFor="loc">Luogo</Label><Input id="loc" value={d.location} onChange={(e) => set({ location: e.target.value })} /></div>}
            {d.mode !== "presenza" && <div className="sm:col-span-2"><Label htmlFor="link">Link alla videoconferenza</Label><Input id="link" placeholder="https://" value={d.video_link} onChange={(e) => set({ video_link: e.target.value })} /></div>}
            <div className="sm:col-span-2"><Label htmlFor="desc">Descrizione (facoltativa)</Label><Textarea id="desc" value={d.description} onChange={(e) => set({ description: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label htmlFor="urg">Eventuale urgenza e motivazione</Label><Input id="urg" value={d.urgency_reason} onChange={(e) => set({ urgency_reason: e.target.value })} /></div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Tutti i componenti in carica sono convocati automaticamente con diritto di voto e non possono essere esclusi.</p>
            {members.isLoading ? <p role="status">Caricamento…</p> : members.error ? <p className="text-destructive">Elenco non disponibile.</p> : (
              <ul className="divide-y divide-border border border-border">
                {(members.data ?? []).map((m) => <li key={m.user_id} className="p-3 flex justify-between"><span>{memberName(m)}</span><span className="text-sm text-muted-foreground">{m.roles.map((r) => BOARD_ROLE_LABEL[r] ?? r).join(" · ")}</span></li>)}
              </ul>
            )}
            <div>
              <h4 className="font-headline tracking-wider text-xl mb-2">Invitati esterni (senza diritto di voto)</h4>
              {d.guests.map((g, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <Input aria-label="Nome invitato" value={g.name} onChange={(e) => set({ guests: d.guests.map((x, j) => j === i ? { name: e.target.value } : x) })} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Rimuovi invitato" onClick={() => set({ guests: d.guests.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => set({ guests: [...d.guests, { name: "" }] })}>+ Aggiungi invitato</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <Label htmlFor="mt">Verbalizzante</Label>
            <select id="mt" className={sel} value={d.minute_taker_id} onChange={(e) => set({ minute_taker_id: e.target.value })}>
              <option value="">Da designare</option>
              {(members.data ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}{m.roles.includes("secretary") ? " (Segretario)" : ""}</option>)}
            </select>
            <p className="text-sm text-muted-foreground mt-2">Il verbalizzante vota solo se è anche consigliere in carica.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={d.agenda.map((a) => a.key)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {d.agenda.map((a, i) => <AgendaRow key={a.key} item={a}
                    onChange={(v) => set({ agenda: d.agenda.map((x, j) => j === i ? { ...x, ...v } : x) })}
                    onRemove={() => set({ agenda: d.agenda.filter((_, j) => j !== i) })} />)}
                </ul>
              </SortableContext>
            </DndContext>
            <Button type="button" variant="outline" onClick={() => set({ agenda: [...d.agenda, { key: key(), kind: "discussione", title: "", description: "", proposal: "" }] })}>+ Aggiungi punto</Button>
          </div>
        )}

        {step === 4 && (
          <div className="border border-border p-5 space-y-3 text-sm bg-card">
            <p className="font-semibold">Oggetto: Convocazione del Consiglio Direttivo EPOCAR</p>
            <p>Il Presidente, ai sensi dell’art. 17 dello Statuto, convoca il Consiglio Direttivo dell’Associazione EPOCAR alle condizioni di seguito indicate.</p>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-1">{convocationRows(preview).map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></Fragment>)}</dl>
            <p className="font-semibold">Ordine del giorno</p>
            <ol className="list-decimal pl-6">{preview.board_agenda_items.map((a) => <li key={a.id}>{a.title || "(senza titolo)"} — {AGENDA_KINDS[a.kind]}</li>)}</ol>
          </div>
        )}

        {err && <p role="alert" className="text-destructive text-sm">{err}</p>}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Indietro</Button>
          <div className="flex gap-2">
            {step < 4 ? <Button type="button" onClick={() => setStep(step + 1)}>Avanti</Button> : <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => submit(false)}>Salva {initial && initial.status !== "DRAFT" ? "modifiche" : "bozza"}</Button>
              {(!initial || initial.status === "DRAFT") && <Button type="button" disabled={busy} onClick={() => submit(true)}>Conferma e convoca</Button>}
            </>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

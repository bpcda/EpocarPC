import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MEMBER_CATEGORIES, cardNo, euro, memberDues, saveMember } from "@/lib/treasury";
import { ErrorBox, Loading, PageHeader, Panel, StatusBadge, fmtDate, selectCls, useRefreshTreasury, useSessionDraft, useTreasuryData, useTreasuryYear, useUnsavedGuard } from "@/components/treasury/shared";

type Form = { full_name: string; member_number: string; email: string; category: (typeof MEMBER_CATEGORIES)[number]; admission_date: string; notes: string };
const inp = "h-11 text-base md:text-sm";

export default function MemberForm() {
  const year = useTreasuryYear();
  const { id } = useParams();
  const isNew = id === "nuovo";
  const navigate = useNavigate();
  const refresh = useRefreshTreasury();
  const { data, error, isLoading } = useTreasuryData(year);
  const draft = useSessionDraft<Form>(`member-${id}`);
  const [v, setV] = useState<Form | null>(null);
  const [initial, setInitial] = useState("");
  const [busy, setBusy] = useState(false);
  const m = data?.members.find((x) => x.id === id);

  useEffect(() => {
    if (v || !data) return;
    const base: Form = { full_name: m?.full_name ?? "", member_number: m?.member_number ?? "", email: m?.email ?? "", category: (m?.category as Form["category"]) ?? "Ordinario", admission_date: m?.admission_date ?? "", notes: m?.notes ?? "" };
    setInitial(JSON.stringify(base));
    setV(draft.read() ?? base);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!v && JSON.stringify(v) !== initial;
  const canLeave = useUnsavedGuard(dirty && !busy);
  useEffect(() => { if (dirty && v) draft.write(v); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data || !v) return <Loading />;
  if (!isNew && !m) return <ErrorBox error={new Error("Socio non trovato.")} />;
  const back = `/tesoreria/quote/${year}`;
  const due = m ? memberDues(data, year).find((d) => d.member.id === m.id) : null;
  const pays = m ? data.transactions.filter((t) => t.member_id === m.id) : [];
  const set = (p: Partial<Form>) => setV({ ...v, ...p });
  const submit = async () => {
    setBusy(true);
    try { await saveMember(v, isNew ? null : id!); draft.clear(); setInitial(JSON.stringify(v)); await refresh(); toast.success("Socio salvato"); navigate(isNew ? back : `/tesoreria/quote/${year}/socio/${id}`, { replace: true }); }
    catch (e) { toast.error(e instanceof Error && !e.message.startsWith("[") ? e.message : "Controlla i campi"); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader back={back} crumbs={[{ label: "Quote", to: "/tesoreria/quote" }, { label: String(year), to: back }, { label: isNew ? "Nuovo socio" : m!.full_name }]} title={isNew ? "Nuovo socio" : m!.full_name} subtitle={!isNew && due ? <>{cardNo(m!) ? `Tessera n. ${cardNo(m!)} · ` : ""}Esercizio {year} · <StatusBadge status={due.status} /></> : undefined} />
      <div className="grid lg:grid-cols-[1fr_20rem] gap-4 max-w-5xl">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Panel title="Anagrafica">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2"><Label>Cognome e nome *</Label><Input className={inp} required maxLength={120} value={v.full_name} onChange={(e) => set({ full_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Numero tessera</Label><Input className={inp} readOnly disabled value={m && cardNo(m) ? cardNo(m)! : "Assegnato automaticamente al salvataggio"} /></div>
              <div className="space-y-1.5"><Label>Categoria *</Label><select className={selectCls} value={v.category} onChange={(e) => set({ category: e.target.value as Form["category"] })}>{MEMBER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Email (facoltativa)</Label><Input className={inp} type="email" maxLength={254} value={v.email} onChange={(e) => set({ email: e.target.value })} />
                <p className="text-xs text-muted-foreground">{m?.user_id ? "Account del sito collegato: riceve automaticamente il ruolo della categoria." : "Se esiste un account del sito con questa email viene collegato al salvataggio. Senza account il socio resta comunque in anagrafica."}</p></div>
              <div className="space-y-1.5"><Label>Data ammissione</Label><Input className={inp} type="date" value={v.admission_date} onChange={(e) => set({ admission_date: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Note</Label><Textarea className="text-base md:text-sm" maxLength={1000} value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
            </div>
          </Panel>
          <div className="sticky bottom-16 md:bottom-0 z-20 -mx-4 md:mx-0 border-t border-border bg-background/95 px-4 py-3 flex gap-3 justify-end">
            <Button type="button" variant="outline" className="h-12 flex-1 sm:flex-none" onClick={() => { if (canLeave()) { draft.clear(); setV(null); navigate(back); } }}>Annulla</Button>
            <Button type="submit" className="h-12 flex-[2] sm:flex-none sm:px-8" disabled={busy}>{busy ? "Salvataggio…" : "Salva socio"}</Button>
          </div>
        </form>
        {due && (
          <Panel title={`Quota ${year}`}>
            <p className="text-sm">Dovuta {euro(due.due)} · Versato {euro(due.paid)}</p>
            <ul className="mt-3 space-y-1 text-sm">{pays.map((t) => <li key={t.id}><Link className="underline" to={`/tesoreria/movimenti/${t.id}`}>{fmtDate(t.transaction_date)} · {euro(t.amount)}</Link></li>)}</ul>
            {due.residual > 0 && data.years.find((y) => y.year === year)?.status === "open" && <Button asChild className="h-11 w-full mt-3"><Link to={`/tesoreria/movimenti/nuovo?anno=${year}&socio=${m!.id}`}>Registra pagamento</Link></Button>}
          </Panel>
        )}
      </div>
    </>
  );
}

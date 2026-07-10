import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Trash2 } from "lucide-react";
import type { FormField } from "@/lib/form-fields";

interface EventOption {
  id: string;
  title: string;
  form_fields: FormField[] | null;
}

interface Registration {
  id: string;
  event_id: string;
  user_id: string | null;
  vehicle_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  answers: Record<string, { label: string; type: string; value: unknown }> | null;
  created_at: string;
}

interface VehicleInfo {
  id: string;
  type: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  user_id: string;
}

interface ProfileInfo {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

function formatVehicle(v?: VehicleInfo | null): string {
  if (!v) return "—";
  const parts = [v.brand, v.model, v.year].filter(Boolean).join(" ");
  const label = parts || v.type || "Veicolo";
  return v.plate ? `${label} (${v.plate})` : label;
}

function answerToText(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default function RegistrationsTab() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [regs, setRegs] = useState<Registration[]>([]);
  const [vehiclesById, setVehiclesById] = useState<Record<string, VehicleInfo>>({});
  const [profilesByUser, setProfilesByUser] = useState<Record<string, ProfileInfo>>({});

  useEffect(() => {
    supabase
      .from("events")
      .select("id, title, form_fields")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          const list = data as unknown as EventOption[];
          setEvents(list);
          if (list.length > 0 && !selectedEvent) setSelectedEvent(list[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRegs = async (eventId: string) => {
    const { data } = await supabase
      .from("event_registrations")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    const list = (data as unknown as Registration[]) || [];
    setRegs(list);

    // Also pull vehicles referenced directly OR by any "vehicle" answer field
    const vehicleIds = new Set<string>();
    list.forEach((r) => {
      if (r.vehicle_id) vehicleIds.add(r.vehicle_id);
      Object.values(r.answers || {}).forEach((a) => {
        if (a?.type === "vehicle" && typeof a.value === "string") vehicleIds.add(a.value);
      });
    });
    const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean) as string[]));

    const [vRes, pRes] = await Promise.all([
      vehicleIds.size
        ? supabase.from("vehicles").select("id, type, brand, model, year, plate, user_id").in("id", Array.from(vehicleIds))
        : Promise.resolve({ data: [] as VehicleInfo[] }),
      userIds.length
        ? supabase.from("profiles").select("user_id, first_name, last_name, phone").in("user_id", userIds)
        : Promise.resolve({ data: [] as ProfileInfo[] }),
    ]);
    const vMap: Record<string, VehicleInfo> = {};
    (vRes.data as VehicleInfo[] | null)?.forEach((v) => (vMap[v.id] = v));
    setVehiclesById(vMap);
    const pMap: Record<string, ProfileInfo> = {};
    (pRes.data as ProfileInfo[] | null)?.forEach((p) => (pMap[p.user_id] = p));
    setProfilesByUser(pMap);
  };

  useEffect(() => {
    if (selectedEvent) fetchRegs(selectedEvent);
  }, [selectedEvent]);

  const currentEvent = events.find((e) => e.id === selectedEvent);
  const fields = (currentEvent?.form_fields as FormField[]) || [];
  const nonVehicleFields = fields.filter((f) => f.type !== "vehicle");

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questa iscrizione?")) return;
    await supabase.from("event_registrations").delete().eq("id", id);
    fetchRegs(selectedEvent);
  };

  const nameFor = (r: Registration): string => {
    if (r.guest_name) return r.guest_name;
    if (r.user_id) {
      const p = profilesByUser[r.user_id];
      const full = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      return full || "Utente registrato";
    }
    return "—";
  };

  const vehicleFor = (r: Registration): VehicleInfo | null => {
    if (r.vehicle_id && vehiclesById[r.vehicle_id]) return vehiclesById[r.vehicle_id];
    for (const a of Object.values(r.answers || {})) {
      if (a?.type === "vehicle" && typeof a.value === "string" && vehiclesById[a.value]) {
        return vehiclesById[a.value];
      }
    }
    return null;
  };

  const exportCsv = () => {
    if (!currentEvent) return;
    const headers = ["Data", "Nome", "Email", "Veicolo", ...nonVehicleFields.map((f) => f.label)];
    const rows = regs.map((r) => {
      const name = nameFor(r);
      const email = r.guest_email || "";
      const date = new Date(r.created_at).toLocaleString("it-IT");
      const vehicle = formatVehicle(vehicleFor(r));
      const answers = nonVehicleFields.map((f) => answerToText(r.answers?.[f.id]?.value));
      return [date, name, email, vehicle, ...answers].map(csvEscape).join(",");
    });
    const csv = [headers.map(csvEscape).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iscrizioni-${currentEvent.title.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-md">
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona un evento" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={regs.length === 0}>
          <Download className="h-4 w-4 mr-1" />
          Export CSV
        </Button>
        <span className="text-sm text-muted-foreground">{regs.length} iscrizioni</span>
      </div>

      {regs.length === 0 ? (
        <p className="text-muted-foreground text-sm py-12 text-center">
          Nessuna iscrizione per questo evento.
        </p>
      ) : (
        <div className="border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Veicolo</TableHead>
                {nonVehicleFields.map((f) => (
                  <TableHead key={f.id}>{f.label}</TableHead>
                ))}
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {regs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">
                    {new Date(r.created_at).toLocaleString("it-IT")}
                  </TableCell>
                  <TableCell>{nameFor(r)}</TableCell>
                  <TableCell>{r.guest_email || "—"}</TableCell>
                  <TableCell className="text-sm">{formatVehicle(vehicleFor(r))}</TableCell>
                  {nonVehicleFields.map((f) => (
                    <TableCell key={f.id} className="text-sm">
                      {answerToText(r.answers?.[f.id]?.value)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
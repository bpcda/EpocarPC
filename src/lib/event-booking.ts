import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { BookingInput, VehicleSnapshot } from "./event-booking-schema";

export interface EventBooking {
  id: string; reference: string; event_id: string; user_id: string | null;
  mode: "without_vehicle" | "with_vehicle"; first_name: string; last_name: string; email: string; phone: string;
  participants: number; drive: boolean; exhibition: boolean; vehicles: VehicleSnapshot[];
  email_status: "pending" | "sent" | "failed"; account_requested: boolean; garage_saved_at: string | null; created_at: string;
}
export interface BookingReceipt { ok: true; id: string; reference: string; email_status: string; account_requested: boolean; }
async function invoke<T>(body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke("event-booking", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try { const details = await error.context.json(); throw new Error(details.message || "Prenotazione non riuscita. Riprova."); }
      catch (cause) { if (cause instanceof Error && cause.name !== "SyntaxError") throw cause; }
    }
    throw new Error("Servizio prenotazioni non disponibile. Riprova più tardi.");
  }
  if (!data?.ok) throw new Error(data?.message || "Operazione non riuscita");
  return data as T;
}
export const submitBooking = (booking: BookingInput) => invoke<BookingReceipt>({ action: "book", booking });
export const claimBooking = (id: string) => invoke<{ ok: true; saved: number }>({ action: "claim", booking_id: id });
export const resendBooking = (id: string) => invoke<BookingReceipt>({ action: "resend", booking_id: id });

// The schema is installed independently on the external instance; generated types stay untouched.
type BookingQuery = { select: (s: string) => { eq: (k: string, v: string) => { order: (k: string) => { range: (a: number, b: number) => Promise<{ data: EventBooking[] | null; error: { message: string } | null }> } } } };
export async function loadEventBookings(eventId: string): Promise<EventBooking[]> {
  const client = supabase as unknown as { from: (table: string) => BookingQuery };
  const result: EventBooking[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("event_bookings").select("*").eq("event_id", eventId).order("created_at").range(offset, offset + 499);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return result;
  }
}
export function bookingTotals(bookings: EventBooking[]) {
  return bookings.reduce((a, b) => ({ reservations: a.reservations + 1, people: a.people + b.participants, vehicles: a.vehicles + b.vehicles.length,
    drive: a.drive + (b.drive ? b.vehicles.length : 0), exhibition: a.exhibition + (b.exhibition ? b.vehicles.length : 0) }), { reservations: 0, people: 0, vehicles: 0, drive: 0, exhibition: 0 });
}
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function bookingsCsv(bookings: EventBooking[], vehicles = false) {
  const headers = vehicles ? ["Prenotazione", "Veicolo", "Tipo", "Marca", "Modello", "Anno", "Targa", "Giro", "Esposizione"]
    : ["Prenotazione", "Data", "Nome", "Cognome", "Email", "Telefono", "Modalità", "Persone", "Veicoli", "Giro", "Esposizione", "Email riepilogo"];
  const rows = bookings.flatMap(b => vehicles ? b.vehicles.map((v, i) => [b.reference, i + 1, v.type, v.brand, v.model, v.year, v.plate, b.drive ? "Sì" : "No", b.exhibition ? "Sì" : "No"])
    : [[b.reference, b.created_at, b.first_name, b.last_name, b.email, b.phone, b.mode === "with_vehicle" ? "Con veicolo" : "Senza veicolo", b.participants, b.vehicles.length, b.drive ? "Sì" : "No", b.exhibition ? "Sì" : "No", b.email_status]]);
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
}
export function downloadBookingsCsv(bookings: EventBooking[], vehicles: boolean) {
  const url = URL.createObjectURL(new Blob([bookingsCsv(bookings, vehicles)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = vehicles ? "veicoli-evento.csv" : "prenotazioni-evento.csv"; a.click(); URL.revokeObjectURL(url);
}
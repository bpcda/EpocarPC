import { z } from "zod";

export const bookingSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  programme: z.string().trim().max(8000).default(""),
  price_without: z.string().trim().max(120).default(""),
  price_with: z.string().trim().max(120).default(""),
  max_people: z.number().int().min(1).max(100000).nullable().default(null),
  max_vehicles: z.number().int().min(1).max(100000).nullable().default(null),
  people_per_booking: z.number().int().min(1).max(100).default(10),
  vehicles_per_booking: z.number().int().min(1).max(100).default(10),
  drive_enabled: z.boolean().default(true),
  exhibition_enabled: z.boolean().default(true),
  privacy_text: z.string().trim().max(12000).default(""),
  privacy_version: z.string().trim().max(100).default(""),
  account_terms: z.string().trim().max(12000).default(""),
  account_terms_version: z.string().trim().max(100).default(""),
});
export type BookingSettings = z.infer<typeof bookingSettingsSchema>;
export const defaultBookingSettings = bookingSettingsSchema.parse({});
export const vehicleSnapshotSchema = z.object({
  garage_id: z.string().uuid().nullable().default(null),
  type: z.enum(["auto", "moto", "vespa"]),
  brand: z.string().trim().min(1, "Inserisci la marca").max(100),
  model: z.string().trim().min(1, "Inserisci il modello").max(100),
  year: z.coerce.number().int().min(1886).max(2100),
  plate: z.string().trim().min(1, "Inserisci la targa").max(20).regex(/^[A-Za-z0-9 .-]+$/, "Targa non valida").transform(v => v.toUpperCase()),
});
export const bookingSchema = z.object({
  event_id: z.string().uuid(),
  idempotency_key: z.string().uuid(),
  mode: z.enum(["without_vehicle", "with_vehicle"]),
  first_name: z.string().trim().min(1, "Inserisci il nome").max(100),
  last_name: z.string().trim().min(1, "Inserisci il cognome").max(100),
  email: z.string().trim().email("Email non valida").max(254).transform(v => v.toLowerCase()),
  phone: z.string().trim().min(6, "Telefono non valido").max(30).regex(/^[+\d ()\-.]+$/, "Telefono non valido"),
  participants: z.number().int().min(1).max(100),
  drive: z.boolean(),
  exhibition: z.boolean(),
  vehicles: z.array(vehicleSnapshotSchema).max(100),
  privacy_accepted: z.literal(true, { errorMap: () => ({ message: "Accetta l’informativa privacy" }) }),
  privacy_version: z.string().trim().min(1).max(100),
  account_requested: z.boolean(),
  account_terms_accepted: z.boolean(),
  account_terms_version: z.string().trim().max(100),
  password: z.string().min(8, "Usa almeno 8 caratteri per la password").max(128).optional(),
}).superRefine((b, ctx) => {
  if (b.mode === "with_vehicle" && !b.vehicles.length) ctx.addIssue({ code: "custom", path: ["vehicles"], message: "Inserisci almeno un veicolo" });
  if (b.mode === "without_vehicle" && (b.vehicles.length || b.drive || b.exhibition || b.account_requested)) ctx.addIssue({ code: "custom", message: "La partecipazione senza veicolo non include veicoli, attività motoristiche o creazione account" });
  if (b.account_requested && (!b.account_terms_accepted || !b.account_terms_version)) ctx.addIssue({ code: "custom", path: ["account_terms_accepted"], message: "Accetta le condizioni di creazione account" });
  const plates = b.vehicles.map(v => v.plate.replace(/[ .-]/g, ""));
  if (new Set(plates).size !== plates.length) ctx.addIssue({ code: "custom", path: ["vehicles"], message: "Lo stesso veicolo è indicato più volte" });
});
export type BookingInput = z.infer<typeof bookingSchema>;
export type VehicleSnapshot = z.infer<typeof vehicleSnapshotSchema>;
export const emptyVehicle = (): VehicleSnapshot => ({ garage_id: null, type: "auto", brand: "", model: "", year: 0, plate: "" });
export function vehicleHasData(v: VehicleSnapshot) { return !!(v.garage_id || v.brand || v.model || v.year || v.plate); }
export function settingsFrom(value: unknown): BookingSettings {
  const parsed = bookingSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { ...defaultBookingSettings };
}
import { slotLabel, type ShootingSlot } from "@/components/admin/ShootingSlotGenerator";

export function calendarDraft(slot: ShootingSlot, location: string) {
  const day = slot.day.replace(/-/g, "");
  const dates = slotLabel(slot).split("–").map(time => day + "T" + time.replace(":", "") + "00").join("/");
  const params = new URLSearchParams({ action: "TEMPLATE", text: "Natale su Ruote · Shooting EPOCAR", dates, ctz: "Europe/Rome", location });
  return "https://calendar.google.com/calendar/render?" + params;
}

import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ShootingSlot } from "@/components/admin/ShootingSlotGenerator";

interface Evening {day:string;meeting_place:string;policy_version:string;privacy_text:string;image_text:string;accepting:boolean;cancelled:boolean}
interface RequestRow {id:string;assigned_day:string|null;first_name:string;last_name:string;email:string;day:string;kind:string;brand:string;model:string;notes:string;preferred:string;state:string;revision:number;slot_id:string;appointment:string;image_permission:boolean;delivery_state:string}
interface Agenda {evenings:Evening[];slots:ShootingSlot[];requests:RequestRow[]}
const db: SupabaseClient = supabase;
async function agenda():Promise<Agenda> {
  const result = await db.rpc("shooting_agenda");
  if (result.error) throw new Error("Agenda non disponibile");
  return result.data;
}

export function useShootingAgenda(owner: string | undefined) {
  return useQuery({ queryKey: ["shooting-agenda", owner], queryFn: agenda, enabled: !!owner, gcTime: 0 });
}

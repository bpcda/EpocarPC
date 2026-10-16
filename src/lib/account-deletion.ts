import { supabase } from "@/integrations/supabase/client";

export const DELETE_PHRASE = "ELIMINA IL MIO ACCOUNT";
export const ADMIN_DELETE_PHRASE = "ELIMINA ACCOUNT";

export interface AccountStatus {
  exists: boolean;
  application_status: string | null;
  is_member: boolean;
  is_admin: boolean;
  last_admin: boolean;
}

export type DeletionResult = { outcome: "deleted" | "already_deleted"; application_outcome?: string; is_member?: boolean };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("delete-account", { body });
  if (error) {
    let msg = "Operazione non riuscita. Riprova più tardi.";
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error === "last_admin") msg = "Non puoi eliminare l'ultimo amministratore del sistema.";
      else if (payload?.error === "forbidden") msg = "Non sei autorizzato a eliminare questo account.";
      else if (payload?.error === "schema_not_ready") msg = "Eliminazione temporaneamente non disponibile: il servizio richiede un aggiornamento. Nessun dato è stato modificato da questa richiesta.";
    } catch { /* keep generic */ }
    throw new Error(msg);
  }
  return data as T;
}

/** Self-delete never sends a user id: the server derives it from the session. */
export const accountStatus = (targetUserId?: string) =>
  call<AccountStatus>(targetUserId ? { dry_run: true, target_user_id: targetUserId } : { dry_run: true });
export const deleteMyAccount = () => call<DeletionResult>({});
export const adminDeleteAccount = (targetUserId: string) => call<DeletionResult>({ target_user_id: targetUserId });

export function describeStatus(s: AccountStatus | null): "member" | "pending" | "draft" | "user" {
  if (!s) return "user";
  if (s.is_member) return "member";
  if (s.application_status === "submitted" || s.application_status === "review") return "pending";
  if (s.application_status === "draft") return "draft";
  return "user";
}

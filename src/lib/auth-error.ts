// Do not serialize the error: responses may contain sensitive request details.
export function authErrorMessage(error: unknown): string {
  const details = typeof error === "object" && error !== null
    ? error as { message?: unknown; code?: unknown; status?: unknown }
    : {};
  const message = typeof details.message === "string" ? details.message.trim() : "";
  if (message && message !== "{}" && message !== "[]" && message !== "null") return message;

  const code = typeof details.code === "string" && /^[a-z0-9_]{1,80}$/i.test(details.code)
    ? details.code : null;
  const status = typeof details.status === "number" && Number.isInteger(details.status)
    && details.status >= 100 && details.status <= 599 ? details.status : null;
  const reference = [code, status ? `HTTP ${status}` : null].filter(Boolean).join(" · ");
  return `Il servizio di accesso ha restituito un errore senza descrizione${reference ? ` (${reference})` : ""}. Non è possibile confermare l’esito dell’operazione. Se hai appena tentato la registrazione, controlla prima se hai ricevuto l’email di conferma.`;
}
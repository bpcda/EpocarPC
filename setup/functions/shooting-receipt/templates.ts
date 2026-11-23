type Kind = "receipt" | "confirmed" | "moved" | "cancelled" | "rain";
const copy: Record<Kind, [string, string]> = {
  receipt: ["Richiesta ricevuta", "Abbiamo ricevuto la tua richiesta per lo shooting gratuito di Natale su Ruote. Ti scriveremo quando data e orario saranno confermati."],
  confirmed: ["Ci vediamo allo shooting", "Il tuo appuntamento è confermato. Ti aspettiamo a Piacenza con il tuo veicolo."],
  moved: ["Il tuo nuovo appuntamento", "Abbiamo aggiornato l’appuntamento per lo shooting. Qui trovi i nuovi dettagli."],
  cancelled: ["Appuntamento annullato", "La tua richiesta per lo shooting è stata annullata. Per informazioni puoi contattare EPOCAR."],
  rain: ["Serata annullata per pioggia", "Le condizioni meteo ci impediscono di svolgere lo shooting in sicurezza. La tua partecipazione a questa serata è annullata."],
};
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function shootingEmail(kind: Kind, id: string, day: string, appointment?: string, previous?: string) {
  const [title, intro] = copy[kind];
  const details = [
    ...(appointment ? [["Appuntamento", appointment]] : []),
    ...(previous ? [["Appuntamento precedente", previous]] : []),
    ...(!appointment && !previous ? [["Serata richiesta", day.split("-").reverse().join("/")]] : []),
    ["Riferimento", id],
  ];
  return {
    subject: `Natale su Ruote · ${title}`,
    textContent: [title, intro, ...details.map(([name, value]) => name + ": " + value), "EPOCAR · Piacenza"].join("\n\n"),
    htmlContent: `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f5f2ef;color:#512020;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ddd4cc;text-align:left"><tr><td style="background:#512020;color:#f5f2ef;padding:24px 28px;font-weight:bold;letter-spacing:3px">EPOCAR</td></tr><tr><td style="padding:28px"><p style="font-size:12px;letter-spacing:2px">NATALE SU RUOTE · PIACENZA</p><h1 style="font-family:'Arial Narrow',Arial,sans-serif;font-size:32px;line-height:1.08">${title}</h1><p style="line-height:1.65">${intro}</p><div style="border-left:4px solid #512020;background:#f5f2ef;padding:4px 18px">${details.map(([name,value]) => `<p style="overflow-wrap:anywhere"><small>${name}</small><br><strong>${escape(value)}</strong></p>`).join("")}</div><p style="margin-top:28px"><a style="color:#512020" href="https://epocarpc.com/natale-su-ruote/shooting/richiesta">Consulta le tue richieste su EPOCAR</a></p></td></tr></table></td></tr></table></body></html>`,
  };
}

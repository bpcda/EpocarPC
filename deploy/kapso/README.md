# WhatsApp del Consiglio — Kapso EpocarPC

Integrazione per avvisi richiesti sui documenti pronti. Il messaggio contiene solo un link al sito: nessun audio, trascrizione o verbale viene inviato a WhatsApp. L'accesso ai documenti continua a richiedere l'account autorizzato.

- Progetto: `EpocarPC`, `bc79a4e0-d0dd-4f58-8a69-6c5576b1919c`.
- Config WhatsApp: `e6aae30a-d1af-4304-9a8f-15d4d9742f3b`.
- Phone number ID: `1429452350257851`, numero `+1 207-739-3195`, stato verificato `CONNECTED`.
- WABA: `1579813613903261`.
- Template: `epocar_documenti_consiglio_pronti`, ID `1158489426637710`, lingua `it`, categoria richiesta `UTILITY`. Creato il 13/11/2026; stato iniziale `PENDING`.

La CLI globale è condivisa con altri usi dell'utente. Ogni comando di questa integrazione passa `--project` e `--phone-number-id` espliciti. Il collegamento locale `.kapso/project.json` è ignorato da Git; nessuna chiave viene inclusa nel frontend o nel repository. La CLI già autenticata usa OAuth: non occorre esportare la chiave API per questo percorso locale. Non usare `kapso projects use` per cambiare la selezione globale.

## Verifica e attivazione

```bash
rtk proxy kapso status
rtk proxy kapso whatsapp numbers resolve --project bc79a4e0-d0dd-4f58-8a69-6c5576b1919c --phone-number '+12077393195' --output json
rtk proxy kapso whatsapp templates get 1158489426637710 --project bc79a4e0-d0dd-4f58-8a69-6c5576b1919c --phone-number-id 1429452350257851 --output json
```

Per il primo collaudo occorrono template approvato e un destinatario indicato esplicitamente dall'utente. Il numero connesso è il mittente, non il destinatario. Non scegliere destinatari dalla rubrica o dalla cronologia per deduzione.

Sul sito, presidente o verbalizzante apre «Verbale → Collegamento del PC e avvisi WhatsApp», indica facoltativamente il proprio numero internazionale e collega il PC. Il file contiene un token revocabile della sola routine e la destinazione degli avvisi; importarlo nella [routine locale](../../docs/board-codex-routine.md), senza incollarlo in chat o commetterlo in Git.

Al completamento del lavoro, la routine invia il template tramite CLI con progetto e mittente fissati nel codice. Nessun messaggio viene inviato se manca il destinatario. Un errore di invio non annulla né rigenera i documenti; non si ritenta automaticamente un invio dall'esito incerto, per evitare duplicati. L'accettazione API non è una conferma di lettura/consegna. In questo rilascio non servono webhook, inbox incorporata o bot conversazionale.

Riprodurre il payload con `notifyPayload` in `scripts/board-worker.mjs`; il comando CLI usa `--stdin`, così il corpo non viene inserito nella riga di comando. Prima di un invio manuale verificare nuovamente progetto, mittente e destinatario autorizzato.

Riferimenti della skill applicata: [integrate-whatsapp](https://github.com/gokapso/agent-skills). Condizioni e tariffe del servizio restano quelle del proprio account Kapso/WhatsApp; questa integrazione non presume invii gratuiti o illimitati.

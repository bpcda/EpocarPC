# Prenotazioni Epocar × Mossi — installazione esterna e revisione

## Stato
Codice preparato, nessun deployment o modifica al database/account/eventi reali. Il percorso precedente rimane per gli eventi senza `booking_settings.enabled`. Non è stata creata una nuova domanda associativa né modificata la Tesoreria.

## Cosa comprende
- Partecipazione senza veicolo prima di quella con veicolo; dati personali, persone, schede veicolo indipendenti, giro ed esposizione separati, conferma prima di eliminare schede compilate.
- Profilo e garage esclusivamente dell’utente autenticato; nessuna ricerca pubblica per email. Bozza temporanea nella sessione del browser, scadenza 30 minuti e rimozione dopo conferma; consensi da confermare al ritorno.
- Riepilogo e riferimento univoco, prenotazione singola con snapshot e persone conteggiate una sola volta, capienze e retry in transazione con lock evento.
- Richiesta account esplicita separata dalla privacy evento. Nessuna password nel modulo prenotazione, nessun consenso promozionale. L’attivazione è un magic link/OTP tramite il servizio Auth esistente, valido anche quando la conferma email ordinaria è disattivata. Per email già presenti accede allo stesso account, senza duplicazione.
- Garage permanente solo dopo claim protetto: proprietario già autenticato oppure email corrispondente e JWT validato con metodo OTP. Il claim è idempotente e deduplica le targhe normalizzate per utente. Nessun ruolo associativo assegnato.
- Admin/staff: lettura completa paginata, totali prenotazioni/persone/veicoli/attività, CSV separati protetti da formule e reinvio email. Non è previsto eliminare prenotazioni da questo nuovo pannello.

## Ordine di installazione — esclusivamente progetto esterno
1. Revisionare `setup/events-booking-v20.sql`, eseguire prima su un ambiente di prova con lo schema reale, poi installare manualmente. Estende `events` e usa `profiles`, `vehicles`, `user_roles`, `has_role` esistenti; non richiede le fasi Consiglio. GRANT/RLS espliciti, nessun trigger o vincolo disabilitato. Il blocco conclude con COMMIT perché è un’installazione di schema, non una correzione dati reali.
2. Copiare **entrambi** i file di `setup/functions/event-booking/` nella directory `supabase/functions/event-booking/` del progetto esterno. Sono tenuti in setup per evitare deployment automatici nel progetto Lovable non corrispondente. Distribuire `event-booking` con verifica gateway JWT disattivata per permettere ospiti: i token utente sono validati nel codice, le operazioni riservate richiedono sessione e autorizzazione server.
3. Verificare le variabili server già fornite dal servizio (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`): mai nel browser o nella chat.
4. Impostare nel servizio esterno `EVENT_SITE_ORIGIN` all’origine HTTPS effettiva del sito (nessuna barra finale). Autorizzare gli URL di ritorno `/eventi/*/iscrizione` nel servizio Auth e verificare il template magic link. Non cambiare globalmente la conferma email. Il link include `claim` e deve conservare questo parametro; verificare AMR `otp` dopo il ritorno. Se manca, il claim fallisce in sicurezza.
5. Riepilogo via SMTP: configurare in segreti server `EVENT_SMTP_HOST`, `EVENT_SMTP_PORT` (default 465), `EVENT_SMTP_SECURE` (`false` per STARTTLS su 587), `EVENT_SMTP_USER`, `EVENT_SMTP_PASS`, `EVENT_EMAIL_FROM`. Queste impostazioni sono separate dall’SMTP Auth usato per attivazione. Riutilizzare lo stesso provider funzionante, se appropriato. Nodemailer usa npm nel runtime Deno; l’invio reale e la compatibilità SMTP restano da verificare nell’ambiente esterno.
6. Distribuire il frontend. In amministrazione creare una bozza evento, attivare form interno e prenotazioni con/senza veicoli; consentire ospiti. Inserire titolo, data/orari, luogo, programma, prezzi e limiti. Inserire informativa privacy approvata/versione e condizioni account/versione. Senza privacy non si abilita il percorso. La fotografia mockup Mossi.jpeg non è una copertina; usare un’immagine autorizzata.
7. Pubblicare l’evento solo dopo le prove sotto. Nessuna data, prezzo o capienza provvisoria è stata inserita nel database.

## Contratto
`supabase.functions.invoke('event-booking', {body})`:
- `action: book`, `booking`: campi validati in `src/lib/event-booking-schema.ts`; chiave UUID idempotente, nessun user_id client. Identità da JWT sul server.
- `action: claim`, `booking_id`: richiede sessione verificata; nessuna email/account bersaglio accettati dal client.
- `action: resend`, `booking_id`: richiede ruolo admin o staff letto dal server.
- Successo prenotazione: `ok:true`, `id`, `reference`, `email_status`, `activation_status`, `account_requested`; `replayed:true` nei retry. Email `pending/sent/failed`, attivazione `not_requested/pending/sent/failed`. `sent` significa invio accettato dal servizio, non consegna al destinatario.
- Errori leggibili e CORS su tutte le risposte. Errore email non annulla prenotazione. Un reinvio non ricrea una prenotazione. Errori/credenziali del provider non sono serializzati.

## Prove richieste prima dell’apertura
Le prove automatiche usano dati sintetici e PostgreSQL temporaneo, il percorso browser usa risposte simulate; non equivalgono a una prova sul progetto esterno.
- Ospite senza veicolo, con tre veicoli, attività singole/entrambe, riduzione schede confermata/annullata, privacy e termini mancanti.
- Accesso e ritorno al modulo con bozza conservata; profilo/garage proprietario e targa da completare; nuova targa e targa già presente.
- Email nuova e già registrata: attivazione/claim solo dal link, nessun duplicato account, token scaduto o non OTP bloccato.
- Retry dopo perdita della risposta; payload identico recupera la stessa prenotazione, payload cambiato si ferma.
- Ultimi posti in due richieste concorrenti, limiti persone e veicoli; accesso anonimo ai dati negato e altri utenti senza visibilità.
- SMTP funzionante e fallimento controllato, reinvio staff/admin, link di ritorno e AMR OTP; prenotazione valida anche se posta fallisce.
- Export oltre 500 righe, persone non duplicate, CSV separati, formule neutralizzate.

### Limiti residui
Invio SMTP/Auth e account reali non verificabili qui; serve la tua installazione. Nessun sistema anti-abuso è stato aggiunto: valutare la protezione del servizio pubblico prima di aprirlo a traffico elevato. Reinvii contemporanei possono inviare più di una mail pur senza duplicare la prenotazione. I limiti sono vincolanti sul server, non una promessa di posti in tempo reale nel modulo. L’eventuale rimozione account non deve cancellare lo snapshot storico: il nuovo `user_id` non ha FK Auth, va considerato nella politica di conservazione/privacy e nel flusso esterno di cancellazione.

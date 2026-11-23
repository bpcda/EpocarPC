# EPOCAR · Piano di integrazione shooting e collaborazioni

Documento decisionale del 23 novembre 2026. Prima serata giovedì 3 dicembre, seconda giovedì 17 dicembre. Tutti gli orari operativi sono in Europe/Rome.

## A. Executive summary

Per il 3 dicembre serve un registro privato di richieste per veicolo, con agenda controllata da EPOCAR, conferme individuali via email e regole chiare su chi può comparire nelle foto. Consiglio di costruirlo nel sito esistente, sul progetto Supabase esterno, usando Auth, garage, dashboard e trasporto SMTP già previsti. La preferenza non occupa posti. Solo la conferma di un amministratore impegna capacità. Con cinque partenze da 15 minuti per serata, i dieci slot totali sono finestre di lavoro: il numero effettivo di veicoli dipende da pause e gruppi autorizzati.

P0 comprende l’intero ciclo manuale, incluso il maltempo. P1 aggiunge Calendar e pubblicazione selettiva delle immagini. P2 introduce la raccolta pubblica delle proposte commerciali con appuntamenti concordati individualmente. Il rilascio P0 è subordinato alle prove di recapito e autorizzazione, alla disponibilità degli operatori e ai testi approvati.

## B. Stato attuale

La tabella descrive il checkout analizzato. La presenza di una funzione o migrazione nel repository documenta il contratto previsto. Installazione, configurazione, ruoli effettivi e recapito nella specifica istanza esterna richiedono verifica in staging.

| Area | Evidenza nel repository | Riutilizzo e limiti |
|---|---|---|
| Applicazione | `package.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`: SPA React/TypeScript, Vite, React Router, provider di query e notifiche. Pagine pubbliche, account e dashboard sotto lo stesso router. | Estendere rotte e navigazione. Tailwind, componenti shadcn/Radix in `src/components/ui`, Navbar, Footer e PageMeta per continuità grafica e accessibilità. |
| Backend e dati | Client in `src/integrations/supabase/client.ts`, PostgreSQL, Storage, Auth, Edge Functions Deno. `supabase/migrations/` contiene lo schema storico. `setup/` ospita SQL esterno revisionato, `setup/functions/` le funzioni destinate all’istanza esterna. Vedere `AGENTS.md` e `docs/mossi-event-booking.md`. | Migrazione additiva da revisionare su staging. Accertare il progetto destinatario e verificare i grant. Il frontend usa anche contratti validati separati dai tipi generati. |
| Identità | `src/pages/Auth.tsx`, `src/hooks/use-auth.ts`, `src/lib/auth-navigation.ts`, `src/components/UserProtectedRoute.tsx`: password, registrazione, OAuth Google, sessione e ritorno locale con next. La guardia conserva il pathname. | Usare un percorso fisso dopo il login. L’email di conferma account segue il redirect configurato in Auth. Il login Google non conferisce accesso a Calendar. |
| Profili e garage | `src/pages/Account.tsx`, migrazione `supabase/migrations/20260710000845_819d82ed-3e39-4f17-8119-1e3f677553c4.sql`: profiles per user_id, vehicles per proprietario, tipo, marca, modello, anno, targa, foto e note. Anno e targa possono mancare. Storage dei veicoli con URL firmati. | Leggere solo i campi necessari del garage personale. Targa obbligatoria sullo shooting. Una foto o una nota privata del garage non serve alla prenotazione. |
| Autorizzazioni | `src/components/ProtectedRoute.tsx`, `src/pages/AdminDashboard.tsx`, user_roles e has_role. Esistono differenti privilegi per admin, staff, consiglio e tesoreria. | Usare la dashboard esistente con visibilità admin e controllo server su ogni operazione. Alcuni pannelli eventi danno accesso anche allo staff: la nuova abilitazione va deliberata separatamente. |
| Eventi | `src/pages/EventoIscrizione.tsx`, `EventRegistrationForm.tsx` e `EventBookingForm.tsx` in src/components, `src/lib/event-booking{,-schema}.ts`, `src/components/admin/EventBookingsPanel.tsx`, `setup/events-booking-v20.sql`. Percorso avanzato opzionale, capienze, lock, riferimento, idempotenza, snapshot e verifica garage. | Riprendere schemi Zod, query per proprietario e pattern RPC. Il contratto Mossi comprende ospiti, persone, giro/esposizione, creazione account e conteggio in fase d’invio. Un adattamento diretto altererebbe le semantiche. |
| Email e contatti | `setup/functions/event-booking/index.ts` invia un riepilogo testuale con Nodemailer/SMTP, aggiorna pending/sent/failed, permette reinvio e usa Auth OTP per attivazione. `src/pages/Contatti.tsx` offre già “Collaborazioni” con mailto. | Estrarre trasporto e gestione errori. Servono nuovi template per stato e un meccanismo di consegna concorrente. Il percorso mailto non crea un fascicolo amministrativo. Provider effettivo, quote e recapito non verificati. |
| Privacy e media | Il booking conserva testo/versione e timestamp privacy. `setup/membership-application-v7.sql` distingue dichiarazioni. `src/components/admin/GalleryTab.tsx` pubblica oggetti nel bucket gallery e righe gallery_images. `supabase/functions/gallery-list/index.ts` serve metadati paginati con cache HTTP. | Riprendere versionamento e gallery per copie approvate. Mancano nel percorso gallery verifiche di liberatoria riferite a ogni persona e immagine. |
| Altre integrazioni | `src/lib/cms.ts`, `deploy/strapi/`: contenuti editoriali con fallback. `src/lib/member-wallet.ts`, `setup/functions/member-wallet/`: percorso tessere digitali. | CMS per eventuale presentazione editoriale. Nel codice esaminato non emerge un connettore operativo Calendar/Meet, né un'agenda shooting o una coda generale di email con deduplica. Le credenziali di altri servizi Google non sono un prerequisito riutilizzabile. |

Assunzioni di progetto da validare: una postazione fotografica a Piacenza, utenti con email raggiungibile, almeno un admin operativo per serata, disponibilità di staging e SMTP. Nessuna deduzione sullo stato di produzione dai soli file.

## C. Architettura proposta

Browser → Edge Function → RPC PostgreSQL. La funzione risolve l'identità, valida il comando e limita gli abusi. La RPC applica vincoli e transizioni e scrive nello stesso commit stato, audit e lavori di comunicazione. Un consumatore separato invia la posta o aggiorna Calendar dopo il commit. Il database determina sempre quale appuntamento è valido. Il browser riceve riferimento e stato anche durante un disservizio del provider.

Due aggregati distinti: richiesta shooting con veicolo e assegnazione, proposta sponsor con note e appuntamento facoltativo. Condividere trasporto, coda, audit, gestione errori e componenti di filtro/paginazione. Tenere separati stati, permessi, schemi dei comandi e template. Per P0 basta un consumatore richiamabile subito dopo il commit e un recupero periodico autenticato dei lavori pendenti. Verificarne l’attivazione sul progetto esterno. In emergenza l'admin vede il da inviare e registra l'esito di un contatto individuale manuale.

## D. Database

Nomi proposti. PK UUID salvo specifiche, istanti timestamptz, audit e timestamp assegnati dal server. Nessun dato reale nei fixture.

| Tabella | Campi, relazioni e vincoli principali |
|---|---|
| shooting_evenings | id, local_date univoca, tz, opens_at, ends_at, luogo, stato aperta/chiusa/annullata, revision. Seed operativo revisionato per le due date. Chiusa ferma le nuove richieste, annullata impedisce anche nuove conferme. |
| shooting_slots | id, evening_id FK, inizio/fine, capacità positiva predefinita 1, bloccato, gruppo/nota operativa corta, revision. Contenimento nella finestra della serata, fine > inizio. Con una postazione impedire sovrapposizioni di intervalli [inizio,fine) nella stessa serata sotto lock della serata. Indice (evening_id, inizio). |
| shooting_requests | id, riferimento pubblico opaco univoco, user_id, evening_id preferita, email di contatto verificata, nome dal profilo, preferenza, note limitate, richiesta di gruppo, stato, slot_id FK nullable, revision, created_at, updated_at. Una riga per veicolo. CHECK confermata richiede slot e gli altri stati slot nullo. Data definitiva derivata dallo slot, preferenza originaria intatta. Indici (user_id,created_at), (evening_id,stato), slot_id. |
| shooting_request_vehicles | request_id PK/FK, garage_id FK nullable ON DELETE SET NULL, tipo, marca, modello, anno nullable, targa normalizzata privata. Snapshot immutabile attraverso le API ordinarie, anche se cambia il garage. Indice tipo/marca/modello per i filtri. Limitare la proiezione della targa. Per duplicati attivi usare chiave derivata server da serata richiesta + proprietario + targa normalizzata, con indice univoco parziale nella richiesta sui record attivi. Evitare copie in chiaro della targa per l'indice. |
| policy_versions / request_permissions | Testi immutabili con finalità, versione univoca per finalità, lingua, testo/hash, validità. Evidenza per richiesta, soggetto o codice liberatoria, ruolo firmatario, presa visione o scelta esplicita, canali, versione FK, data, eventuale revoca e riferimento a prova privata. Modifiche come eventi datati. Nessun documento d’identità raccolto per default. |
| sponsor_requests | id, riferimento, nome completo, azienda, email normalizzata, tipo enumerato, messaggio, stato, riferimento all'informativa/versione vista e istante, revision e timestamp. Indice (stato,tipo,created_at,id). Note interne in sponsor_notes con FK, autore e data, escluse da qualsiasi risposta pubblica. |
| sponsor_appointments | id, sponsor_request_id FK, inizio/fine, fuso, stato, modalità, Meet URL privato se disponibile, revision. Un appuntamento attivo per proposta tramite indice parziale. Registrare creazione/modifica dopo accordo manuale. |
| command_receipts / audit_events | Chiave idempotente univoca per azione, attore e ambito, impronta del payload canonico, esito/riferimento, scadenza. Audit append-only con dominio, id, azione, attore, transizione/revisione, istante. Indice (dominio,id,istante). Escludere corpi, indirizzi e targhe. |
| delivery_jobs / calendar_links | Job con FK al record di dominio, canale, template, versione logica, destinatario per riferimento, tentativi, stato, next_attempt, lease_until, codice esito. UNIQUE per evento logico, canale e destinatario. Indice parziale sui pendenti. Mapping Calendar con calendario, oggetto locale, event_id remoto univoco per calendario, etag e revisione sincronizzata. FK esplicite e CHECK di esclusività per riferimenti alternativi. |

Strategia migratoria futura: script SQL additivi separati in setup per P0, P1 e P2. Preflight su tabelle/ruoli/Storage e versione esterna, revisione dei grant, prova ripetuta su DB isolato e staging. Nessuna modifica richiesta a event_bookings o al CMS. Conservare i dati raccolti se si disabilita la funzionalità: spegnere apertura, consumer esterni e link pubblici in modo controllato, lasciando disponibile gestione delle richieste già ricevute.

## E. Backend

| Comando Edge proposto | Identità e contratto |
|---|---|
| shooting.submit / mine | JWT validato con Auth. In submit accettare serata, preferenza, scelta garage o veicolo nuovo, salvataggio esplicito, note, versioni e decisioni, UUID di retry. Ignorare identità inviate dal client. Verificare serata aperta, proprietà veicolo, contatto disponibile e policy correnti. Rispondere con riferimento e “in attesa”. Mine legge solo le proprie richieste. |
| shooting.admin.list / detail / agenda | Ruolo admin verificato sul server. Paginazione stabile, filtri autorizzati, intervalli e proiezioni limitate. Targa completa solo in dettaglio operativo con accesso tracciato. |
| shooting.admin.confirm / move / cancel / cancelEvening | Richiedere revision attesa e chiave comando. Transazione unica con slot/capienza, richiesta, cronologia e messaggi. Conflitto di revisione o posto esaurito → 409 e agenda aggiornata. Annullamento serata blocca nuovi invii e invalida tutte le pendenti/confermate coinvolte. |
| sponsor.submit | Pubblico, schema chiuso, limiti e antispam prima della persistenza. Ricevuta generica con riferimento. Due lavori distinti per notifica EPOCAR e ricevuta visitatore. Nessuna ricerca pubblica per email o riferimento. |
| sponsor.admin.* | Admin verificato per lista/dettaglio, cambio stato, note, creazione/modifica appuntamento e invio dettagli. Audit per ogni mutazione. |
| delivery.process / retry | Consumatore server autenticato. L'admin può ritentare una consegna fallita per riferimento. Destinazione e template derivano dal record, nessun relay a indirizzi arbitrari. |

Concorrenza: prendere lock delle serate coinvolte in ordine di ID, quindi degli slot vecchio/nuovo e delle richieste in ordine stabile. Ricontrollare revisioni, stato, capacità e sovrapposizioni al commit. Una modifica collettiva della finestra di uno slot cambia gli appuntamenti di tutti i suoi occupanti: mostrare l’impatto e registrare un avviso per ciascuno. Se un solo partecipante cambia ora, spostare la sua assegnazione. Rifiutare due impegni sovrapposti per lo stesso partecipante, salvo più veicoli esplicitamente raggruppati nel medesimo slot e compatibili con la logistica. Cambio serata solo con accordo dell’interessato. Per maltempo trattare le confermate secondo la serata assegnata e le pendenti secondo quella richiesta. Il primo commit prevale su invii/conferme simultanei; nessuna mail di conferma obsoleta deve partire dopo la cancellazione.

Idempotenza: stessa chiave, attore e contenuto restituiscono l’esito originale, contenuto diverso genera conflitto. Anche due chiavi diverse non devono confermare due volte la stessa revisione. Per sponsor anonimo associare il retry a un nonce opaco del modulo con scadenza. Limitare la risposta ai dati minimi. Errori 400 di campo, 401 sessione, 403 permesso, 409 conflitto, 429 attesa e 503 temporaneo, con messaggi italiani e codice di correlazione.

## F. Frontend

**Shooting.** Pagina informativa pubblica proposta `/natale-su-ruote/shooting`, con pulsante verso `/natale-su-ruote/shooting/richiesta` protetto da UserProtectedRoute. Il login o la registrazione riconducono al percorso fisso prima di inserire targa e note. Usare profilo e email verificata per il riepilogo. Un veicolo per invio, comando “Richiedi per un altro veicolo” e elenco personale con riferimento, stato e assegnazione definitiva. Nel form mostrare solo le due serate aperte, preferenza di orario oppure “indifferente”, garage personale oppure inserimento manuale, targa richiesta, salvataggio opzionale inizialmente disattivato, note e richiesta gruppo. Escludere dati sensibili da URL, analytics e bozze persistenti. Errori associati ai campi, focus sul primo errore, riepilogo prima dell’invio, esito persistente anche se il toast scompare.

Testo essenziale da validare: «Shooting gratuito a Piacenza il 3 o il 17 dicembre 2026, indicativamente tra le 18:30 e le 19:45. Ogni sessione dura circa 15 minuti. La targa serve per organizzare accessi ed eventuali permessi. Indica l’orario che preferisci: la tua richiesta resta in attesa. EPOCAR ti comunicherà via email data e ora definitive. In caso di pioggia la serata potrà essere annullata. Useremo le immagini per promuovere Natale su Ruote e le attività EPOCAR nei limiti delle autorizzazioni raccolte». Mostrare informativa e scelte immagini separatamente, senza caselle preselezionate.

**Sponsor.** Da Contatti e dalla voce Collaborazioni aprire `/sponsor-e-collaborazioni`. Form pubblico con nome e cognome, azienda/attività, email, una tipologia tra Sponsorizzazione, Collaborazione, Organizzazione evento, Altro, messaggio libero, informativa versionata e presa visione. Richiedere tutti i campi indicati, con limiti proposti di 150 caratteri per nome e azienda, 254 per email e 3.000 per messaggio. Dopo invio mostrare ricevuta e spiegare che EPOCAR contatterà il richiedente se interessata. Nessun selettore di disponibilità.

## G. Pannello amministrativo

**Shooting P0.** Due viste nella dashboard: lista richieste e agenda per serata. Filtri per data richiesta/assegnata, stato, tipo/marca/modello. In dettaglio: partecipante, veicolo, preferenza, note di gruppo e autorizzazioni da verificare. Nell’agenda mostrare orario locale, veicoli assegnati, capacità, posti residui e blocchi. Finestre iniziali 18:30, 18:45, 19:00, 19:15, 19:30 con fine 19:45. Nessun margine implicito: l’operatore può bloccare una finestra, ridurre capacità, ripianificare o estendere la serata entro limiti approvati. Vietare riduzioni sotto l’occupazione esistente. Gruppo = più veicoli nello stesso slot con capacità aumentata esplicitamente. La preferenza e la somiglianza dei veicoli aiutano il filtro. L'operatore sceglie ogni assegnazione.

Stati P0: in attesa → confermata oppure annullata, confermata → confermata con revisione oppure annullata. Annullata terminale; una nuova richiesta ha un nuovo riferimento. Azioni individuali con anteprima email e modifica proposta. Azione maltempo con serata, conteggio interessati, conferma esplicita e monitor degli invii. Nessun indirizzo condiviso fra destinatari. P1 può aggiungere vista affiancata delle serate e verifica immagini.

**Sponsor P2.** Coda filtrabile per tipologia e stato, dettaglio, note riservate, transizioni datate. Nuova → in valutazione → contattata → appuntamento fissato → chiusa. Consentire chiusura anticipata e ritorno a contattata per appuntamento annullato. Indicazione separata per invito inviato/sincronizzazione fallita. L’operatore concorda data e ora, registra l’appuntamento e invia i dettagli verificati.

## H. Integrazioni

**Garage.** Con garage_id il server rilegge il record del proprietario e ne copia i soli dati organizzativi. Se manca la targa l’utente la completa per quella richiesta. Correggere il garage richiede scelta esplicita. Per un mezzo nuovo, salvare solo lo snapshot oppure, se richiesto, inserire/riusare il veicolo del proprietario nella stessa transazione. Normalizzare spazi, punti, trattini e maiuscole, validare formato flessibile per mezzi storici/esteri, rifiutare risultato vuoto. Serializzare i salvataggi concorrenti del nuovo flusso per proprietario e targa, verificare duplicati preesistenti prima di proporre vincoli globali sul garage. In caso di più corrispondenze chiedere selezione senza fusioni automatiche. Riutilizzare le parti di vehicleSnapshotSchema compatibili: il garage ammette anno assente. Nessun claim ospite o creazione di nuovo account da parte del booking.

**Email.** Estrarre dalla funzione event-booking un adattatore SMTP server con configurazione EVENT_SMTP_* e mittente già documentati. Testo semplice, soggetto fisso per evento di dominio, campi utente trattati come testo e destinatario validato. Template shooting: ricezione con preferenza e stato in attesa, conferma con data/ora/luogo, modifica con vecchio e nuovo appuntamento, annullamento individuale, annullamento serata per pioggia. Per sponsor: notifica interna con link admin, ricevuta esterna, dettagli appuntamento ed eventuali variazioni. Nessuna targa o nota interna nella posta. Un job per destinatario e revisione, acquisito con lock/lease, backoff e numero tentativi limitato, poi revisione operatore. In caso di timeout dopo accettazione SMTP, esito incerto: Message-ID stabile, verifica manuale prima del reinvio ove possibile. SMTP non garantisce consegna esattamente una volta. Monitorare fallimenti e rimbalzi disponibili senza archiviare interi messaggi. Per P0 provare SMTP reale e procedura manuale su caselle di test.

**Calendar e Meet.** P1 sincronizzazione unidirezionale DB → calendario privato dedicato EPOCAR. Un evento per slot occupato, anche se condiviso. Creare dopo prima conferma, aggiornare su cambio, eliminare quando si svuota o la serata è annullata. Titolo operativo, luogo e orari con fuso esplicito; niente targa, elenco partecipanti, email o note. Partecipanti avvisati individualmente via SMTP. Usare ID remoto deterministico conforme a Google e mapping locale, recupero dopo timeout, confronto etag e riconciliazione periodica delle revisioni. Un 404 in cancellazione vale come già rimosso; su 409 verificare identità, su 412 rileggere e segnalare modifica manuale. Rate limit/5xx con backoff, 401/403 sospendono il job per riconnessione. Le modifiche operative si fanno in EPOCAR.

P2: un evento per appuntamento sponsor; su scelta esplicita dell’admin richiedere Meet con conferenceDataVersion=1 e createRequest con requestId stabile. Verificare abilitazione dell’organizzatore e attendere l’esito di creazione prima di comunicare il link. Se indisponibile, mantenere accordo e consentire inserimento manuale del link verificato. Evitare doppio invio Calendar + SMTP. Preferire OAuth dell’account organizzatore con accesso minimo in scrittura al calendario necessario, consenso offline, callback protetto da state e controllo admin. Refresh token cifrato e revocabile in archivio server, secret fuori da Vite/repository/log. Service account solo dopo verifica di condivisione, proprietà e capacità Meet del dominio. Nessuna sincronizzazione inversa nel primo rilascio.

## I. Privacy e sicurezza

- Separare presa visione del trattamento organizzativo da autorizzazione immagini. Nell’informativa indicare titolare/contatto, base giuridica per finalità, destinatari dei dati per permessi, eventuali fornitori, tempi, diritti e revoca. Decidere con consulente se consentire partecipazione con solo veicolo inquadrato. Rendere esplicite finalità, canali, durata e scelta negativa o limitata. Un titolare del veicolo non autorizza altri adulti riconoscibili.
- Il giorno dello shooting associare scatti/gruppo a un codice e raccogliere la prova individuale degli adulti. Per minori verificare chi esercita la responsabilità genitoriale e le firme richieste; in dubbio evitare l’inquadratura riconoscibile. Lista per il fotografo con esito operativo minimo. Conservare liberatorie in area privata con accessi tracciati. P1 registra legame foto–soggetti–usi ammessi. Prima della gallery verificare tutte le persone, oscurare volti/targhe ove necessario e rimuovere EXIF. Revoca: sospendere pubblicazione, ritirare copie dai canali controllati, gestire cache e tenere traccia delle azioni.
- Proposta da approvare prima del go-live: eliminare targhe, note logistiche e dettagli di contatto operativi entro 30 giorni dalla serata, salva necessità documentata. Riesaminare le proposte sponsor chiuse dopo 6 mesi. Separare tempi delle prove di autorizzazione, foto pubblicate, contratti e backup. Job di scadenza verificabile con conteggi aggregati; trattare anche payload di coda, chiavi derivate e copie esportate. Integrare cancellazione account con il preflight in `supabase/functions/delete-account/` e `setup/account-deletion-v12.sql`: per richieste future contattare/annullare secondo policy; anonimizzare quelle esaurite, con eventuali prove soggette a obbligo conservate separatamente.
- RLS a privilegio minimo, REVOKE di default su tabelle/RPC riservate, search_path fisso nelle funzioni privilegiate. Service role solo nel backend; risolvere identità e ruolo prima di ogni comando. Liste utente limitate a user_id da JWT. Dati di terzi, sponsor, audit e note esclusi. Nelle liste admin targa mascherata; niente export globale in P0. Solo admin logistico autorizzato visualizza targa completa per accessi/permessi. Se gli admin sono più numerosi degli incaricati, introdurre capability dedicata prima dell’apertura.
- Schemi Zod client/server, vincoli DB, limiti di lunghezza, caratteri di controllo vietati, email canonica e nessun HTML libero. Richieste pubbliche con limite corpo, honeypot accessibile, rate limit atomico a finestre per impronta temporanea di IP da proxy fidato e indirizzo normalizzato, budget globale sulle mail. Calibrare soglie in staging per reti condivise. Risposte uniformi, TTL breve e rotazione della chiave HMAC. Challenge aggiuntivo solo se serve. Shooting limitato anche per account; nessun dato sensibile in analytics, toast tecnici, log provider o URL. CORS ristretto alle origini abilitate, segreti con rotazione, ambienti e destinatari test separati.

## J. Milestone di sviluppo

| ID e finestra obiettivo | Lavoro e dipendenze | Criterio di uscita |
|---|---|---|
| M0 · P0 · 23–24 nov | Responsabile evento + privacy + tecnico: confermare regole, testi e accessi staging. Verificare schema, redirect Auth, casella mittente e organizzatore. | Approvazioni registrate, registrazione di prova con ritorno, email ricevuta, referente maltempo nominato. |
| M1 · P0 · 24–26 nov | Dopo contratto M0: schema, RLS, RPC, snapshot, idempotenza, agenda e outbox; impostare serate inizialmente chiuse. | Test PostgreSQL isolati dimostrano proprietà, persistenza e impossibilità di doppia assegnazione. |
| M2 · P0 · 24–27 nov | In parallelo su contratto M1: pagina pubblica, auth, form, ricevuta, elenco personale e strumenti liberatoria per il giorno dell’evento. | Da mobile un nuovo iscritto torna al form, completa un mezzo senza targa e vede la richiesta in attesa. |
| M3 · P0 · 26–30 nov | Integrare admin, gruppi essenziali, spostamento, annullamento, maltempo, cinque template e recupero invii. Richiede M1, prove integrate con M2. | Due operatori in concorrenza non superano la capienza. Maltempo avvisa ogni interessato e chiude la serata. |
| M4 · P0 · 30 nov–2 dic | Prova generale con fotografo/admin; audit privacy, verifica dispositivi, SMTP reale, coda, rettifica, revoca, chiusura e riapertura controllata della raccolta. | Go/no-go entro 1 dic, apertura appena passati i gate; 2 dic riservato a correzioni, assegnazioni e conferme. Se i gate falliscono tenere chiuso il form e comunicare la decisione organizzativa. |
| M5 · P1 · dopo la prima serata | In base ai riscontri: agenda avanzata, selezione gallery e mapping liberatorie; Calendar opzionale dietro abilitazione. | Errore Google non blocca la seconda serata; solo derivati autorizzati raggiungono la gallery. |
| M6 · P2 | Dopo coda stabile: form sponsor, antiabuso, gestione admin, note e ricevute. Con risorsa autonoma anticipare UI e test di contratto. | Invio anonimo persistente, ricevuta e notifica distinte, triage esclusivamente admin. |
| M7 · P2 | Dopo M6 e verifica Google: appuntamento manuale, Meet, aggiornamento e recupero. | Un accordo produce un solo evento e un link verificato; revoca OAuth lascia utilizzabile il fascicolo. |

## K. Verifica e collaudo

| Livello | Casi e risultato atteso |
|---|---|
| Unitari Vitest | Normalizzazione targhe storiche e vuote, anno assente, preferenza fuori fascia, campi mancanti, tipo sponsor non ammesso, transizioni, template e ora locale in dicembre. Nessun segreto o targa negli output pubblici. |
| Integrazione PostgreSQL isolato | Due conferme simultanee sull’ultimo posto, capienza di gruppo, spostamento concorrente, cancellazione durante conferma, chiave riusata con contenuto diverso e doppio click con chiavi diverse. Verificare righe finali, occupazione e numero di job. Coprire modifica/cancellazione garage, deduplica e cambio serata. |
| Autorizzazioni | Matrice anonimo, proprietario, altro utente, staff, admin, consumer. Tentare letture dirette di targa/nota e scritture dirette sulle tabelle, garage altrui e RPC con identità fornita dal client. Solo i permessi previsti hanno successo. Verificare cancellazione account e purge. |
| Flussi browser | Playwright o fixture browser del progetto, mobile e tastiera: registrazione con ritorno, invio veicolo senza salvarlo e con salvataggio, consenso negato/limitato, multi-veicolo, operatore assegna gruppo e riprogramma, utente legge solo l'esito proprio. Sponsor senza login, messaggio ricevuto, nessuna disponibilità appuntamenti esposta. |
| Guasti e servizi | SMTP indisponibile, timeout incerto, worker interrotto dopo invio, job superato da annullamento, maltempo ripetuto. Verificare stato DB, replay e destinatari. Google: creazione riuscita con risposta persa, rate limit, credenziale revocata, conferenza in attesa, conflitto modifiche. Test doppioni e riconciliazione. |
| Accettazione umana | Caselle staging reali su almeno due domini, header e risposta corretti; prova agenda su cinque finestre, gruppo con liberatoria incompleta, ritiro foto anche dalla cache, lista logistica con accesso minimo. Test di regressione flussi Mossi, Auth e gallery. |

Riferimenti per i test: `src/test/event-booking-sql.test.ts`, `event-booking-endpoint.test.ts`, `event-booking-form.test.tsx` e `auth-flow.test.tsx` nella stessa directory; usare database temporanei e dati sintetici. Nessuna prova su utenti o appuntamenti reali in questa fase.

## L. Stime indicative

Giornate-persona comprensive di revisione e test; non includono attese per approvazioni, DNS, provider o fornitori. Le finestre in J richiedono due tecnici con competenze complementari e un referente disponibile. La data del 3 dicembre è l’evento, non il giorno utile per aprire le richieste.

| Milestone | Complessità | Impegno | Rischio dominante |
|---|---|---:|---|
| M0 | Media | 0,5–1 | Testi, accessi e policy esterne tardivi |
| M1 | Alta | 2–3 | Transazioni concorrenti e schema reale |
| M2 | Media | 1,5–2,5 | Redirect e garage incompleto |
| M3 | Alta | 2–3 | Correttezza degli avvisi e dei gruppi |
| M4 | Media | 1–2 | Recapito e disponibilità per la prova generale |
| M5 | Medio-alta | 3–5 | Revoche foto, permessi Calendar, riconciliazione |
| M6 | Media | 2–3 | Abuso della posta pubblica e SLA di triage |
| M7 | Media | 1,5–3 | Licenza Meet, consenso OAuth e ritardi API |

P0 shooting 7–11,5 giornate-persona. Con un solo tecnico la fascia alta supera il tempo lavorativo disponibile prima dell’evento: decidere subito la copertura, congelare P1/P2 e verificare il 26 novembre che il percorso verticale login → richiesta → agenda funzioni in staging. Sponsor 3,5–6 giornate-persona incluso Meet, assumendo disponibili i componenti comuni. Anticiparlo solo con capacità aggiuntiva indipendente da sviluppo, approvazioni e collaudo P0.

## M. Alternative

| Opzione | Vantaggio | Costo o limite | Decisione |
|---|---|---|---|
| Integrazione completa prima del lancio, con gallery e Calendar/Meet | Esperienza completa e agenda esterna subito disponibile | Collaudo OAuth, diritti immagini e failure mode di terzi sul percorso critico | Utile come obiettivo successivo alla prima serata |
| Ampliare direttamente il booking Mossi e appoggiarsi a tutte le sue funzioni | Poche nuove schermate e trasporto email disponibile | Ospiti, telefono, giro/esposizione, capacità all’invio e permessi staff divergono dai requisiti shooting; sponsor ha un ciclo commerciale separato | Riutilizzare componenti, schemi e librerie mirati con modelli di dominio dedicati |
| MVP integrato nel sito, servizi esterni aggiuntivi rinviati | Auth, garage, DB ed email esistenti. Agenda manuale utile anche senza Google. Nessun nuovo SaaS indispensabile | Più lavoro manuale dell’organizzatore e selezione immagini separata | Raccomandato per P0. Attivare Calendar, gallery e sponsor per milestone senza cambiare le prenotazioni raccolte |

## N. Decisioni umane

**Bloccanti per P0**

1. Responsabile evento: confermare luogo/punto di ritrovo, permessi che richiedono targa, orari, termine richieste, numero di postazioni, limiti e buffer, gestione gruppi e più veicoli dello stesso conducente.
2. Titolare e consulente: approvare basi giuridiche, destinatari, testi/versioni, tempi di cancellazione, canali promozionali, revoche, gestione dei minori e procedura sul posto. Decidere se si ammette il solo veicolo quando manca l’autorizzazione al ritratto.
3. Direzione: nominare incaricati per targhe, agenda, liberatorie e decisione maltempo, definire orario limite dell’avviso e contatto per le rettifiche.
4. Responsabile tecnico: autorizzare staging e successivo rilascio sul progetto Supabase corretto, confermare mittente e casella presidiata, allocare le persone per collaudo e go/no-go.

**Rinviabili oltre il 3 dicembre**

- Approvare calendario dedicato, titolarità dell’account Google, eventuale licenza Meet e chi può riconnetterlo.
- Scegliere canali e redattori della gallery tra quelli coperti dalle autorizzazioni, tempi di pubblicazione e selezione degli scatti.
- Nominare referente sponsor, casella interna, tempi di risposta e conservazione delle proposte. Stabilire se assegnare risorse autonome prima della seconda serata.

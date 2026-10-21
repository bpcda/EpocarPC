# EPOCAR — due account, verifica prima del ricollegamento

Analisi del repository al 21 ottobre 2026. **Nessun accesso al database esterno, nessuna modifica a utenti o dati, nessun deployment.** Le migrazioni descrivono lo schema previsto, non dimostrano quali versioni siano installate.

## Come eseguire le query

Il file `setup/duplicate-account-readonly.sql` contiene esclusivamente SELECT e commenti. Usare il SQL Editor **dell'istanza esterna del sito**, non un'istanza di anteprima e non il database Django privato.

1. Sostituire `EMAIL_ACCOUNT_A` e `EMAIL_ACCOUNT_B` nei blocchi **1 e 3**: A contiene foto/contenuti da conservare; B è collegato alla Tesoreria. Le email sono solo chiavi di ricerca iniziale, non chiavi di sync.
2. Eseguire 1: ogni email deve dare `matches = 1`, con due `auth_user_id` diversi. Se manca un account, ci sono più corrispondenze o gli UUID coincidono, fermarsi.
3. Eseguire 2a/2b/2c: inventario tabelle/colonne, vincoli e trigger/firme. **Assente/non visibile non significa nessuna riga.** Non installare migrazioni per far funzionare la diagnosi.
4. Eseguire 3: restituisce **testo SQL**, non i dati. Copiare la cella `readonly_sql_to_copy_and_run` integralmente ed eseguirla come 4. Il generatore seleziona soltanto colonne consentite realmente presenti e non interpella RPC applicative. Per sicurezza, il SELECT copiato può essere racchiuso in `BEGIN TRANSACTION READ ONLY;` e `ROLLBACK;`. Usare una sessione amministrativa autorizzata: risultati vuoti con RLS/permessi limitati non provano assenza di collegamenti.
5. Eseguire 5 con `UUID_AUTH_A`/`UUID_AUTH_B`; distingue proprietario Storage, prefisso utente e UUID nel nome. Nessuna di queste prove è sostitutiva delle altre.
6. Eseguire 6 per ogni immagine importante, con bucket e percorso esatti. Cerca anche il riuso in articoli/eventi di altri autori senza restituire HTML o generare URL firmati. È ricerca testuale sui riferimenti bucket/percorso, non un parser universale: URL codificati, HTML con URL diversi, asset Strapi o immagini locali richiedono verifica separata.
7. Eseguire 7 con email e UUID: separa iscrizioni via account, veicolo e email ospite; espone soltanto i riferimenti agli allegati, non le altre risposte.
8. Eseguire 8 per i percorsi referenziati: trova anche oggetti senza proprietario o caricati da un altro autore, che il solo inventario A/B potrebbe non includere.

I risultati contengono dati personali (nomi, email, telefono, targhe, percorsi file): conservarli privatamente. Non restituiscono password, token, hash Auth, metadata Auth, hash email, hash payload, risposte sync integrali o moduli con codice fiscale/indirizzo. Gli URL immagine restituiti dal generatore sono privati di query string e frammento; i percorsi Storage non sono credenziali ma possono includere nomi di file personali.

### Cosa riportare per il prossimo passo

- Identificazione A/B con UUID, profili e ruoli; numero di foto/articoli/eventi/galleria/veicoli/registrazioni per ciascuno e lista degli ID da preservare.
- Righe di `membership_applications`, `member_public_status`, `treasury_bootstrap_links` e, se presente, `association_members`; eventuali altri account trovati con lo stesso `treasury_member_id`.
- Schema installato, vincoli, trigger e firme dal blocco 2. Le firme non provano quale implementazione sia distribuita: Codex dovrà confrontare anche le versioni effettive delle funzioni/endpoint, localmente e senza esportare segreti.
- `last_revision`, `treasury_updated_at`, eventi revisionati e registrazioni di richieste rilevanti; lo script restituisce tutti i metadati pertinenti senza limite arbitrario. Calcolare il massimo delle revisioni conservate senza eliminare righe. Le richieste registrate non sono la coda degli eventi ancora in Django.
- Da Codex: ID del socio nel database Django, riferimento esterno corrente, eventuali doppioni, coda/outbox/retry pendenti e massimo numero di revisione prodotto. Il sito non può conoscere la coda privata.

## Risultati da interpretare correttamente

| Campo | Significato |
|---|---|
| `auth.users.id` | UUID dell'account; diverso da `profiles.id` |
| `profiles.user_id`, `user_roles.user_id` | Identità del sito |
| `articles/events/gallery_images.uploaded_by` | Attribuzione editoriale; non prova necessariamente chi possiede il file |
| `membership_applications.user_id` | Richiedente originario, unico; ID domanda e decisioni da conservare |
| `membership_applications.member_id` | FK al registro locale `association_members.id` |
| `treasury_member_id` | UUID del socio della Tesoreria privata; **non assumere** che coincida con `member_id` locale |
| `treasury_bootstrap_links.external_member_id` | UUID Auth usato nell'importazione; ack è collegamento, non ammissione |
| `member_public_status.user_id` | Account che legge scheda e quote annuali tramite RLS |
| `member_annual_fees` | Quote per `treasury_member_id` + anno, senza `user_id` |
| `association_people_order.user_id` | Solo ordinamento della pagina pubblica |

Un ruolo `founder`, una tessera o l'assenza della domanda non bastano per provare l'ammissione. Non creare un secondo socio né assegnare una nuova tessera per risolvere il doppio account.

Le foto editoriali hanno nomi UUID casuali (`event-images` è usato anche per gli articoli, `gallery` per la galleria); avatar/veicoli hanno cartelle UUID utente. `association_documents` è globale senza autore; `association_founders` è una tabella legacy senza `user_id`, quindi il nome non prova identità/proprietà. I suoi riferimenti vanno cercati per `photo_path` soltanto se la tabella risulta installata. I contenuti Strapi e gli asset locali non hanno automaticamente legami con UUID Auth: non sono inventariati dal SQL del sito.

## Perché un semplice scollegamento di B non è sicuro

1. `setup/treasury-v4.sql`: il trigger `association_members_link_account` riempie `user_id` nullo tramite email. Un semplice azzeramento può ricollegare immediatamente B. La sostituzione v12 evita alcuni auto-link dopo eliminazione usando il log relativo, **non** registra un blocco generale dopo un ricollegamento; non si devono falsificare log di eliminazione.
2. `setup/treasury-bootstrap-v13.sql`: `bootstrap_ack` può creare nuovamente il link di B se B resta eleggibile e non c'è un conflitto. Un replay noto restituisce la risposta registrata senza nuova scrittura, ma il client potrebbe interpretare erroneamente il vecchio successo come link attuale.
3. `setup/membership-sync-v6.sql` e v14: gli aggiornamenti tramite domanda possono continuare a risolvere B dal richiedente originario. Le domande storiche non sono un semplice campo da trasferire: hanno unicità per utente, file con prefisso `user_id` e storico collegato per ID.
4. v1 è ancora accettato: timestamp mancanti diventano l'ora corrente, quelli uguali possono applicarsi; sincronizzazione dei ruoli può usare il vecchio utente passato alla funzione. Una sola modifica alla proiezione non basta.
5. v2: la barriera di revisione è nella proiezione; cancellarla può perdere il watermark per eventi mai ricevuti. Nel percorso generico una proiezione assente può essere ricreata tramite `external_member_id`. Una revisione più alta non prova che il collegamento account sia corretto.
6. I ±300 secondi controllano il timestamp della richiesta HTTPS, **non** l'età dell'evento originario. Un retry tardivo può avere una nuova intestazione valida.

Non usare `delete-account`, `account_deletion_prepare/finalize`, `treasury_sync_members`, `bootstrap_ack` o `treasury_sync_apply` per la diagnosi: alcune cancellano o importano dati. Le query fornite non chiamano queste funzioni.

## Procedura coordinata da definire DOPO i risultati

Questa è una sequenza condizionale da concordare con Codex, **non una procedura di scrittura già autorizzata o implementata**. L'obiettivo previsto è conservare A e associare ad A il socio oggi collegato a B; B rimane un account separato scollegato, non eliminato.

1. **Confermare identità e conflitti.** Stessa persona verificata e un solo socio canonico; se A ha già un altro socio/domanda o ci sono due soci in Django, fermarsi e decidere esplicitamente la riconciliazione. Conservare gli ID originali, tessera, ammissione, quote e storico.
2. **Mettere in pausa produttori e consumatori per il socio interessato.** Codex arresta import, outbox, retry e ack automatici e conserva la coda; sul sito serve un blocco per quel socio/account che serializzi anche richieste in volo. Fotografare mapping, revisioni e conteggi prima di ogni futura scrittura; backup protetto degli asset A e delle righe pertinenti.
3. **Installare prima una protezione persistente del collegamento.** Proposta da implementare/testare su entrambi i lati: mapping canonico socio→account, generazione monotona di collegamento e revoca esplicita della vecchia coppia socio→B (ed eventuale esclusione bootstrap di B). Verifica server-side in tutti i percorsi v1/v2, approve, bootstrap_ack, import/reconciliation e auto-link email. Nessun fallback email o a B; identificatori incoerenti rifiutati. I nomi di nuovi campi/RPC saranno stabiliti con Codex e documentati nel contratto: **oggi non esistono nel progetto**.
4. **Gestire replay e watermark senza perdere lo storico.** Conservare ledger di richieste/eventi e watermark del socio anche fuori da una proiezione sostituibile; usare la maggiore revisione fra proiezione, eventi accettati e coda privata. Le risposte memorizzate di un vecchio ack non devono confermare il nuovo mapping: il client deve distinguere successo storico e collegamento corrente. Non riscrivere payload/eventi già inviati con stessi ID/chiavi: riconciliare la coda e produrre nuovi eventi con nuovi ID e revisione/genere di collegamento corretti; quelli vecchi restano archiviati/rifiutati come obsoleti.
5. **Operazione amministrativa coordinata e tracciata.** Con lock e controllo della mappa attesa B, aggiornare soltanto i legami attivi pertinenti a favore di A, sia sul sito sia nel gestionale privato. Non esiste una transazione unica fra i due database: usare operazione in più fasi verificabili con sync ancora sospeso, precondizioni, audit append-only e compensazione sicura. Registro locale, bootstrap e proiezione non sono intercambiabili; nessuna cancellazione/ricreazione di proiezione che azzeri revisione. La domanda originaria resta storica: se legata a B, introdurre una risoluzione canonica separata per il sync, senza falsificare richiedente, consensi, decisioni o file; non trasferire `user_id` alla cieca. Se non è possibile separare domanda storica/accesso attuale, progettare prima tale supporto.
6. **Preservare proprietà e permessi.** A conserva UUID, profilo, avatar, foto, `uploaded_by`, storage e contenuti. Nessun cambiamento ai `member_id` di movimenti, quote per anno, tessera o date di ammissione. Rimuovere da B soltanto eventuali diritti associativi da riassegnare esplicitamente; ruoli amministrativi, staff, tesoriere e cariche non si copiano automaticamente. Storico attori e audit restano immutati; appendere una nuova evidenza del ricollegamento.
7. **Prove sintetiche prima della riattivazione.** A vede scheda/quote, B non vede la proiezione né le quote, A conserva foto/contenuti. Testare evento v1 arretrato con timestamp uguale/mancante, v2 mai ricevuto con revisione bassa/alta ma collegamento vecchio, retry con nuova chiave, vecchio ack e nuovo ack verso B, approvazione tramite vecchia domanda, doppio import, aggiornamento email e richieste concorrenti. Ogni caso deve lasciare A come unico destinatario e nessuna perdita di dati.
8. **Ripresa controllata.** Codex aggiorna il riferimento esterno canonico ad A, invia un nuovo snapshot revisionato con generazione corretta, verifica lettura reale con A e assenza accesso con B; poi riattiva code/import e ripete inventario e conteggi. Un rollback operativo non deve riabilitare la coppia revocata o cancellare audit/ledger.

**Da fare ora:** soltanto eseguire e interpretare le query. Dopo i risultati si può preparare il piano operativo e il codice di protezione con Codex; nessun UPDATE/DELETE è incluso qui.

## Verifica locale effettuata

Test PostgreSQL isolato con soli dati sintetici: tutti i SELECT eseguiti in transazioni READ ONLY, compreso il SELECT generato; UUID A/B distinti, contenuto attribuito ad A, collegamento e quote di B, revisione 7, proprietario Storage, esclusione di password/hash/payload/risposte sync e token nella query string. Ripetuto il generatore senza tabelle opzionali v11/v14. Un test automatizzato superato (`src/test/duplicate-account-readonly.test.ts`); nessuna verifica dei dati effettivi esterni.
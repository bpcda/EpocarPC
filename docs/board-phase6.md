# Consiglio Direttivo — Fase 6: fascicolo e archivio

Il percorso aggiunto è: seduta chiusa → fascicolo preparato → download verificato → conferma del responsabile → archivio e pulizia dei materiali temporanei.

## Attivazione sul backend esterno

1. Verificare che `setup/board-v15.sql` … `setup/board-v19.sql` siano installati, nell'ordine. La roadmap non attesta l'attivazione esterna delle fasi 3–5.
2. Revisionare ed eseguire `setup/board-v20.sql`. È transazionale e rieseguibile. Aggiunge `board_dossiers`, il riferimento della firma alla versione del verbale e controlli sulle scritture degli atti e dello storage. Per installazioni v20 precedenti alla correzione dei privilegi eseguire `setup/board-v20-permissions.sql`: rimuove anche TRUNCATE dai client e l'invocazione diretta dei trigger interni. v20, correzione dei privilegi, v21 e v22 applicati via MCP al progetto esterno il 12/11/2026; `board-dossier` creata via MCP, versione 1, con JWT obbligatorio. Resta il collaudo operativo: nessuna archiviazione o cancellazione di audio reali avviata durante il deploy.
3. Distribuire `setup/functions/board-dossier/` come Edge Function `board-dossier`, dal workspace associato esplicitamente al progetto esterno. Il `deno.json` della funzione contiene gli import necessari. Servono le normali variabili server `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; nessuna chiave IA aggiuntiva.
4. Distribuire il frontend. La cartella `setup/functions/` è una consegna per il progetto esterno; il progetto managed in `supabase/config.toml` non è il target di questa funzione.
5. Per copie firmate caricate prima del v20, verificare il documento e registrarlo nuovamente sulla versione corrente: il nuovo `signed_version` non viene valorizzato automaticamente sui dati storici. Una nuova versione del testo perde sempre il collegamento alla firma precedente.

Questo sviluppo non applica SQL al backend esterno, non distribuisce funzioni e non elimina dati reali.

## Uso

- Presidente e verbalizzante preparano il fascicolo dopo la chiusura. Sono necessari verbale approvato con voto sulla versione corrente, copia firmata presente nello storage e nessuna votazione, registrazione o trascrizione ancora in corso. Le proposte di rettifica pendenti vanno prima valutate.
- Il fascicolo raccoglie dati della convocazione e ordine del giorno, presenze, testo del verbale, copia firmata originale, testi delle delibere, votazioni nominali, consensi e registro completo. Include `dati-seduta.json` con versioni e storico, e `manifest.json` con dimensioni e impronte SHA-256.
- I documenti citati nelle delibere sono attualmente metadati, non allegati caricati. Lo ZIP li elenca nei dati ma non inventa file mancanti. Audio e trascrizioni temporanee non entrano nel fascicolo permanente.
- La funzione rilegge lo ZIP caricato e verifica dati, indice e impronte prima di registrarlo. Il download verifica nuovamente l'impronta dell'intero ZIP. Gli utenti con sola lettura possono scaricare il fascicolo.
- Dopo il download, il responsabile apre lo ZIP, verifica gli atti e conferma esplicitamente l'archiviazione. Una modifica alla seduta intervenuta dopo la preparazione richiede un nuovo fascicolo.
- Alla conferma il server blocca gli atti (`ESPORTATO`). La funzione rimuove gli audio tramite Storage API, a gruppi di 100, e solo quando lo storage è vuoto elimina tracce e trascrizioni dal database e conclude (`ARCHIVIATO`). Restano verbali, firme, delibere, voti, consensi, fascicoli ed eventi.
- Se la pulizia fallisce, gli atti restano bloccati e la schermata offre «Riprendi archiviazione». La ripetizione non duplica l'evento finale. File o cartelle audio inattesi interrompono la pulizia e richiedono verifica tecnica.
- L'archivio resta immutabile. La futura gestione di rettifiche in un'altra seduta deve creare atti collegati, senza sbloccare o modificare il fascicolo originario.

## Limiti espliciti

- La verifica umana del contenuto e delle sottoscrizioni resta necessaria: il controllo tecnico assicura integrità e collegamento della versione, non autentica le firme.
- Dimensione massima: 10 MB per dati strutturati, 10 MB per copia firmata PDF/JPEG/PNG, 25 MB per ZIP. Nessun dato viene troncato per rientrare nei limiti.
- Un'interruzione fra upload e risposta di registrazione può lasciare un oggetto ZIP non referenziato. Viene conservato per evitare di cancellare un fascicolo la cui registrazione potrebbe essere riuscita; la pulizia di questi oggetti richiede verifica tecnica.
- La pulizia parte solo dalla conferma del responsabile; nessuna cancellazione periodica o automatica al semplice download.
- Non rieseguire isolatamente vecchi script dopo gli aggiornamenti: ripristinerebbero vecchie policy o funzioni. Se si riesegue l'intera sequenza, terminare sempre con il v22.

## Verifiche

`src/test/board-dossier.test.ts` verifica ZIP, registro oltre 1.200 eventi, integrità, upload riletto, blocco su errori e pulizia paginata. `src/test/board-dossier-panel.test.tsx` verifica sola lettura, download obbligatorio, conferma e stato riprendibile.

`src/test/board-v20.test.ts` esegue le migrazioni v15–v20 e la riesecuzione del v20 su PostgreSQL temporaneo, con i dati sintetici di `src/test/fixtures/board-schema.sql` e le asserzioni di `board-archive-checks.sql`. Richiede `initdb`, `pg_ctl` e `psql` nel PATH; viene saltato se i binari mancano. Le stesse fixture sono state verificate localmente su PostgreSQL WASM isolato (PGlite), senza aggiungere dipendenze al progetto. Quel controllo non sostituisce i test di concorrenza su PostgreSQL nativo né il collaudo della Storage API reale.

Prima dell'attivazione verificare su una seduta sintetica: file firmato assente, fascicolo superato, ruolo non autorizzato, errore durante la rimozione audio, ripresa, conservazione degli atti e impossibilità di modificarli tramite RPC o storage dopo l'archiviazione.

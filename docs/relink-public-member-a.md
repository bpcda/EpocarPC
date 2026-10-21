# EPOCAR — correzione circoscritta del registro pubblico B → A

**Script da revisionare, non eseguito.** Analisi del codice del repository; nessun accesso al database esterno o alla Tesoreria privata. I dati reali seguenti sono quelli comunicati dall'utente, non verificati autonomamente.

| Identità | UUID |
|---|---|
| Account A da conservare | `3abfb9da-4153-44e2-a84c-c38fe7a45415` |
| Account B da scollegare dal record | `9dbcf104-3ebe-4b4f-9023-8c6061689a60` |
| Registro pubblico da correggere | `1601d3a0-8d64-46be-a7b4-c1d2aaee2552` |
| Socio Tesoreria già collegato ad A | `3af0240f-e43a-440b-a080-7b50af3939e6` |

## Risultato dell'analisi

- `treasury-v4.sql`, `association_members_link_account()` (righe 23–36): normalizza l'email; cerca un account **soltanto se `NEW.user_id IS NULL`**. Impostare direttamente A, senza passare per NULL, non viene sovrascritto con B anche se l'email del registro è quella di B. La variante v12 aggiunge il controllo sul log eliminazioni; non cambia questo comportamento. Non falsificare quel log.
- `treasury-v5.sql`, `association_members_sync_role()` (173–188): per socio attivo con tessera assegna la categoria a **NEW.user_id**, quindi A riceve `founder`; elimina eventuali categorie alternative di A. **Non rimuove i ruoli di OLD.user_id, cioè B.** v4 fa lo stesso senza richiedere tessera. Nessuna carica, admin, staff o tesoriere viene trasferita.
- `association_members_card_guard()` non impedisce il cambio account se la tessera rimane identica. `association_members_history` scatta per UPDATE di category/active, non per il solo user_id: lo storico associativo resta invariato. `association_members_updated` cambia updated_at; `association_members_audit` aggiunge una riga con prima/dopo. Queste due variazioni sono attese e non costituiscono cambiamento di dati contabili.
- `treasury-sync` e RPC v6/v11/v13/v14 scrivono domande, bootstrap, proiezione e ruoli, **non `association_members.user_id`**. Questo registro non è la proiezione letta dall'Area Socio. L'UUID locale del registro non deve essere sostituito con l'UUID del socio Django.
- `treasury_sync_members()` è invece una vecchia riconciliazione locale: auto-collega righe NULL e importa chi ha categoria. Non eseguirla per questa correzione; B, mantenendo founder, potrebbe diventare un nuovo candidato/record separato. Non rieseguire v4/v5: contengono operazioni una tantum estranee a questa correzione.

## Cosa contiene lo script

`setup/relink-public-member-a.sql` ha due blocchi. Il primo è sola lettura: definizioni installate, impronta del codice, Auth con soli UUID/email, ruoli, registro, bootstrap, proiezione, domande. Se una tabella/colonna attesa manca, **fermarsi**, non installare migrazioni alla cieca. I risultati devono essere letti con una sessione amministrativa autorizzata: risultati filtrati da RLS non provano assenza di conflitti.

Il secondo contiene una transazione di prova con **ROLLBACK di default**:

1. lock timeout 5 secondi, statement timeout 60 secondi, lock conservativi su sette tabelle durante la breve operazione;
2. identificazione esplicita dell'operatore admin per attribuire il nuovo audit, senza conferirgli privilegi;
3. confronto con l'impronta del codice appena revisionato, controlli RLS/trigger e due account presenti;
4. verifica record ancora B, nessun altro record di A/B, bootstrap esattamente A→socio;
5. tessera **1**, Fondatore, attivo, ammissione **2026-10-07**, delibera **1** del **2026-10-07** devono già coincidere nel registro pubblico: sono **precondizioni, non valori da copiare dalla Tesoreria**. Formato delibera diverso o valori assenti => fermarsi per revisione, non riscriverli;
6. nessuna proiezione di B o mapping divergente; proiezione di questo socio assente è ammessa, poiché lo script non la crea;
7. nessuna domanda collegata al socio/registro con richiedente diverso da A, nessuna domanda submitted/review di A/B o altro legame associativo: le domande storiche di B non collegate a questo socio rimangono inalterate;
8. nessuna categoria alternative ordinary/supporter di A (evita revoche implicite);
9. aggiunta di **una funzione e un trigger persistenti limitati a quel record**, poi un unico UPDATE di `user_id`, condizionato al vecchio B;
10. confronto integrale del record esclusi user_id/updated_at, dei ruoli di B e non-founder di A, dello storico del socio; audit esattamente +1 con attore e immagini prima/dopo;
11. SELECT finali e ROLLBACK.

Lo script non ha UPDATE/DELETE di Auth, profili, contenuti, storage, domande, bootstrap, proiezione, quote, ledger o database Django. I trigger esistenti rimangono attivi: è previsto che aggiungano founder ad A e l'audit del registro. B **conserva tutti i ruoli**; la sola correzione non revoca i suoi diritti sul sito né lo esclude da bootstrap. Non promette di cancellare l'identità B o risolvere automaticamente tutte le sue autorizzazioni.

## Protezione persistente e limiti

Il nuovo trigger `zzzz_epocar_guard_member_1601d3a0` rifiuta INSERT/UPDATE del record canonico con account diverso da A (anche NULL) e modifica del suo ID. Non disabilita o sostituisce alcun trigger, RLS o vincolo. È transazionale: con ROLLBACK non rimane installato. Impedisce un successivo writer, anche service_role, di rimettere B sullo **stesso record**; non è una protezione contro amministratori che alterano/rimuovono il trigger o contro DELETE/recreazione intenzionali, estranei a questa procedura.

**Effetto da revisionare prima del COMMIT:** anche una futura eliminazione legittima di A che tentasse di scollegare questo record con NULL verrebbe bloccata. La protezione è una scelta conservativa per questa riconciliazione e richiederà una futura procedura amministrativa auditata per autorizzare un altro cambio/scollegamento; non rimuoverla automaticamente né provare il flusso eliminazione su account reali. Il trigger non aggiorna email: quella eventualmente di B resta invariata, ma non è usata per risolvere il record finché A è imposto e il guard è presente.

Non tutela automaticamente proiezione/ruoli dall'intero contratto sync. I contatori di revisione v2 proteggono l'ordine dei dati, **non attestano il corretto account**. In v14 il percorso bootstrap confronta l'external_member_id con il link A; il percorso generico invece può preferire l'utente della proiezione e non confronta sempre l'external_member_id esplicito. v1 tramite domanda usa il richiedente originario e `member_public_upsert()` sincronizza i ruoli sull'utente passato anche quando l'ON CONFLICT non aggiorna user_id. Non modificare ledger, response/idempotency keys o last_revision per aggirare questo problema.

## Sequenza manuale con Codex

1. **Backup e revisione privata:** conservare estratti delle righe/ruoli/storico e riferimenti degli asset A con le query precedenti. Revisione delle definizioni installate e del codice Edge Function effettivamente distribuito; qui non è verificabile. Il SELECT dell'impronta include funzioni SQL, non il codice Edge Function: Codex deve verificare separatamente quest'ultimo.
2. **Sospendere per questo socio** importatore, outbox, retry, ack e writer del registro; attendere richieste in volo. Nessuna modifica alla scheda, tessera, delibera o quote nella Tesoreria: è già A. Registrare eventi pendenti e massima revisione senza riscrivere payload storici.
3. Eseguire blocco 1. Se coerente, incollare l'impronta in `INCOLLARE_IMPRONTA_CODICE_REVISIONATO` e il vero UUID admin operatore in `INSERIRE_UUID_AUTH_OPERATORE_ADMIN`. Non inserire password/token. L'impronta non certifica da sola la sicurezza: obbliga ad usare il codice che è stato effettivamente revisionato.
4. Eseguire **l'intero blocco 2 con ROLLBACK** in una sola richiesta. Qualsiasi eccezione/timeout/interruzione => annullamento; se la sessione resta in errore usare ROLLBACK. Non continuare selezionando singole righe dopo un errore.
5. Dopo esito e revisione positiva del guard, eseguire nuovamente tutto il blocco 2 terminando con **COMMIT** al posto del ROLLBACK finale. Non lasciare una transazione aperta aspettando decisioni in chat. Lo script interrompe una riesecuzione dopo commit (record non più B/protezione presente).
6. Ripetere i SELECT finali in una nuova richiesta dopo COMMIT: A sul record, stessi dati associativi, bootstrap sempre A, B invariato, guard presente; controllare il nuovo audit e conteggi/proprietà degli asset A. Le prove locali non sostituiscono questi controlli reali.
7. **Prima della riattivazione**, Codex verifica coda ed endpoint: nuove operazioni per questo socio usano A, nessun fallback email/B; vecchi ack sono successi storici, non prova del mapping corrente; un nuovo ack B→stesso socio deve fallire per conflitto sul link A. Non generare un nuovo socio per B. Se B resta candidato bootstrap, importatore deve lasciarlo come identità non riconciliata, mai inferire una seconda ammissione.
8. In ambiente sintetico/staging provare v1, v2 a revisione bassa/alta, vecchie richieste e ack con nuove intestazioni; tutti devono lasciare il record pubblico ad A, senza attribuire ad B la proiezione di quel socio o riassegnargli diritti tramite una domanda vecchia. Se c'è un vecchio percorso domanda verso B, lo script **deve fermarsi**: serve una risoluzione canonica separata senza trasferire consensi o richiedente. Non riprendere quel percorso finché la protezione server-side di mapping non è stata revisionata.

### Ruolo founder di B

La richiesta circoscritta corregge il collegamento, **non autorizza una revoca automatica**. Il trigger v5 non ripulisce B e lo script lo verifica. Se si vuole che solo A compaia fra fondatori/abbia diritti associativi, serve una decisione separata e tracciata sul ruolo di B (le liste pubbliche usano user_roles), senza toccare altre cariche. Nessuna copia/rimozione di admin/staff/treasurer/CD è inclusa.

### Cosa resta esterno

Revisione ed esecuzione manuale del solo script sul sito; controllo di codice/trigger effettivamente installati; gestione delle code da Codex; lettura reale Area Socio con A/B e conferma asset. Nessun deployment è stato eseguito. Non occorre modificare la Tesoreria privata che, secondo la verifica comunicata, è già corretta.
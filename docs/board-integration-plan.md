# Consiglio Direttivo — piano di integrazione per passi

Data: 12 novembre 2026. Baseline esaminata: `afd7898396e7eb024ba00ff98b07c204558bcd31`.

## Obiettivo e regole concordate

Completare un percorso verificabile: convocazione → identificazione e presenze → seduta e delibere → redazione e approvazione del verbale → chiusura → firma → fascicolo → archivio.

- Il verbale si approva prima di chiudere la stessa seduta: scelta confermata dall'utente il 12 novembre 2026.
- Una rettifica dopo la chiusura si tratta in una successiva seduta, con presenze e quorum propri. Non si riapre silenziosamente la seduta originaria e non se ne riutilizzano le presenze.
- Semplificazione richiesta dall'utente: la seduta resta chiudibile senza approvazione del verbale indicando il motivo nel dialogo esistente, anche se manca il quorum. Nessun modulo o ulteriore approvazione per questa eccezione; non si attribuisce al verbale un'approvazione inesistente.
- Queste due scelte definiscono il percorso richiesto dall'utente: non sono presentate come obblighi espressamente stabiliti dallo statuto. L'art. 17.11 richiede redazione e sottoscrizione del verbale, senza prescrivere un voto di approvazione prima della chiusura.
- Testo, versione, votazione, firma e fascicolo devono riferirsi allo stesso atto identificabile.
- Le decisioni e i vincoli si applicano sul server; l'interfaccia presenta gli stessi vincoli.
- L'amministratore tecnico resta in sola lettura. La registrazione richiede consenso; non partecipare alla registrazione non impedisce di partecipare alla seduta.
- L'installazione sul progetto esterno e la cancellazione di dati reali sono operazioni distinte dallo sviluppo locale e richiedono richiesta esplicita.

## Fonte delle regole: statuto caricato

Fonte primaria: `Statuto Epocar.pdf`, 24 pagine, fornito dall'utente il 12 novembre 2026. SHA-256: `8c549beb7f12c630c48be4eccfe3694f3735f531c30a61034f56b827d1550138`. Testo estratto tramite Firecrawl Parse; gli articoli seguenti sono stati letti integralmente nei passaggi pertinenti. I riferimenti sono allo statuto dell'associazione, non alle norme generali sulle assemblee.

| Articolo | Regola riscontrata | Conseguenza per l'integrazione |
| --- | --- | --- |
| 16.2 | Consiglio composto da cinque o sette membri. | Distinguere composizione prevista e componenti effettivamente in carica; non bloccare automaticamente la seduta per una vacanza senza una regola specifica. |
| 17.1–17.4 | Convoca il Presidente, anche su richiesta di almeno un terzo dei componenti; comunicazione con strumenti idonei a garantirne la conoscenza; urgenza e informazioni della convocazione. | Il salvataggio nel portale e il Word non provano da soli la comunicazione. Non importare i sette giorni previsti dall'art. 12 per l'Assemblea. |
| 17.5 | Partecipazione telematica con identificazione e comunicazione reciproca. | Conservare la verifica esplicita della presenza; la connessione tecnica non basta. |
| 17.6 | Quorum: maggioranza dei componenti in carica. | Calcolo per persone distinte e cariche attuali: cinque componenti richiedono tre presenti, sette ne richiedono quattro. |
| 17.7–17.8 | Deliberazioni a maggioranza semplice dei presenti; in parità prevale il voto del Presidente. | Criterio applicativo confermato il 12/11/2026: più favorevoli della metà dei presenti; astensioni e voti mancanti non sono favorevoli. Se favorevoli e contrari sono uguali e non nulli, prevale il voto sì/no di chi presiede; senza tale voto la proposta è respinta. |
| 17.9–17.10 | In urgenza sono ammesse consultazioni scritte/telematiche con identificazione e voto certo, da riportare nel primo verbale utile. | Percorso separato dal voto durante una seduta; non simularlo riutilizzando presenze di una seduta chiusa. Non incluso nella prima integrazione. |
| 17.11–17.12 | Verbale di ogni riunione, sottoscritto da Presidente e verbalizzante; conservazione di verbali e delibere. | Conservare il resoconto anche di una seduta senza quorum; voto digitale, firma e archiviazione restano operazioni distinte. |
| 18.7; 19.3–19.5 | Sostituzione del Presidente da parte del Vicepresidente; ulteriore incarico individuato dal Consiglio se entrambi impediti. | Le RPC limitate al titolare del ruolo `president` non coprono tutte le situazioni. Introdurre una sostituzione esplicita e tracciata, con controlli server, senza dare sempre pieni poteri a ogni Vicepresidente. |
| 24.3–24.5; 24.7 | Dichiarazione del conflitto; esclusione dalla discussione e dal voto sul punto, con allontanamento temporaneo. | Registrare il conflitto per la specifica deliberazione e bloccarne il voto sul server; non confonderlo con un voto «astenuto» né con l'esclusione dall'intera seduta. Ricalcolare la presenza effettiva senza ridurre arbitrariamente i componenti in carica. |
| 16.13–16.15 | Limite di spesa autonoma di 5.000 euro per iniziativa/operazione; possibili ulteriori limiti interni. | Se il modulo deve autorizzare operazioni economiche, occorrono dati strutturati e controlli dedicati; il titolo libero di una delibera non consente di verificarli. Integrazione economica differita, senza attribuire al sito poteri della Tesoreria. |
| 28.1 | Libri sociali e diritto di esame su richiesta, con tutela dei dati personali. | Conservare gli atti; non rendere pubblica l'area Consiglio o i bucket per soddisfare la consultazione. |
| 29.1–29.3; 29.8 | Le procedure organizzative possono essere disciplinate da regolamenti interni, che non prevalgono sullo statuto. | Distinguere sempre regole statutarie, eventuale regolamento approvato e preferenze del percorso applicativo. |

### Questioni che il testo non risolve da solo

- Il testo non dettaglia computo delle astensioni, mancata espressione del voto e applicazione della parità in questi casi. L'utente ha dichiarato che non esiste un regolamento interno e ha confermato il criterio applicativo sopra: con cinque presenti, 2 sì/1 no/2 astenuti è respinta; 2 sì/2 no/1 astenuto segue il voto sì/no di chi presiede; nessun voto espresso non approva la proposta. Non presentare questi dettagli come citazione testuale dello statuto.
- L'utente ha indicato sette componenti del CD: il quorum è quattro se tutti e sette sono in carica. Il numero resta derivato dalle persone con cariche attuali. Verifica dello statuto ripetuta dopo la precisazione dell'utente: l'urgenza dell'art. 17.3 non cambia quorum o maggioranza del CD. Le regole di prima/seconda convocazione e i voti validamente espressi degli artt. 12.5–12.7 riguardano l'Assemblea ordinaria e non sono trasferite al Consiglio. Fonte estratta: `.firecrawl/statuto-epocar.md`, artt. 12 e 17.
- Per la chiusura senza quorum o con verbale non approvato si usa la soluzione minima richiesta: motivo obbligatorio nel dialogo esistente ed evento di chiusura registrato; nessuna approvazione fittizia. Il resoconto non approvato resta redigibile.
- La consultazione urgente scritta e i limiti economici richiedono percorsi dedicati: restano fuori dal rilascio iniziale, da dichiarare nella documentazione.

## Stato iniziale

Le fasi 1–5 sono presenti in `setup/board-v15.sql` … `setup/board-v19.sql`, nei componenti `src/components/board/`, in `src/lib/board.ts`, `board-audio.ts`, `board-docx.ts` e nelle Edge Function di trascrizione e redazione.

Durante la revisione sono comparse modifiche concorrenti per la fase 6: `setup/board-v20.sql`, `src/components/board/DossierPanel.tsx`, `src/lib/board-dossier.ts`, la funzione `board-dossier` (ora in `setup/functions/board-dossier/`) e il collegamento in `LiveSession.tsx`. Sono lavoro in corso: non sovrascriverle e verificarne lo stato prima di ciascun passo. Il v20 contiene anche restrizioni Storage e invalidazione della firma al cambio di versione, da riusare dopo verifica invece di duplicarle.

GitNexus non dispone di un indice di questo repository; il piano deriva dalla revisione diretta delle sorgenti. Build, TypeScript e il test esistente `board-grouping.test.ts` sono passati prima delle ulteriori modifiche concorrenti. I test SQL non sono stati eseguiti: mancano PostgreSQL e l'ambiente richiesto dai test. `npm ci` ha inoltre rilevato disallineamento fra manifest e lockfile; l'installazione locale usata per le verifiche non ha modificato il lockfile.

## Modalità di lavoro

Un passo per volta. Per ogni passo: verificare il diff corrente, implementare la modifica minima completa, eseguire i controlli pertinenti e riportare esito e limiti. Nessun passo si dichiara completato con test obbligatori non eseguiti. Se un problema blocca un passo, si registra il punto preciso; non si maschera con un controllo solo nell'interfaccia.

### Passo 0 — Inventario e accordo sul percorso

Stato: completato come pianificazione; nessuna implementazione funzionale in questo passo.

- Individuati i punti di integrazione e il lavoro in corso della fase 6.
- Concordata l'approvazione nella stessa seduta e la rettifica successiva in una nuova seduta.
- Registrati i limiti delle verifiche disponibili e i passi seguenti.
- Statuto caricato letto nei passaggi pertinenti e regole mappate agli articoli; individuate le differenze su conteggio dei voti, sostituzione del Presidente e conflitti di interesse.

### Passo 1 — Rendere coerenti approvazione e chiusura

Stato: implementato e verificato con test frontend e SQL su PostgreSQL nativo isolato. Migrazione `setup/board-v21.sql` applicata via MCP al progetto esterno `cgbaunizlqqhctiiogok` il 12/11/2026, dopo il prerequisito v20. Verificati presenza delle funzioni, RLS e privilegi; nessun test di scrittura con dati reali. Applicata anche la correzione `setup/board-v20-permissions.sql` per rimuovere privilegi predefiniti di TRUNCATE e invocazione dei trigger interni.

Ambito: `LiveSession.tsx`, `MinutesPanel.tsx`, `src/lib/board.ts`, RPC di seduta/verbale e documentazione delle fasi 2 e 5.

- Presentare la sequenza redazione → salvataggio versione → voto → approvazione → chiusura; correggere i messaggi che suggeriscono l'approvazione ordinaria dopo la chiusura.
- Impedire sul server la chiusura con una votazione aperta; nessuna votazione resta bloccata dalla chiusura della seduta.
- Allineare stato della seduta e stato del verbale, evitando di mostrare un verbale approvato come ancora da approvare dopo la chiusura.
- Non salvare o rigenerare testo sul verbale approvato tramite il normale editor; non votare una versione diversa da quella presentata, compreso testo locale non ancora salvato.
- Senza verbale approvato, richiedere soltanto una motivazione per la chiusura: vale anche senza quorum o con verbale respinto e conserva gli atti già validi. Il resoconto non approvato resta redigibile; nessuna approvazione ordinaria dopo la chiusura.
- Applicare l'art. 17.11 anche alla seduta senza quorum: resta un resoconto da sottoscrivere, distinto da un verbale approvato con una votazione valida. Non attribuire allo statuto la scelta applicativa di votare il verbale prima della chiusura.

Accettazione: chiusura durante voto rifiutata anche via RPC; approvazione prima della chiusura riuscita; approvazione ordinaria dopo la chiusura rifiutata; nessun percorso di uscita impossibile per la seduta senza quorum. Test di flusso frontend e test su PostgreSQL isolato.

### Passo 2 — Rendere il voto definitivo e identificare correttamente i votanti

Stato: implementato in `setup/board-v22.sql` e nel frontend; verificato su PostgreSQL nativo isolato, incluso il confronto tra due connessioni concorrenti in entrambi gli ordini. Su richiesta dell'utente, v22 applicata via MCP il 12/11/2026 al progetto esterno `cgbaunizlqqhctiiogok`, aggiornate `board-transcribe` (v4) e `board-draft-minutes` (v2), creata `board-dossier` (v1), tutte con JWT obbligatorio. Il frontend è consegnato con questo rilascio su `main` per l'aggiornamento automatico di Coolify. Verifica da checkout pulito: installazione `npm ci`, 34 test pertinenti passati (SQL, frontend, ZIP e autorizzazione Edge Function), TypeScript e lint mirato senza errori, build riuscita; controllo Deno delle tre funzioni riuscito. Verificati via MCP RLS, permessi e assenza di accesso anonimo alle nuove RPC. Nessun collaudo autenticato con account reali, nessuna elaborazione IA o cancellazione di audio reali avviata.

Ambito: RPC `board_ballot_vote`, `board_ballot_close`, `board_ballot_cancel`, presenze e cambi di stato della seduta; schemi voto in `board.ts`; `DeliberationsPanel.tsx` e `MinutesPanel.tsx`.

- Definire un ordine comune di acquisizione dei lock per seduta, votazione e atto; riusare i vincoli già presenti e tenere conto dei trigger introdotti dal v20.
- Verificare lo stato dopo aver acquisito i lock: un voto concorrente alla chiusura è incluso nell'esito oppure rifiutato, mai aggiunto dopo il conteggio definitivo.
- Conservare le verifiche di carica attuale, presenza identificata e quorum previste dalle regole, compreso il quorum alla chiusura.
- Allineare il conteggio agli artt. 17.7–17.8, dopo aver risolto i casi di astensione, voto mancante e parità indicati sopra. Registrare i dati usati per il conteggio, senza ricalcolare gli esiti storici con una nuova regola.
- Integrare la presidenza sostitutiva prevista dagli artt. 18.7 e 19.3–19.5: nomina o attivazione esplicita, causale ed eventi immutabili, con la stessa autorità riconosciuta nelle operazioni pertinenti e nel voto prevalente. Non promuovere globalmente un utente al ruolo permanente di Presidente.
- Gestire il conflitto di interessi per il punto ai sensi dell'art. 24: dichiarazione, uscita/rientro, blocco di discussione e voto; preservare il diritto a partecipare agli altri punti.
- Riconoscere il voto dell'utente tramite `user_id` o `participant_id`, mai tramite nome visualizzato.

Dettagli della consegna:

- Tutte le RPC che modificano righe della seduta acquisiscono prima il lock sulla riunione, poi sulle righe figlie. Il voto rilegge e blocca la votazione dopo quel lock. Heartbeat e servizi audio usano lo stesso ordine per convivere con i trigger v20.
- Il conteggio usa i presenti identificati con carica attuale e diritto di voto alla chiusura. Le schede di chi non è più eleggibile restano registrate con `counted: false`; favorevoli, contrari, astenuti, mancanti, aventi diritto, identità di chi presiede e identificatore della regola sono congelati nell'esito. Nessun ricalcolo delle votazioni storiche.
- La presidenza iniziale viene registrata all'apertura. La sostituzione del Vicepresidente richiede un'attivazione esplicita e una causale, con assenza del Presidente registrata. Se mancano entrambi, il verbalizzante con quorum registra il riferimento alla designazione del Consiglio: è l'attestazione di una decisione dell'organo, non un'elezione automatica del software. Nessun ruolo permanente viene modificato. Una votazione aperta impedisce il cambio di presidenza; se la carica decade, Presidente titolare o verbalizzante attuale possono annullare con motivazione prima di registrare la nuova presidenza.
- Il conflitto comporta dichiarazione motivata e uscita temporanea registrate. Il componente non discute né vota sulla delibera; il denominatore del quorum non diminuisce. Il rientro dopo il punto restituisce la partecipazione agli altri punti senza eliminare il conflitto. Un conflitto scoperto dopo aver votato richiede prima l'annullamento della votazione, preservando le schede già espresse.
- Le sorgenti `board-transcribe` e `board-draft-minutes` sono ora in `setup/functions/`: usano le RPC dell'utente per riconoscere chi presiede e il verbalizzante attualmente in carica. Il progetto managed locale non è il target del loro deployment. Il fascicolo include i conflitti e gli eventi della presidenza.

Accettazione: test concorrente voto/chiusura e voto/annullamento; perdita quorum; astensioni e voti mancanti secondo il criterio esplicitato; parità con voto di chi presiede legittimamente; Vicepresidente senza sostituzione non acquisisce poteri; conflitto esclude il singolo voto e registra uscita/rientro; due persone omonime vedono ciascuna il proprio voto; una sola votazione aperta per seduta.

### Passo 3 — Integrare le rettifiche in una successiva seduta

Stato: implementato in v23, con nuovi atti collegati, proposte indipendenti dall’archivio e presenze della nuova seduta; verificato su PostgreSQL isolato. Dettagli in [board-completion.md](board-completion.md).

Ambito: versioni e rettifiche del verbale, RPC di approvazione, `MinutesPanel.tsx`, selezione degli atti nella nuova seduta e sottoscrizioni Realtime/query.

- Rendere raggiungibile la proposta di rettifica dopo la chiusura e la sua presa in carico da Presidente/verbalizzante.
- Collegare la versione rettificata all'atto originario e la sua approvazione alla nuova seduta in corso, con le presenze e il quorum della nuova seduta.
- Conservare testo, approvazione, copia firmata e fascicolo originari; una nuova versione non eredita firma o approvazione della precedente.
- Non usare la modifica della vecchia seduta o il suo vecchio quorum come scorciatoia. Verificare come conservare il vincolo di archivio del v20: una rettifica di un atto archiviato deve essere un nuovo atto collegato, senza sbloccare l'archivio.
- Aggiornare entrambe le viste interessate e mantenere aggiornati revisione e rettifiche anche dopo la chiusura della seduta originaria.

Accettazione: seduta A chiusa e firmata → proposta di rettifica → seduta B con presenze proprie → voto → nuova versione approvata e nuovamente firmabile; originali sempre consultabili; accesso tecnico in sola lettura.

### Passo 4 — Consenso e ciclo di vita dell'audio

Stato: implementato in v25 e nel frontend, inclusi recupero locale e attestazione degli ospiti; verificato su PostgreSQL e browser con dispositivi sintetici.

Ambito: `AudioPanel.tsx`, `board-audio.ts`, RPC audio, Storage e funzione `board-transcribe`.

- Arrestare la registrazione quando viene revocato il consenso, termina la partecipazione verificata o la seduta viene sospesa/chiusa; liberare sempre il microfono anche quando l'avvio RPC fallisce.
- Evitare che un errore di caricamento perda l'unica copia dell'audio senza offrire un recupero; non confondere pausa e durata effettivamente registrata.
- Per una traccia condivisa, definire e registrare quali partecipanti sono inclusi e il relativo consenso, compresi gli invitati, senza obbligarli a consentire per partecipare alla riunione. Non dichiarare verificabile dal server il contenuto delle voci nel file.
- Integrare e verificare le restrizioni Storage presenti nel v20: lettura non implica scrittura; il file deve appartenere a una traccia autorizzata; un audio trascritto non è cancellabile dal client.

Accettazione: avvio senza consenso negato; revoca durante registrazione arresta il microfono; errore RPC non lascia il microfono acceso; audio condiviso senza evidenza dei consensi rifiutato; consigliere/admin non cancellano file altrui; caricamento fallito recuperabile.

### Passo 5 — Affidabilità della trascrizione e della bozza IA

Stato: implementato in v25 e nelle due Edge Function; durata misurata, budget condiviso e prenotazioni concorrenti verificati, provider simulato nei test. La redazione richiede tariffe stimate configurate dal Presidente.

Ambito: `board-transcribe`, `board-draft-minutes`, impostazioni IA, RPC di stato e prenotazione delle elaborazioni.

- Misurare o verificare la durata: non usare zero come durata di una traccia condivisa né fidarsi del solo valore inviato dal browser per un limite economico.
- Applicare il tetto stimato alla somma delle elaborazioni della riunione, con prenotazione atomica e protezione contro doppi avvii e tentativi ripetuti. Documentare che si tratta di una stima, distinta dalla fatturazione del provider.
- Se il limite deve coprire anche la redazione, includere le generazioni del verbale nel conteggio: non dichiarare un tetto complessivo con una parte dei costi esclusa.
- Rifiutare la generazione se mancano letture obbligatorie; fornire al modello testi ufficiali/versioni delle delibere, esiti, identità di Presidente/verbalizzante e dati attendibili del quorum.
- Ricontrollare l'autorizzazione del verbalizzante rispetto alle cariche attuali; distinguere fonti certe e trascrizioni incerte; conservare sempre il risultato come bozza da revisionare.

Accettazione: due tracce entro il limite singolarmente ma oltre il totale bloccano la spesa eccedente; doppia richiesta non duplica l'elaborazione; errore di lettura non genera un verbale con dati vuoti; verbalizzante decaduto rifiutato; IA disattivata lascia utilizzabile il percorso manuale.

### Passo 6 — Integrare e verificare firma, fascicolo e archivio

Stato: completato con resoconto firmabile non approvato, firme delle rettifiche e file reali delle delibere nello ZIP (v23–v25). Test di integrità e archivio su dati sintetici passati.

Ambito: lavoro in corso v20, `DossierPanel.tsx`, `board-dossier.ts`, Edge Function `board-dossier`, generazione Word/ZIP e guide delle fasi.

- Riutilizzare e revisionare il lavoro già presente, verificando che nessun atto archiviato possa essere cambiato mediante RPC o Storage.
- Rendere scaricabile la copia firmata e legarla alla versione approvata; nessuna nuova versione risulta già firmata.
- Completare il fascicolo con convocazione, presenze, verbale firmato, delibere, voti ed eventi; chiarire che i documenti collegati alle delibere sono oggi metadati, e implementare caricamento/lettura dei file se devono entrare nello ZIP.
- Verificare impronta e completezza del fascicolo prima di ogni cancellazione; modifiche intervenute durante la preparazione ne richiedono la rigenerazione.
- Rendere l'archiviazione ripetibile dopo un'interruzione, con atti bloccati e stato visibile. Eliminare audio e trascrizioni soltanto dopo la verifica e la conferma esplicita prevista dall'interfaccia; conservare gli atti e il registro eventi.

Accettazione: file firmato assente blocca l'export; ZIP alterato blocca l'archivio; archivio interrotto riprendibile; nessuna cancellazione prima della verifica; atti intatti dopo la pulizia; rettifica successiva crea un atto collegato senza alterare il fascicolo originario.

### Passo 7 — Collaudo integrato e attivazione esterna

Ambito: lockfile, ambiente PostgreSQL isolato, test frontend/SQL/Edge Function, guide di installazione e collaudo con account reali.

- Ripristinare un'installazione riproducibile delle dipendenze senza aggiornamenti estranei; verificare la sequenza di migrazioni e gli effetti della riesecuzione degli script precedenti.
- I nuovi script correttivi rimangono in `setup/`. Non assegnare ora un numero di migrazione che possa collidere con il v20 in lavorazione. Le sorgenti delle funzioni esterne non devono attivare deployment sul progetto managed indicato dalla configurazione locale.
- Eseguire test PostgreSQL isolati per permessi, transazioni, concorrenza, versioni e archiviazione; testare le policy Storage con privilegi realistici, non solo le tabelle pubbliche.
- Eseguire il flusso completo con Presidente, verbalizzante, consigliere, amministratore tecnico e utente non autorizzato; includere omonimi, perdita quorum, revoca consenso e interruzione dell'archiviazione.
- Includere una presidenza sostitutiva, un conflitto sul singolo punto, astensioni e voti mancanti. Dichiarare esplicitamente l'eventuale assenza del percorso di richiesta di convocazione da un terzo dei componenti e della prova di comunicazione della convocazione: tali adempimenti restano organizzativi e non sono sostituiti dal solo clic «Convoca».
- Ripetere build e controllo TypeScript dopo l'integrazione. Fornire istruzioni di installazione delle migrazioni e delle Edge Function sul progetto esterno corretto.
- Solo su richiesta esplicita: installazione esterna e prova su due dispositivi. Non usare dati reali per i test di cancellazione.

Accettazione finale: ciascun passo precedente verificato; installazione riproducibile; flusso completo e percorso di rettifica riusciti; test negativi sui permessi riusciti; nessuna operazione esterna effettuata implicitamente.

## Consegna del 13/11/2026

V23–v26 installate via MCP sul progetto esterno. Edge Function aggiornate: trascrizione v5, redazione v3, fascicolo v2; creata `board-room` v1. Tutte richiedono JWT. Verifiche e limiti descritti nel documento di completamento; nessun test distruttivo con dati reali.

## Prossimo intervento

Attivazione pubblica della stanza sullo stesso server Coolify, dopo la scelta del dominio e la configurazione DNS/TLS/porte/segreti; collaudo con account e dispositivi reali. Implementazione e limiti sono descritti in [board-completion.md](board-completion.md) e [guida Coolify](../deploy/board-live/README.md).

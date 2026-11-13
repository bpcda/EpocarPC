# Audit del processo del Consiglio e della produzione documenti

Data: 13 novembre 2026. Codice esaminato: `792f7fe`. Stato iniziale: audit e proposta. Aggiornamento successivo: implementazione dei rilievi in v27–v28; revisione a posteriori autorizzata dall’utente. Per stato operativo e limiti attuali vedere [routine](board-codex-routine.md).

## Ambito e riscontri

Esaminato il percorso convocazione → identificazione e consensi → seduta e voti → trascrizione → bozza → approvazione → chiusura → firma → fascicolo. Carico assunto: sette componenti, riunione di 60–120 minuti, uso prevalentemente da PC.

Letture sul progetto Supabase esterno: impostazioni IA e presenza della chiave, senza esporre segreti o acquisire audio reali. Configurazione presente: OpenAI, `whisper-1`, `gpt-4o-mini`, IA abilitata, tetto stimato €5 per seduta; entrambe le tariffe della redazione sono NULL. La presenza della chiave non dimostra la sua validità o la disponibilità del credito.

Confermata in sola lettura anche la definizione delle funzioni installate: il battito aggiorna `last_seen_at`, mentre il contesto IA comprende l'intera riga del partecipante. Riproduzione su PostgreSQL 16 isolato, con lo schema sintetico e le migrazioni v15–v26: prenotazione e avvio di un lavoro di redazione, un solo battito, completamento con testo sintetico. Dati ufficiali invariati, impronta diversa, lavoro `failed`, messaggio «Dati cambiati: bozza conservata ma non applicata», risultato conservato. Zero richieste a pagamento al provider. Script diagnostico temporaneo: `/tmp/epocar-ai-process-audit.mjs`.

## Scelta del percorso IA

Aggiornamento concordato il 13 novembre 2026: integrare una routine personale Codex nel percorso proposto. La redazione usa la CLI ufficiale autenticata con l'account ChatGPT dell'utente; la trascrizione è un passaggio separato. Il dettaglio è nella sezione «Routine personale Codex». Questa è una scelta di progetto, non un'automazione già attivata.

La raccomandazione iniziale, precedente a questa scelta, era completare la connessione OpenAI già presente: `whisper-1` per l'audio e `gpt-4o-mini` per la redazione. Il percorso API rimane un'alternativa esplicita, senza attivazione o ripiego automatico quando Codex non è disponibile. I prezzi seguenti riguardano tale alternativa, non il consumo della quota Codex.

Prezzi pubblicati verificati: Whisper $0,006/minuto; GPT-4o mini $0,15 per milione di token in ingresso e $0,60 in uscita. Esempio: un'ora di una sola traccia costa $0,36 per la trascrizione; sette tracce individuali da un'ora costano $2,52. Una redazione da 10.000 token in ingresso e 2.000 in uscita costa circa $0,0027. Sono esempi in dollari, esclusi cambio/imposte, non le stime in euro del dashboard e non una prova di qualità. [Whisper](https://developers.openai.com/api/docs/models/whisper-1), [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini).

DeepSeek è un'alternativa per la redazione. La sua API ASR supporta anche l'italiano, ma il contratto attuale accetta WAV PCM/Ogg Opus, con massimo 120 secondi per richiesta: le registrazioni WebM lunghe dell'app richiederebbero conversione e segmentazione. Cambiare semplicemente l'URL nelle impostazioni non basta. Il risparmio sulla sola redazione non giustifica ora questa integrazione aggiuntiva. [ASR DeepSeek](https://api-docs.deepseek.com/guides/asr), [prezzi](https://api-docs.deepseek.com/quick_start/pricing/).

Per la routine scelta, Codex supporta l'accesso con ChatGPT e `codex exec` riusa l'autenticazione salvata. La modalità non interattiva è documentata anche per elaborazioni programmate e riepiloghi; il consumo rientra nei limiti del piano. La normale fatturazione con chiave API è invece distinta. [Autenticazione](https://learn.chatgpt.com/docs/auth), [esecuzione non interattiva](https://learn.chatgpt.com/docs/non-interactive-mode), [limiti](https://learn.chatgpt.com/docs/pricing).

## Da correggere prima dell'automazione

### 1. Un aggiornamento della connessione rende obsoleta la bozza

**Cosa fa:** l'impronta del contesto impedisce di applicare una bozza se i dati ufficiali cambiano durante la generazione. **Problema:** il contesto contiene anche `last_seen_at`, aggiornato ogni 20 secondi da ciascun client. Il difetto è stato riprodotto su PostgreSQL isolato e riscontrato nel codice installato.

**Modifica minima:** escludere dal contesto e dall'impronta i metadati di connessione, conservando presenze identificate, quorum, testi, versioni, voti e relativi eventi. **Conseguenza se rinviato:** una generazione riuscita dal provider può restare non applicata e richiedere recupero manuale; il costo già avviato rimane conteggiato.

Fonti: [contesto](../setup/board-v25.sql#L129), [controllo finale](../setup/board-v25.sql#L232), [battito](../setup/board-v22.sql#L224), [timer client](../src/components/board/LiveSession.tsx#L73).

### 2. La redazione è bloccata dalla configurazione corrente

**Cosa fa:** il server prenota il costo stimato prima di chiamare il provider. **Problema:** le due tariffe della redazione sono NULL nella configurazione attuale: la RPC rifiuta la prenotazione.

**Modifica minima:** configurare una volta tariffe stimate in euro esplicite e mostrare lo stato di disponibilità prima del pulsante di generazione. Il limite €5 resta una stima cumulata, non un tetto della fattura OpenAI. **Conseguenza se rinviato:** anche con chiave e modello presenti, il verbalizzante non ottiene la bozza. Nessun aumento automatico del budget.

Questo rilievo riguarda il percorso API esistente. La routine Codex deve avere un percorso esplicito con disponibilità del worker e limiti del piano: non deve fingersi una chiamata API con tariffa zero né aggirare le prenotazioni delle eventuali trascrizioni API.

Fonte: [prenotazione e impostazioni](../setup/board-v25.sql#L163).

### 3. Chiamata e registrazione usano sorgenti indipendenti

**Cosa fa:** LiveKit trasporta la conversazione; «Avvia la mia registrazione» apre un altro flusso dal microfono locale. **Problema:** una persona che registra non acquisisce automaticamente le voci remote; inoltre «Spegni microfono» nella chiamata non ferma il registratore separato. Una frase non comunicata al Consiglio può quindi finire nella traccia individuale. Riscontro sul codice; non sono state acquisite voci reali per questa verifica.

**Modifica:** definire una sorgente coerente con la conversazione effettiva, rispettare lo stato del microfono e mostrare chi/cosa viene registrato. Per l'uso remoto, valutare una registrazione controllata della stanza, coordinata da presidente/verbalizzante, oppure tracce individuali collegate alla pubblicazione reale. Per presenza e modalità ibrida vanno gestiti anche i consensi delle persone udibili. **Conseguenza se rinviato:** verbali incompleti o basati anche su audio estraneo alla discussione, con operazioni richieste a ogni partecipante.

Fonti: [microfono del registratore](../src/components/board/AudioPanel.tsx#L372), [microfono LiveKit](../src/components/board/LiveRoomPanel.tsx#L162), [registratore](../src/lib/board-recording.ts#L91).

### 4. Una bozza può partire con trascrizioni parziali

**Cosa fa:** il contesto raccoglie le tracce nello stato `trascritta`. **Problema:** se ci sono tracce caricate, in corso o fallite, non le attende e non presenta una verifica della copertura prima della redazione. Una fonte omessa non equivale a una fonte letta correttamente.

**Modifica minima:** controllo preliminare delle tracce attese e disponibili, elaborazione delle sole mancanti, arresto su errore e indicazione delle parti da verbalizzare manualmente. Il diniego alla registrazione non deve impedire la partecipazione o il percorso manuale. **Conseguenza se rinviato:** una bozza apparentemente completa può omettere interventi. Non ricostruire presenze o voti dall'audio: usare sempre i dati ufficiali.

Fonti: [selezione delle trascrizioni](../setup/board-v25.sql#L148), [generazione](../setup/functions/_shared/board-ai.ts#L184).

## Da accorpare per ridurre il lavoro

### 5. Trascrizioni, bozza e file non hanno una regia unica

**Cosa fa:** ogni traccia si trascrive con un comando; la bozza si genera da un'altra vista; Word e fascicolo hanno comandi distinti. **Problema:** il verbalizzante coordina a mano dipendenze e completamenti. Inoltre il fascicolo attuale raccoglie testi TXT/JSON e copie firmate; il Word del verbale si scarica a parte. Il prompt chiede spazi per le firme che il generatore Word aggiunge già, con possibile duplicazione.

**Modifica:** un'azione «Prepara documenti» con avanzamento e stato sul server, riusando i lavori IA idempotenti già presenti. L'IA riceve trascrizioni, modello e dati ufficiali per la parte narrativa; il sistema impagina i file, riporta fedelmente gli atti e aggiunge le firme una sola volta. Ripresa dopo interruzioni e nessun tentativo a pagamento implicito. **Conseguenza se rinviato:** rimane una sequenza di clic tecnici e il pacchetto desiderato non arriva automaticamente.

Il pacchetto per la revisione può contenere convocazione, bozza del verbale, presenze e delibere in formati leggibili, con versione/stato espliciti. Il fascicolo definitivo resta legato agli atti approvati o ai resoconti correttamente qualificati, alle copie firmate e alla verifica di integrità. Audio e trascrizioni temporanee non vanno aggiunti automaticamente al fascicolo destinato alla conservazione.

Fonti: [trascrizione per traccia](../src/components/board/AudioPanel.tsx#L752), [bozza](../src/components/board/MinutesPanel.tsx#L85), [Word](../src/lib/board-docx.ts#L68), [ZIP](../setup/functions/board-dossier/zip.ts#L42), [fascicolo e archivio](../src/components/board/DossierPanel.tsx#L18).

### 6. Informazioni già disponibili vengono richieste nuovamente

**Cosa fa:** la convocazione è divisa in cinque viste, compresa la lista automatica dei componenti; la riunione remota richiede di incollare un link; le presenze richiedono una nota libera; una nuova delibera parte vuota anche se il punto ODG ha già una proposta. **Problema:** il presidente e il verbalizzante ripetono dati o scrivono formule ricorrenti.

**Modifica minima:** modulo unico con dettagli facoltativi; link interno alla seduta generato dal sistema; metodo di identificazione selezionabile e nota motivata nelle eccezioni; proposta dell'ODG che precompila la delibera senza sovrascrivere testo già scritto. Conferme di identità e responsabilità restano esplicite. **Conseguenza se rinviato:** più tempo impiegato nei moduli e maggior rischio di incoerenze tra convocazione, proposte e atti.

Fonti: [convocazione](../src/components/board/ConvocationWizard.tsx#L15), [validazione link](../src/lib/board.ts#L77), [controllo server link](../setup/board-v15.sql#L128), [presenze](../setup/board-v22.sql#L141), [nuova delibera](../src/components/board/DeliberationsPanel.tsx#L47).

### 7. «Convoca» non comunica da solo la convocazione

**Cosa fa:** il portale salva lo stato e produce il documento. **Problema:** il percorso esaminato non invia la comunicazione ai componenti. Lo statuto, art. 17.2, richiede strumenti idonei a garantirne la conoscenza.

**Modifica minima:** preparare automaticamente testo e link da inoltrare con il canale associativo usato; distinguere salvataggio da comunicazione e conservarne il riferimento. Un invio diretto a email/messaggistica richiederebbe una distinta autorizzazione al servizio di comunicazione. **Conseguenza se rinviato:** si può credere completato un adempimento che è rimasto organizzativamente da fare.

Fonti: [salvataggio/stato](../src/pages/Consiglio.tsx#L86), statuto art. 17.1–17.4, testo già fornito dall'utente e mappato nel [piano](board-integration-plan.md#fonte-delle-regole-statuto-caricato).

## Scelta organizzativa da rivedere solo se desiderata

### 8. Revisione a posteriori autorizzata dopo l’audit

**Cosa fa:** il normale flusso applicativo prevede approvazione del verbale nella stessa seduta, prima della chiusura. **Problema:** richiede tempo per generare, leggere, correggere e votare anche dopo la chiusura, purché il verbale sia ancora modificabile. Lo statuto, art. 17.11, richiede redazione e sottoscrizione di presidente e verbalizzante, senza prescrivere espressamente questa votazione preventiva.

**Possibile semplificazione da concordare:** riesaminare la scelta organizzativa, distinguendola dagli obblighi statutari e dai voti sulle deliberazioni. Scelta successivamente aggiornata dall’utente: revisione anche dopo la chiusura; nessuna approvazione fittizia e rettifiche degli atti firmati/approvati in una nuova seduta. **Conseguenza se mantenuta:** è accettabile, ma la produzione della bozza deve partire a fine lavori prima di chiudere, non soltanto dopo che tutti hanno lasciato la seduta.

Fonti: [regole concordate](board-integration-plan.md#obiettivo-e-regole-concordate), [chiusura](../setup/board-v23.sql#L173), statuto art. 17.11–17.12.

## Percorso proposto

1. **Prepara e comunica:** data/modalità, ODG e verbalizzante in un unico modulo; componenti e link automatici; comunicazione pronta per il canale associativo.
2. **Apri:** conferma identità e presenze; quorum calcolato dal server. Consenso alla registrazione raccolto separatamente, senza escludere chi lo nega.
3. **Conduci:** punto ODG → proposta precompilata → eventuale voto. Presidenza sostitutiva e conflitti solo quando si verificano.
4. **Prepara documenti:** a fine lavori, arresto coordinato della cattura e verifica della copertura; una routine personale trascrive le fonti disponibili e passa trascrizioni, modello e dati ufficiali a Codex; bozza e pacchetto tornano nell'area privata per la revisione. Nessuna decisione inventata dall'IA; evidenza delle parti da integrare.
5. **Completa:** chiusura e revisione anche a posteriori, poi firme e copia firmata; preparazione/scaricamento del fascicolo. Conferma separata prima di eliminare i materiali temporanei.

L'obiettivo è togliere clic ripetitivi e coordinamento tecnico, preservando identificazione, quorum, voto sulle decisioni, conflitti, consensi, tracciabilità, sottoscrizioni e conservazione. La prima implementazione dovrebbe correggere 1–4 e collegare i passaggi del punto 5; le semplificazioni organizzative del punto 8 restano una scelta distinta.

## Routine personale Codex

Stato aggiornato: implementata in v27–v28 e nella routine locale; collegamento iniziale del PC da effettuare con l’account autorizzato. `codex login status` sull'ambiente locale restituisce «Logged in using ChatGPT». Successivamente provata una chiamata Codex reale con soli dati sintetici e installato il servizio locale; nessun messaggio WhatsApp inviato in assenza di destinatario esplicito.

### Esperienza sul sito

Presidente o verbalizzante seleziona **Prepara documenti** anche dopo la chiusura, purché il verbale sia ancora modificabile. L'interfaccia mostra soltanto avanzamento, problemi da risolvere e risultato: «In attesa della routine» → «Trascrizione» → «Redazione» → «Pronto da rivedere». Dopo un'interruzione riprende il lavoro esistente. Fonti mancanti o errori restano visibili; una copertura parziale richiede una scelta esplicita e integrazione manuale.

La routine è personale, eseguita inizialmente sul PC/WSL dell'utente con la CLI già autenticata. Un processo locale controlla periodicamente la coda privata del sito; il pulsante accoda un lavoro, senza richiedere al verbalizzante di gestire file, email o comandi. Se il PC è spento o sospeso il lavoro resta in attesa. La frequenza e l'avvio automatico andranno configurati nell'implementazione. Un'eventuale collocazione server richiede una valutazione distinta, sempre nel solo progetto EpocarPC.

### Elaborazione e restituzione

1. **Raccogliere le fonti.** Il server prepara una fotografia revisionata della seduta: convocazione, ODG, identità e presenze verificate, presidenza/verbalizzante, quorum, delibere con testi e voti ufficiali, modello del verbale e materiali necessari. Solo registrazioni finalizzate e coperte dai consensi, con riferimenti privati a scadenza. L'impronta comprende i dati ufficiali, escludendo heartbeat e altri metadati volatili.
2. **Trascrivere l'audio.** Prima usare le trascrizioni già disponibili. Per evitare costi API al minuto, il percorso proposto usa un motore locale Whisper, ad esempio [faster-whisper](https://github.com/SYSTRAN/faster-whisper), da installare e misurare sull'hardware effettivo. La CLI Codex qui verificata non offre un ingresso audio diretto: il piano non include automaticamente questo servizio di trascrizione. Conservare riferimenti alle tracce e intervalli temporali; attribuzioni incerte restano incerte. Le trascrizioni rientrano sul sito attraverso un endpoint controllato e la RPC service-role esistente, senza scritture dirette del worker alle tabelle.
3. **Redigere con Codex.** Un'invocazione non interattiva riceve testi e modello, trattando trascrizioni e allegati come dati. Produce testo del verbale e parti da verificare tramite output strutturato validato. Il programma impagina Word e ZIP riusando i generatori esistenti; dati e voti ufficiali sono riportati dal sistema senza ricostruirli dall'audio. Il prompt non aggiunge firme già previste dal modello.
4. **Restituire una bozza privata.** Il worker invia il risultato; il server ricontrolla ruolo corrente del richiedente, consenso valido per l'elaborazione, revisione e impronta. Un risultato obsoleto resta recuperabile, senza sovrascrivere modifiche o atti approvati. Il pacchetto di revisione contiene bozza Word, presenze, delibere, riferimenti delle fonti e punti da verificare, con stato/versione riconoscibili. Audio e trascrizioni restano materiali temporanei separati.
5. **Completare sul sito.** Presidente e verbalizzante revisionano anche dopo la chiusura. Le votazioni restano chiuse e non viene simulata un’approvazione tardiva. Rimane l'eccezione già concordata della chiusura motivata senza approvazione, senza attribuire un voto inesistente. Seguono firme/copia firmata e fascicolo definitivo. La routine non vota, non approva, non firma e non cancella automaticamente le registrazioni.

### Ripresa, accessi e notifiche

Un solo lavoro per seduta/revisione, con presa in carico esclusiva, stato persistente e ripresa dopo interruzioni; il tempo di attesa non viene presentato come completamento. Prima del rilascio vanno misurati trascrizione e redazione su una registrazione rappresentativa: per approvare nella stessa seduta, il tempo deve essere compatibile con la revisione prima della chiusura. In caso contrario restano utilizzabili testo manuale ed eccezione di chiusura motivata.

Il worker accede soltanto ai lavori autorizzati e ai relativi file; credenziali del sito limitate a prelievo e restituzione del singolo lavoro, esterne al processo Codex. Codex riceve solo la cartella delle fonti, senza credenziali Supabase/Coolify o connettori personali. Usare l'autenticazione ufficiale della CLI, senza esportare token in repository, browser o messaggi. I consensi e l'informativa devono descrivere il percorso effettivo: audio trascritto localmente, testi necessari elaborati tramite Codex/OpenAI. La redazione non è quindi interamente locale.

Email e WhatsApp sono canali facoltativi per un avviso con link privato. Il sito resta il punto di raccolta dei documenti: non serve spedire grandi ZIP audio per email né dare accesso alla casella alla routine. Il collegamento deve richiedere l'accesso autorizzato, senza credenziali nel messaggio. Invii reali e integrazione WhatsApp non sono attivati; il numero Kapso EpocarPC è stato verificato connesso e il template dedicato creato. Attivazione degli avvisi subordinata a destinatario esplicito e approvazione del template, senza assumere invii gratuiti.

### Costi, disponibilità e primo collaudo

Codex usa la quota dell'account personale: limiti esauriti o autenticazione scaduta lasciano il lavoro in attesa/intervento richiesto, senza acquisto automatico di crediti o passaggio a API a pagamento. La trascrizione locale impiega risorse del PC e deve superare una prova di qualità italiana e durata. Successivamente installato faster-whisper 1.2.1 con PyAV 16.0.1; resta da misurare su parlato associativo reale.

Prima dell'attivazione: correggere l'impronta e la cattura descritti nell'audit; verificare copertura e consensi; provare una seduta sintetica completa, un'interruzione/ripresa, una doppia richiesta, una modifica ufficiale durante la redazione e un risultato restituito da un soggetto non autorizzato. Confermare che si produca soltanto una bozza, senza mutare voti, approvazioni, firme o fascicoli definitivi. Il percorso API già presente resta separato e utilizzabile solo con configurazione e scelta esplicite.

## Limiti

Questo audit non modifica codice, impostazioni o regole in produzione. Non sono stati inviati audio reali o richieste IA a pagamento; non è stata misurata la qualità dei provider su registrazioni associative né verificata la fatturazione effettiva. Non è un audit dell'intero repository o delle altre funzionalità del sito. Il budget corrente non è stato aumentato. L'adozione di una registrazione della stanza richiede una verifica dedicata dei consensi, della cattura effettiva e delle risorse del server, nel solo progetto EpocarPC.

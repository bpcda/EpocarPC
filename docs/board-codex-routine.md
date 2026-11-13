# Routine personale per i documenti del Consiglio

La seduta può chiudersi prima della redazione/revisione del verbale. Presenze e voti restano chiusi; presidente e verbalizzante possono completare una bozza non firmata. I componenti possono proporre osservazioni. Un atto approvato o firmato resta protetto: le successive rettifiche seguono il percorso tracciato della nuova seduta. Nessuna approvazione digitale o firma è attribuita dalla routine.

## Percorso quotidiano

1. Confermare le presenze e raccogliere i consensi sull'informativa corrente.
2. Presidente/verbalizzante avvia la registrazione della stanza o della sala. Da remoto sono acquisiti soltanto i microfoni pubblicati dei partecipanti inclusi con consenso; spegnere il microfono della chiamata esclude quel segnale. Per nuovi partecipanti o consensi, terminare la traccia e iniziarne una nuova. La disconnessione del dispositivo che registra ferma la cattura; il browser conserva il file locale in caso di mancato caricamento.
3. Terminare e caricare le tracce; la seduta si può chiudere lasciando il verbale in revisione.
4. In «Verbale», verificare copertura e appunti; scegliere «Prepara documenti con Codex». Il sistema attende il PC, trascrive e redige. Ripete soltanto i passaggi necessari e conserva gli esiti obsoleti senza applicarli.
5. Rivedere testo e note, accogliere/valutare le osservazioni, scaricare il pacchetto di revisione e il Word corrente per le firme. Caricare la copia sottoscritta e preparare il fascicolo definitivo con i controlli già esistenti.

L'impronta del contesto conserva i dati ufficiali, escludendo il battito di collegamento e gli eventi tecnici prodotti dall'elaborazione. Una modifica ufficiale durante la redazione impedisce la sovrascrittura. L'API a pagamento resta un'alternativa esplicita: tariffe mancanti o fonti incomplete la bloccano; la routine Codex non vi passa automaticamente.

## Prima configurazione sul PC/WSL

Prerequisiti: Node, Python con venv, Codex CLI autenticata con ChatGPT e, se si desiderano gli avvisi, Kapso CLI autenticata sul progetto EpocarPC. La routine non riceve chiavi amministrative Supabase/Coolify. Il servizio locale non modifica la configurazione globale Kapso.

```bash
rtk proxy node scripts/install-board-worker.mjs
```

Sul sito, presidente o verbalizzante collega il PC dalla sezione Verbale e scarica `epocar-board-worker.json`. Se desidera gli avvisi indica il proprio numero WhatsApp. Importare il file, passando il percorso effettivo dei download:

```bash
rtk proxy node scripts/board-worker.mjs --configure /percorso/epocar-board-worker.json
rtk proxy systemctl --user status epocar-board-worker.service
```

L'importazione copia la configurazione in `~/.config/epocar/board-worker/config.json` con permessi 600 e rimuove il file sorgente. Se il browser conserva altre copie nei download, eliminarle. Il token dura 90 giorni ed è revocabile dal sito; ricollegare lo stesso account invalida quello precedente. La routine controlla la coda ogni 30 secondi e rinnova la presa in carico ogni 20 secondi. PC spento/sospeso o servizio fermo: i lavori rimangono in attesa.

Il transcriber usa faster-whisper 1.2.1, modello multilingue `small`, CPU/int8. PyAV è fissato alla versione compatibile 16.0.1. Il modello viene scaricato al primo avvio; velocità e qualità vanno misurate con una breve registrazione rappresentativa. Il testo necessario viene elaborato da Codex/OpenAI, quindi la redazione non è interamente locale.

Codex viene eseguito senza configurazione utente, shell, connettori personali o browser, con output JSON validato. Consuma la quota del piano; autenticazione scaduta, limite raggiunto o errore richiedono intervento esplicito. Nessun acquisto di crediti o ripiego a pagamento automatico. Il worker usa credenziali limitate alla propria coda e deve mantenere il ruolo di presidente/verbalizzante per quella seduta.

## Ripresa e materiali temporanei

Il server conserva stato, bozza e note. Le richieste concorrenti riusano il lavoro attivo. Dopo due minuti senza rinnovo un altro processo con lo stesso collegamento può riprendere il lavoro; il processo locale impedisce due istanze contemporanee. Le trascrizioni e l'output validato sono riusati dalla cache del singolo lavoro dopo un'interruzione. Gli errori richiedono una nuova richiesta esplicita; le trascrizioni già importate sul sito non vengono ripetute.

Le copie audio locali della routine vengono eliminate dopo la trascrizione riuscita; la cartella del lavoro viene rimossa dopo il caricamento riuscito della bozza. Un lavoro interrotto può lasciare materiali in `~/.config/epocar/board-worker/jobs/`: conservarli soltanto per il recupero e rimuoverli dopo la conclusione, senza confonderli con il fascicolo ufficiale. Il browser può conservare separatamente audio ancora da caricare. L'archiviazione del sito non cancella i file di un altro dispositivo.

I pacchetti per revisione includono convocazione Word, verbale Word, presenze, delibere/votazioni e riferimenti di versione. Audio e trascrizioni non vengono aggiunti allo ZIP. Il fascicolo definitivo rimane quello prodotto dal percorso firma/archivio esistente.

Gli avvisi WhatsApp passano dal [progetto Kapso EpocarPC](../deploy/kapso/README.md); il documento resta consultabile soltanto sul sito con i permessi del Consiglio.

## Installazione sul progetto esterno

Applicare nell'ordine `setup/board-v27.sql` e `setup/board-v28.sql`, dopo v26. Pubblicare `board-worker` con `verify_jwt=false`: l'endpoint controlla autonomamente il token revocabile e le RPC service-only; non accetta una semplice chiave pubblica come autorizzazione. Le funzioni per utenti mantengono JWT obbligatorio. Aggiornare `board-draft-minutes` e `board-transcribe` per il prompt condiviso.

La migrazione aggiorna l'informativa standard da `v1` a `v2-codex`; i partecipanti devono rinnovare il consenso prima di nuove registrazioni. Le tracce con informativa precedente non vengono automaticamente inoltrate al nuovo percorso Codex. Gli atti e le registrazioni già presenti restano conservati; usare il percorso autorizzato originariamente o la redazione manuale per le fonti precedenti.

Stato di rilascio al 14/11/2026: migrazioni v27–v28 applicate a `cgbaunizlqqhctiiogok`; `board-worker` v1, `board-transcribe` v8 e `board-draft-minutes` v6 attive. Servizio locale installato e in esecuzione, senza configurazione di un account del Consiglio finché presidente/verbalizzante non effettua il collegamento. Prova Codex reale riuscita con dati sintetici; nessun audio reale trattato o messaggio WhatsApp inviato.

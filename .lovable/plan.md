# Evento Epocar × Mossi 1558

## Obiettivo
Realizzare una pagina evento e un percorso di prenotazione comodo da smartphone, con o senza auto/moto d’epoca, anche senza account Epocar. Una prenotazione comprende tutte le persone e tutti i veicoli indicati: non è una domanda di adesione all’associazione.

La foto caricata è un riferimento grafico composto da più schermate, non una fotografia di copertina da pubblicare. Il sito manterrà lo stile Epocar; per la copertina useremo inizialmente una foto già disponibile, sostituibile dall’amministratore. Titolo e informazioni provvisorie saranno chiaramente revisionabili; data e prezzi della schermata non saranno trattati come confermati.

## 1. Pagina evento e impostazioni
- Integrare il nuovo percorso nelle pagine eventi esistenti senza modificare i moduli degli altri eventi.
- Mostrare copertina, titolo, data e orari italiani, luogo, programma, descrizione e prezzo.
- Subito sotto le informazioni principali, presentare nell’ordine:
  1. **Parteciperò senza auto o moto d’epoca** — degustazione vini + aperitivo.
  2. **Parteciperò con auto o moto d’epoca** — giro panoramico + esposizione veicoli + degustazione vini + aperitivo.
- Rendere modificabili dal pannello amministrativo contenuti, prezzi per modalità, attività disponibili, limiti complessivi di persone e veicoli e limiti selezionabili nella singola prenotazione. Un limite non impostato non implica disponibilità inventata.
- Preparare l’evento Mossi come bozza da completare e pubblicare, senza inserire eventi o prenotazioni nel database reale.

## 2. Prenotazione
- Richiedere nome, cognome, email, telefono, numero di partecipanti e accettazione dell’informativa privacy dell’evento.
- Per la modalità con veicoli, affiancare numero di partecipanti e numero di veicoli e consentire selezione indipendente di giro ed esposizione.
- Generare una scheda per ogni veicolo: tipologia, marca, modello, anno e targa obbligatori.
- Conservare i dati delle schede quando si aumenta il numero; chiedere conferma prima di eliminare schede compilate quando lo si riduce.
- Consentire controllo del riepilogo prima dell’invio; gestire campi errati, invio in corso, posti esauriti e tentativi ripetuti senza duplicare prenotazioni.

## 3. Account e garage
- Per utenti autenticati, precompilare i dati dal proprio profilo e mostrare esclusivamente il proprio garage, consentendo selezione di veicoli esistenti o inserimento di nuovi.
- Per ospiti, offrire **Hai già un account Epocar? Accedi**, con ritorno al modulo e conservazione temporanea dei dati nella stessa sessione del browser; cancellarli dopo la prenotazione o la scadenza.
- La digitazione dell’email non cercherà né mostrerà profili o veicoli esistenti.
- Nella modalità con veicoli, mostrare la casella richiesta **Non registrare me e i miei veicoli al sito Epocar**, inizialmente non selezionata.
- Casella selezionata: solo prenotazione evento, senza profilo o garage permanente.
- Casella non selezionata: proposta di creazione account chiaramente dichiarata, con accettazione separata delle condizioni e dell’informativa. Nessun consenso promozionale implicito.
- La prenotazione resterà valida indipendentemente dall’attivazione account. Il garage sarà salvato soltanto dopo verifica dell’account; per email già registrate il percorso inviterà ad accedere senza duplicare account né rivelarne pubblicamente l’esistenza.
- Non cambiare globalmente l’impostazione di conferma email del sito: il percorso di attivazione richiesto dovrà essere compatibile con la configurazione del servizio esterno, anche se la conferma ordinaria è disattivata.

## 4. Conferma ed email
- Salvare una prenotazione unica con riferimento univoco, contatti, persone, snapshot dei veicoli, attività e accettazioni datate.
- Mostrare conferma e riepilogo leggibile.
- Preparare invio riepilogo e, quando richiesto, attivazione account usando il servizio email del progetto esterno, senza assumere che la posta sia già funzionante.
- Separare esito della prenotazione ed esito email: un errore di invio non annullerà la prenotazione né produrrà una falsa conferma di email spedita. Predisporre stato amministrativo e reinvio protetto senza duplicare la prenotazione.
- Consegnare istruzioni di configurazione e verifica per il servizio esterno; l’invio reale resta da provare dopo l’installazione.

## 5. Amministrazione ed esportazioni
- Estendere la sezione iscrizioni con modalità, riferimento, contatti, numero di persone, numero e dettagli dei veicoli, giro ed esposizione e stato email.
- Visualizzare totali separati: prenotazioni, persone, veicoli e attività.
- Esportare CSV utilizzabile in Excel: un elenco prenotazioni con persone conteggiate una sola volta e un elenco veicoli collegato mediante riferimento prenotazione. Proteggere i valori dall’esecuzione di formule in Excel.
- Leggere tutti i risultati con paginazione, senza troncare iscritti o totali.

## Dettagli tecnici
- Riutilizzare il client e le strutture esistenti; aggiungere un percorso di prenotazione dedicato e opt-in per gli eventi configurati, mantenendo compatibile il modulo generico attuale.
- Preparare SQL installabile in `setup/` per impostazioni, prenotazioni e veicoli, con GRANT espliciti, RLS e funzioni validate; nessuna migrazione eseguita sul servizio disponibile in Lovable come sostituto del database esterno.
- Inviare prenotazioni ospiti attraverso una funzione server con validazione; non esporre letture pubbliche delle prenotazioni o ricerca account per email. Convalidare i JWT presenti e verificare sul server proprietà dei veicoli selezionati.
- Applicare limiti e disponibilità in transazione sul server, con blocco dell’evento per impedire sovraprenotazioni simultanee; usare chiavi idempotenti per i retry.
- Conservare snapshot dei veicoli nella prenotazione: le modifiche successive al garage non devono alterare il riepilogo registrato.
- Account, email e garage permanente saranno gestiti sul server, mai con credenziali private nel browser; i link di attivazione saranno verificabili e non permetteranno appropriazione di account esistenti.
- Accesso amministrativo verificato dal server tramite i ruoli già adottati nel progetto; nessuna modifica a ruoli associativi o dati della Tesoreria.

## Verifiche e consegna
- Test sintetici per modalità, campi obbligatori, schede indipendenti, riduzione con conferma, proprietà garage, idempotenza, limiti concorrenti, assenza di account duplicati e conteggi/export.
- Provare pagina e percorsi da smartphone e desktop; verificare ritorno dall’accesso e messaggi di errore con servizi simulati, dichiarando la simulazione.
- Consegnare codice, SQL da revisionare e guida per distribuzione nel progetto esterno, compresa configurazione email e URL di ritorno autorizzati.
- Non distribuire funzioni, pubblicare il sito, creare account reali o modificare dati esterni durante questa attività. Le prove complete con accesso e posta reali richiedono la tua installazione sul servizio esterno.

## Materiali da completare prima della pubblicazione
Fotografia Mossi utilizzabile, data e programma definitivi, prezzi, capienze e testi approvati per privacy e creazione account. L’implementazione può procedere senza questi materiali, ma non li presenterà come dati confermati.
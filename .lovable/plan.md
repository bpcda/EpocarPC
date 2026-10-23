# Consiglio Direttivo — analisi iniziale e Fase 1

## Analisi: cosa esiste già
- **Accesso e ruoli**: login del sito e cariche del CD già assegnate in Gestione utenti (presidente, vicepresidente, segretario, tesoriere, consigliere). Il modulo userà queste, senza nuove anagrafiche. Essere Fondatore da solo non dà accesso.
- **Database e archivio file**: progetto esterno; come per Tesoreria e domande di ammissione, le modifiche arrivano come script da eseguire a mano.
- **Modelli istituzionali**: i 7 documenti caricati (convocazione, presenze, verbale, scheda delibera, registro, checklist, guida) danno lo schema dei testi. Regole dello Statuto ricavate: art. 17.1–17.4 convocazione, 17.5–17.8 partecipazione a distanza con identificazione, quorum = maggioranza dei componenti in carica, maggioranza semplice dei presenti, voto prevalente del Presidente solo in parità, 17.9–17.12 consultazione scritta, 18.4 atti urgenti da ratificare. Nessun preavviso minimo nello statuto.
- **Aggiornamenti in tempo reale, servizio IA, invio email**: non ancora usati dal sito; servono nelle fasi successive.

## Da sviluppare (7 fasi, come richiesto)
1. Accessi, pannello, convocazioni e ordine del giorno — **questa consegna**
2. Seduta dal vivo, presenze confermate, quorum
3. Delibere, votazioni palesi, approvazione documenti
4. Registrazione audio con consenso e trascrizione IA
5. Bozza del verbale, revisione tracciata, approvazione
6. Fascicolo ZIP, archivio, cancellazione dei dati temporanei dopo verifica
7. Prove complete, sicurezza, controllo sullo Statuto

## Fase 1 — cosa vedrai
- Pagina privata **/consiglio-direttivo**, raggiungibile solo dai componenti del CD in carica (e dall'amministratore tecnico in sola lettura).
- Pannello: prossima riunione, programmate, in corso, concluse, convocazioni ricevute; card con numero progressivo, data, ora, luogo/modalità, stato, partecipanti, presenza di delibere.
- Pulsante **+ Convoca Consiglio Direttivo** (solo Presidente), procedura in 5 passaggi: informazioni, partecipanti (tutti i consiglieri in carica inclusi d'obbligo, invitati esterni senza voto), verbalizzante, ordine del giorno con tipi e trascinamento, anteprima della convocazione nello schema EPOCAR.
- Il consigliere conferma la partecipazione; Presidente modifica solo prima dell'inizio; annullamento e sospensione con motivazione.
- Convocazione scaricabile in Word, generata dai dati.

## Dettagli tecnici
- `setup/board-v15.sql`: tabelle `board_meetings` (numero da sequenza, stato con transizioni controllate da trigger), `board_meeting_participants` (snapshot dei componenti al momento della convocazione, flag `can_vote`, conferma), `board_agenda_items` (tipo, ordine), `board_meeting_events` (storico immutabile). Funzioni security-definer `is_board_member`, `is_board_president`; convocazione e cambi di stato solo tramite RPC che verificano il ruolo lato server. GRANT + RLS: lettura per componenti CD e partecipanti, nessun accesso anonimo.
- Frontend: `src/lib/board.ts` (accesso validato), `src/pages/Consiglio.tsx`, `src/components/board/*`; rotta privata con nuovo controllo `isBoardMember` in use-auth; nessun impatto su Tesoreria.
- Test: PostgreSQL isolato per permessi/RLS (non-consigliere escluso, fondatore senza carica escluso, solo il Presidente convoca, consigliere non escludibile, transizioni di stato), più test del wizard.
- Da fare sul progetto esterno: eseguire lo script SQL; email di convocazione rinviata (oggi l'invio email non funziona).

## Domande aperte (posso partire con le scelte indicate)
- Verbalizzante: lo propongo tra componenti CD e segretario; ok anche un esterno?
- Il vicepresidente può convocare in assenza del Presidente? Default: no in Fase 1.

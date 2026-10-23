# Consiglio Direttivo — Fase 2

## Attivazione sul progetto esterno
1. Revisionare ed eseguire `setup/board-v16.sql` **dopo** `board-v15.sql` già installato.
2. Distribuire il sito aggiornato. Non rieseguire v15 dopo v16: ripristinerebbe i vecchi percorsi.
3. Aprire Area Consiglio Direttivo → Entra nella seduta.
4. Il consigliere richiede identificazione; Presidente o verbalizzante verificano identità e partecipazione (da remoto anche comunicazione reciproca/accesso ai documenti) e registrano metodo e conferma. La richiesta e la connessione non assegnano presenza.
5. Il Presidente apre, seleziona i punti, sospende con motivazione, riprende e chiude con conferma. La chiusura blocca le presenze e passa al verbale in revisione; non genera né approva il verbale.

## Regole
- Quorum: maggioranza dei componenti **attualmente in carica** (5 → 3); ospiti esclusi. Ruoli multipli non duplicano una persona.
- Nessuna disconnessione cambia automaticamente la presenza: l'uscita richiede verifica esplicita e nota. Il collegamento recente indica solo un heartbeat ricevuto negli ultimi 60 secondi.
- Si può aprire una seduta per registrare l'assenza di quorum; questo non la rende validamente costituita e non permette di deliberare. Le votazioni e il relativo blocco server prima di ogni voto arrivano nella Fase 3.
- Registro immutabile degli eventi; ultimi 100 visibili, nessun evento precedente cancellato. Presenze e punti persistenti, non semplici messaggi in diretta.
- Realtime aggiunge alla pubblicazione esistente soltanto le quattro tabelle protette da RLS. Se non disponibile, aggiornamento ogni 15 secondi; nessun canale pubblico di presenze.
- Microfoni e registrazioni non attivati (Fase 4). La videoconferenza rimane esterna tramite il link della convocazione.

## Verifica dopo l'installazione
Con due dispositivi e account CD reali verificare: richiesta presenza, identificazione, apertura, punto condiviso, perdita quorum dopo uscita verificata, riconnessione senza cambiamento presenza, sospensione/ripresa, chiusura e accesso admin in sola lettura.

Il workspace non ha accesso al progetto esterno: installazione, consegna Realtime e prova autenticata reale restano da verificare lì.
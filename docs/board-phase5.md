# Consiglio Direttivo — Fase 5 (verbale: bozza IA, revisione, approvazione)

## Attivazione sul progetto esterno
1. Revisionare ed eseguire `setup/board-v19.sql` **dopo** `board-v15.sql` … `board-v18.sql`. Rieseguibile; crea il bucket privato `board-documents` e aggiunge il modello di redazione alle impostazioni IA.
2. Dopo la migrazione v22, distribuire la Edge Function `board-draft-minutes` dal sorgente `setup/functions/board-draft-minutes` sul progetto esterno (usa lo stesso segreto `BOARD_AI_API_KEY` della Fase 4). Verifica l'autorità della seduta e la carica attuale del verbalizzante; il progetto managed locale non è il target.
3. Distribuire il sito aggiornato.
4. Nelle «Impostazioni trascrizione IA» il Presidente può scegliere anche il modello di redazione del verbale.
5. Per il percorso aggiornato installare `setup/board-v20.sql`, `setup/board-v21.sql` e `setup/board-v22.sql`. Non rieseguire vecchi script isolatamente dopo gli aggiornamenti: se si ripete la sequenza, terminarla con v22.

Il 12/11/2026 SQL fino a v22 e `board-draft-minutes` versione 2 sono stati distribuiti via MCP sul progetto esterno. La funzione riconosce la presidenza sostitutiva della seduta e il verbalizzante attualmente in carica; JWT obbligatorio. Segreti e provider invariati, nessuna generazione IA reale avviata per il collaudo tecnico.

## Chi fa cosa
- **Presidente o verbalizzante**: scrivono il verbale a mano oppure generano la bozza con IA («Genera bozza del verbale»). Ogni salvataggio è una nuova versione identificata con impronta; salvare un testo identico non crea versioni.
- **Ogni componente**: propone rettifiche (interventi, decisioni riportate) senza modificare il testo ufficiale; Presidente/verbalizzante le valutano come accolte o non accolte.
- **Presidente**: sottopone il verbale al voto. Da quel momento il testo è bloccato; valgono le stesse regole delle delibere (quorum all'apertura e alla chiusura, maggioranza semplice, voto prevalente del Presidente solo in parità, una sola votazione alla volta).
- **Presidente o verbalizzante**: a verbale approvato, scaricano il documento Word per la firma e caricano la versione firmata.

## Regole
- Percorso aggiornato (v27–v28, scelta del 13/11/2026): chiusura → redazione/revisione anche a posteriori → firma → fascicolo. Il voto sul verbale resta disponibile durante la seduta, se desiderato. Il voto è disabilitato finché ci sono modifiche del testo non salvate. La precedente scelta di completare il verbale prima della chiusura è superata; l'art. 17.11 dello statuto richiede redazione e sottoscrizione, senza imporre quel momento di approvazione.
- Una votazione aperta impedisce la chiusura anche tramite RPC. Se il verbale non è approvato, la seduta può comunque terminare indicando una motivazione nel dialogo esistente: nessun modulo aggiuntivo, nessuna falsa approvazione. Il resoconto non approvato resta redigibile, ma nella seduta chiusa non si vota.
- L'IA non inventa deliberazioni e non tocca gli esiti di voto: riceve i dati certi della riunione (presenti, ordine del giorno, delibere e voti registrati) e le trascrizioni marcate come fonte incerta; gli interventi non attribuiti restano segnalati.
- Il verbale approvato è una versione definitiva bloccata: nessuna modifica silenziosa. Una rettifica prima della chiusura richiede una nuova approvazione. Dopo la chiusura, il v21 impedisce di modificare l'originale mediante una versione rettificata: il collegamento della rettifica a una nuova seduta è implementato in v23. Le bozze non approvate né firmate restano invece revisionabili a posteriori.
- Il voto digitale di approvazione non equivale alla firma: la sottoscrizione resta necessaria e la scansione firmata si registra a parte.
- Se l'IA è disattivata o senza trascrizioni, il verbale si redige manualmente: il modulo funziona comunque.

## Verifica dopo l'installazione
Con account CD reali verificare: generazione bozza IA (con provider configurato), modifica del testo, rettifica da parte di un consigliere, blocco del testo durante il voto, esito respinto → ritorno in revisione, esito approvato → testo bloccato, versione rettificata dopo l'approvazione, caricamento della scansione firmata, amministratore tecnico in sola lettura.

Per il passo 1: `src/test/board-session-flow.test.tsx` verifica chiusura con/senza approvazione, assenza di quorum, voto aperto ed errori di lettura; `board-minutes-flow.test.tsx` verifica il salvataggio prima del voto. `board-v21.test.ts` applica v15–v21 e riesegue v21 su PostgreSQL temporaneo, usando `fixtures/board-session-checks.sql`; viene saltato se mancano i binari PostgreSQL. Le fixture di seduta e archivio sono state eseguite anche su PostgreSQL WebAssembly isolato (PGlite), senza nuove dipendenze del progetto; questo controllo non attesta la concorrenza di connessioni reali né l'installazione esterna.

## Ancora fuori dalla Fase 5
- Appunti strutturati del verbalizzante durante la seduta (la bozza IA usa dati certi + trascrizioni; gli appunti si aggiungono a mano nel testo).
- Fascicolo ZIP della seduta e cancellazione dei dati temporanei: Fase 6.

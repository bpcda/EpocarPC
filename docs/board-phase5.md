# Consiglio Direttivo — Fase 5 (verbale: bozza IA, revisione, approvazione)

## Attivazione sul progetto esterno
1. Revisionare ed eseguire `setup/board-v19.sql` **dopo** `board-v15.sql` … `board-v18.sql`. Rieseguibile; crea il bucket privato `board-documents` e aggiunge il modello di redazione alle impostazioni IA.
2. Distribuire la Edge Function `board-draft-minutes` (usa lo stesso segreto `BOARD_AI_API_KEY` della Fase 4).
3. Distribuire il sito aggiornato.
4. Nelle «Impostazioni trascrizione IA» il Presidente può scegliere anche il modello di redazione del verbale.

## Chi fa cosa
- **Presidente o verbalizzante**: scrivono il verbale a mano oppure generano la bozza con IA («Genera bozza del verbale»). Ogni salvataggio è una nuova versione identificata con impronta; salvare un testo identico non crea versioni.
- **Ogni componente**: propone rettifiche (interventi, decisioni riportate) senza modificare il testo ufficiale; Presidente/verbalizzante le valutano come accolte o non accolte.
- **Presidente**: sottopone il verbale al voto. Da quel momento il testo è bloccato; valgono le stesse regole delle delibere (quorum all'apertura e alla chiusura, maggioranza semplice, voto prevalente del Presidente solo in parità, una sola votazione alla volta).
- **Presidente o verbalizzante**: a verbale approvato, scaricano il documento Word per la firma e caricano la versione firmata.

## Regole
- L'IA non inventa deliberazioni e non tocca gli esiti di voto: riceve i dati certi della riunione (presenti, ordine del giorno, delibere e voti registrati) e le trascrizioni marcate come fonte incerta; gli interventi non attribuiti restano segnalati.
- Il verbale approvato è una versione definitiva bloccata: nessuna modifica silenziosa. Una correzione successiva è una «versione rettificata» identificabile che riporta il verbale in revisione e richiede una nuova approvazione.
- Il voto digitale di approvazione non equivale alla firma: la sottoscrizione resta necessaria e la scansione firmata si registra a parte.
- Se l'IA è disattivata o senza trascrizioni, il verbale si redige manualmente: il modulo funziona comunque.

## Verifica dopo l'installazione
Con account CD reali verificare: generazione bozza IA (con provider configurato), modifica del testo, rettifica da parte di un consigliere, blocco del testo durante il voto, esito respinto → ritorno in revisione, esito approvato → testo bloccato, versione rettificata dopo l'approvazione, caricamento della scansione firmata, amministratore tecnico in sola lettura.

## Ancora fuori dalla Fase 5
- Appunti strutturati del verbalizzante durante la seduta (la bozza IA usa dati certi + trascrizioni; gli appunti si aggiungono a mano nel testo).
- Fascicolo ZIP della seduta e cancellazione dei dati temporanei: Fase 6.

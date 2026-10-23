# Consiglio Direttivo — Fase 4 (audio con consenso e trascrizione IA)

## Attivazione sul progetto esterno
1. Revisionare ed eseguire `setup/board-v18.sql` **dopo** `board-v15.sql`, `board-v16.sql` e `board-v17.sql`. Lo script è rieseguibile e crea anche il bucket privato `board-audio`.
2. Distribuire la Edge Function `board-transcribe` (`supabase/functions/board-transcribe`).
3. Impostare il segreto `BOARD_AI_API_KEY` con la chiave del provider di trascrizione (mai nel frontend, mai nel database).
4. Distribuire il sito aggiornato.
5. Il Presidente apre una seduta e attiva la trascrizione da «Impostazioni trascrizione IA» (provider, modello, limiti di spesa).

## Chi fa cosa
- **Ogni componente**: legge l'informativa e presta o nega il consenso; la scelta è registrata a verbale e modificabile in qualunque momento. Il mancato consenso non esclude dalla riunione.
- **Componente presente e identificato, con consenso**: può avviare la registrazione del proprio microfono (Modalità A), sospenderla e terminarla; la traccia è associata al suo nome con attribuzione verificata.
- **Presidente o verbalizzante**: caricano la traccia condivisa della riunione (Modalità B), avviano la trascrizione, eliminano le tracce non ancora trascritte.
- **Servizio di trascrizione** (Edge Function): unico soggetto che può scrivere stato e trascrizione delle tracce.

## Regole
- Nessuna registrazione senza consenso esplicito registrato a registro; nessuna registrazione nascosta; indicatore visibile durante la registrazione.
- Il microfono si attiva solo dopo l'autorizzazione del browser.
- La traccia condivisa non attribuisce i parlanti: ogni intervento resta «non attribuito con certezza» in attesa di diarizzazione o revisione del verbalizzante.
- Le trascrizioni sono validate lato server (segmenti con inizio, fine, testo e tipo di attribuzione) e restano nel registro della seduta.
- L'IA è disattivabile completamente; il costo stimato (minuti × costo al minuto configurato) non può superare il limite per riunione.
- La chiave del provider vive solo nel segreto `BOARD_AI_API_KEY` della Edge Function.

## Verifica dopo l'installazione
Con due dispositivi e account CD reali verificare: richiesta di consenso con informativa, blocco della registrazione senza consenso, revoca del consenso, indicatore di registrazione visibile, caricamento traccia condivisa solo da Presidente/verbalizzante, trascrizione con provider configurato, errore gestito e riproducibile, amministratore tecnico in sola lettura.

## Ancora fuori dalla Fase 4
- Diarizzazione dei parlanti sulla traccia condivisa (attribuzione automatica): non implementata, gli interventi restano marcati come incerti.
- Redazione del verbale a partire dalle trascrizioni (Fase B dell'integrazione IA): arriva con la Fase 5.
- Eliminazione programmata di audio e trascrizioni dopo l'esportazione del fascicolo: Fase 6.

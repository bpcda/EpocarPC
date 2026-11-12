# Consiglio Direttivo — Fase 3

## Attivazione sul progetto esterno
1. Per un'installazione completa, eseguire in ordine `setup/board-v15.sql` … `setup/board-v22.sql`. La v22 aggiorna questa fase e richiede v20/v21. Sulle installazioni v20 precedenti alla correzione dei privilegi eseguire anche `setup/board-v20-permissions.sql`. Non rieseguire una vecchia versione da sola: ripristinerebbe corpi o policy superati.
2. Distribuire il sito aggiornato.
3. Aprire Area Consiglio Direttivo → Entra nella seduta (seduta aperta, quorum raggiunto).

Aggiornamento del 12/11/2026: v20, correzione dei privilegi, v21 e v22 installate via MCP sul progetto esterno. Il frontend è pubblicato su `main` per Coolify; le Edge Function sono distribuite separatamente sullo stesso progetto esterno.

## Chi fa cosa
- **Testo ufficiale**: solo Presidente e verbalizzante scrivono o modificano la delibera.
- **Altri componenti**: possono proporre un punto e inviare suggerimenti di modifica; il testo ufficiale non cambia. Il verbalizzante o il Presidente segnano il suggerimento come accolto o non accolto.
- **Voto**: il Presidente mette ai voti. Da quel momento il testo è bloccato e identificato con versione e impronta; nessuno può più modificarlo.
- **Esito**: il Presidente chiude la votazione; le schede sono registrate nome per nome e verbalizzate.

## Regole
- Quorum: maggioranza dei componenti in carica, verificata all'apertura del voto e di nuovo alla chiusura. Se viene meno, l'esito è «Senza quorum» e la delibera non è approvata.
- Maggioranza semplice dei presenti (art. 17.7): criterio applicativo concordato, più sì della metà dei presenti. Astensioni e voti mancanti non sono sì. Con 5 presenti, 2 sì/1 no/2 astenuti è respinta.
- In parità non nulla fra sì e no, prevale il voto sì/no di chi presiede legittimamente (art. 17.8 e sostituzione artt. 19.3–19.5). Se si astiene o non vota, la proposta è respinta. Con 5 presenti, 2 sì/2 no/1 astenuto segue chi presiede. Nessun voto espresso non approva la proposta.
- Per il CD attuale di 7 componenti in carica il quorum è 4. L'urgenza riduce il preavviso senza cambiare quorum o maggioranze (art. 17.3); la seconda convocazione dell'Assemblea ordinaria non si applica al CD.
- La chiusura congela identità, aventi diritto, schede conteggiate/escluse, voti mancanti e regola applicata; gli esiti storici non vengono ricalcolati. I comandi voto/chiusura/annullamento acquisiscono il lock della seduta prima di leggere lo stato definitivo.
- «Registra la presidenza o una sostituzione» registra causale e incaricato per la sola seduta. Il Vicepresidente senza attivazione non acquisisce i comandi; la designazione di un altro componente in assenza di entrambi è attestata dal verbalizzante con quorum e riferimento alla decisione del Consiglio. Non cambia i ruoli permanenti.
- «Dichiara conflitto e uscita» registra il conflitto sulla delibera e l'allontanamento temporaneo (art. 24). L'interessato non discute né vota sul punto, senza ridurre i componenti in carica. Dopo il punto registra il rientro per partecipare agli altri. Se ha già votato, annullare prima il voto; le schede rimangono agli atti.
- Una sola votazione alla volta per riunione; una votazione aperta per errore può essere annullata con motivazione e la delibera torna in bozza.
- Dopo l'approvazione il testo non è più modificabile. Una modifica successiva richiede una nuova versione e, se serve, una nuovo voto.
- I documenti collegati seguono l'esito: approvati con la delibera, respinti se respinta.
- Storico immutabile: apertura del voto, ogni scheda, esito e motivazioni restano nel registro degli eventi.

## Verifica dopo l'installazione
Con due dispositivi e account CD reali verificare: scrittura del testo solo da Presidente o verbalizzante, suggerimento da parte di un consigliere, blocco del testo all'apertura del voto, voto nominale, chiusura con esito corretto, delibera approvata non più modificabile, esito «Senza quorum» con un'uscita verificata, amministratore tecnico in sola lettura.

## Ancora fuori dalla Fase 3
- Caricamento dei file: i documenti sono per ora collegati con nome e tipo, senza allegato. Il fascicolo ZIP con i file arriva con la Fase 6.
- Voto segreto: non previsto, il voto è palese come richiesto.

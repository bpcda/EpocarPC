# Le mie foto · attivazione su EPOCAR

Il progetto Supabase del sito è `cgbaunizlqqhctiiogok`. La configurazione Supabase gestita nel repository punta a un altro progetto.

1. Nel progetto EPOCAR, dopo `shooting-slots.sql`, eseguire `setup/shooting-photos.sql`. Crea il bucket privato `shooting-photos`, i permessi, le consegne e il consenso facoltativo alla Gallery. Le prenotazioni esistenti mantengono il valore privato.
2. Pubblicare la Edge Function **shooting-photo** con il file `setup/functions/shooting-photo/index.ts`. Impostare **Verify JWT** su **OFF** per questa funzione. Il GET pubblico serve esclusivamente le foto attualmente pubblicate. Il POST privato usa la sessione del destinatario e verifica assegnazione e scadenza nel database a ogni apertura. La funzione usa le variabili Supabase integrate.
3. Eseguire `setup/shooting-photos-cleanup.sql`. Attiva Cron e pg_net e programma la pulizia al minuto 17 di ogni ora. La chiave del job viene generata nel database. Il download privato scade esattamente 720 ore dopo la consegna. La pulizia rimuove fino a 100 file scaduti e non pubblicati per esecuzione e recupera anche i caricamenti incompleti più vecchi di un giorno. La foto pubblicata resta disponibile nella Gallery. Se viene ritirata dopo la scadenza privata, diventa eliminabile al passaggio successivo.

## Prova con una foto di test

- Da **Amministrazione → Shooting → Gallery**, scegliere serata, foto, slot e destinatari. Premere **Consegna al socio**. La data di consegna vale per tutti i destinatari dello scatto.
- Nel profilo del destinatario aprire **Le mie foto**, scegliere **Apri foto** e **Scarica foto**. Un altro account nello stesso slot vede solo gli scatti che gli sono stati assegnati.
- In **Scatti consegnati**, aprire l’anteprima. Se tutti i destinatari hanno acconsentito alla Gallery, verificare i ritratti, i minori e le targhe e premere **Pubblica in Gallery**. **Ritira dalla Gallery** disabilita il collegamento pubblico e conserva la consegna privata fino alla sua scadenza.
- Per verificare il job consultare **Cron → epocar-shooting-photo-cleanup** e le invocazioni di **shooting-photo**. La richiesta di pulizia completata restituisce HTTP 204.

# Dashboard: eventi e News

La dashboard del sito mantiene gli stessi permessi: admin gestisce Eventi e News, staff li consulta. Gallery, iscrizioni, associazione e gestione utenti continuano a usare i moduli e i controlli esistenti. La tesoreria non compare nel portale pubblico.

Su telefono la sezione si sceglie dal menu in alto; sul desktop dalla barra laterale. Eventi e News hanno ricerca per titolo, filtro per stato e conferma prima dell’eliminazione. Tornando da un editor si riapre la sezione corretta.

## Eventi

La descrizione usa lo stesso editor delle News: grassetto, corsivo, titoli, elenchi, citazioni, allineamento e link. Le descrizioni esistenti conservano paragrafi e ritorni a capo. La formattazione viene mostrata nel calendario e nella pagina di iscrizione; i metadati dell’evento rimangono testo semplice.

L’HTML è filtrato prima della visualizzazione con [DOMPurify](https://github.com/cure53/DOMPurify); script, attributi evento, URL eseguibili e CSS arbitrario non vengono resi. Non vengono cambiate impostazioni o autorizzazioni delle prenotazioni.

## News della dashboard

- **Salva come bozza**: privata, senza data automatica assegnata in anticipo.
- **Pubblica subito**: data del giorno di pubblicazione in Italia. Si può scegliere un giorno precedente nel campo data. Il comando “Usa il giorno di pubblicazione” ripristina il comportamento automatico.
- **Programma**: data e ora italiane future. La notizia diventa accessibile all’orario scelto; tornare a bozza annulla l’uscita. Scegliere “Pubblica subito” permette di anticiparla.

`created_at` resta la data tecnica di creazione. Il nuovo `published_at` determina la data della notizia, l’ordinamento e la soglia di visibilità. Le notizie precedenti conservano la data esistente; modificare il titolo non aggiorna automaticamente la data di pubblicazione. I vecchi link `/articoli/:id` restano validi.

La programmazione riguarda le News gestite nella dashboard Epocar. La redazione in Strapi resta separata e non viene modificata.

## Attivazione del database esterno

Installare **solo nell’istanza Epocar** [setup/articles-publication-v29.sql](../setup/articles-publication-v29.sql). Lo script è transazionale e ripetibile: aggiunge un campo e un trigger, senza riscrivere contenuti, `created_at` o `updated_at`. Una [policy RLS restrittiva](https://supabase.com/docs/guides/database/postgres/row-level-security) impedisce a visitatori e utenti ordinari di leggere bozze o News future anche tramite API e link diretti. Admin e staff conservano i permessi editoriali già previsti; le scritture restano admin-only.

Non serve un job periodico: la visibilità viene valutata dal database al momento della lettura. L’elenco pubblico aperto nel browser si aggiorna ogni minuto.

Prima dell’installazione il sito continua a leggere l’archivio esistente e l’editor disabilita programmazione e data personalizzata. Il file SQL non viene distribuito fra i file pubblici del sito. I tipi generati del progetto gestito non vengono modificati.

## Verifiche

I test coprono data automatica di una vecchia bozza, retrodatazione, calendario e fuso italiano, cambio dell’ora, programmazione, mantenimento della data durante la modifica, ricerca e filtri, permessi staff/tesoriere, conferme di eliminazione e salvataggi falliti senza cancellazione della copia locale.

`src/test/articles-publication-sql.test.ts` avvia PostgreSQL 16 in un contenitore Docker isolato, senza rete né porte pubblicate, con dati sintetici. Verifica anche l’installazione ripetuta dello script e la protezione da altre policy di lettura permissive. Non usa credenziali o dati reali.

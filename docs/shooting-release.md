# Natale su Ruote · Pubblicazione e prova di apertura

Il progetto esterno EPOCAR ha riferimento `cgbaunizlqqhctiiogok`. Il riferimento del progetto gestito in supabase/config.toml è diverso. Per ogni operazione remota controllare l'identità del progetto nella sessione MCP.

1. Con MCP Supabase autorizzato verificare i prerequisiti in sola lettura: auth.users, public.vehicles, public.vehicle_type, public.profiles, public.user_roles e public.has_role(uuid,app_role). Controllare eventuali installazioni v32/v33 e dati esistenti. Se una serata v32 è già aperta, concordare prima il luogo di ritrovo e la transizione: v33 verifica che le serate aperte abbiano un luogo.
2. Applicare tramite MCP le migrazioni `setup/shooting-requests-v32.sql`, `setup/shooting-agenda-v33.sql` e `setup/shooting-slots.sql`, in ordine. Verificare grant, RLS, due serate e, alla prima installazione, cinque slot per serata. Per aggiornare una installazione v33 eseguire solo shooting-slots.sql. La prima installazione imposta le serate chiuse.
3. Pubblicare con MCP l'Edge Function `shooting-receipt` con entrypoint index.ts e il modulo templates.ts della stessa directory. È richiesta una sessione Supabase valida. Testare che una chiamata senza sessione sia respinta.
4. In Brevo verificare il mittente per la posta transazionale. In Supabase → Edge Functions → Secrets configurare `BREVO_API_KEY` e `SHOOTING_EMAIL_FROM`. I cinque template sono inclusi nella funzione e producono HTML e testo semplice. Verificare quota disponibile prima degli invii collettivi.
5. Distribuire il frontend su Vercel con i binding pubblici Supabase del progetto EPOCAR. In una prova controllata verificare login e ritorno al modulo, una ricevuta nella casella di test, una conferma, uno spostamento e un annullamento. Il flusso maltempo chiude la serata e marca tutte le richieste coinvolte: provarlo su una serata di staging.
6. In Amministrazione → Shooting impostare luogo, testi approvati e versione, poi aprire la raccolta. Verificare le autorizzazioni individuali dei soggetti riconoscibili al momento delle foto. Nessuna foto viene pubblicata dal modulo.

## Operatività email

Ogni modifica crea il lavoro email nella transazione della richiesta. Il frontend avvia l'invio dopo il salvataggio. Un'interruzione del browser o l'assenza della chiave lascia l'invio recuperabile dall'admin tramite “Elabora email in coda per questa serata”. Il pulsante tenta gli stati pendente/fallito. Gli stati incerti o rimasti in invio dopo un'interruzione richiedono riconciliazione con i log transazionali Brevo prima di autorizzare un nuovo tentativo. L'accettazione API del provider e la consegna nella casella sono esiti distinti.

## Collaudo mobile prima dell’apertura

Dal checkout eseguire `rtk proxy npx playwright test --config tests/shooting.config.ts`. Per il Chromium di sistema impostare `CHROMIUM_PATH=/usr/bin/chromium`. Si provano accesso, registrazione con sessione immediata, ritorno al form, targa mancante nel garage, scelta immagini negativa e conferma su una serata diversa. Il test usa un sito locale e risposte Supabase simulate. Per il via libera operativo resta da verificare la ricezione in una casella di prova tramite Brevo.

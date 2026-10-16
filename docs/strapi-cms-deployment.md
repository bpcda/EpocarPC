# CMS editoriale Epocar (Strapi) — deploy su Coolify

Strapi gestisce **solo contenuti editoriali pubblici**. Auth, Area Socio, domande di ammissione, eventi e iscrizioni, gallery esistente, articoli Rubricar, Tesoreria restano su Supabase / Tesoreria privata e non vanno mai copiati in Strapi.

## 1. Inventario contenuti

| Area | Stato attuale | Destinazione |
|---|---|---|
| Hero homepage (titolo, sottotitolo, immagine) | hardcoded | **CMS → Homepage** (fallback al testo attuale) |
| Missione homepage | hardcoded | **CMS → Homepage** |
| CTA finale homepage | hardcoded | **CMS → Homepage** (2 link) |
| Footer: testo, indirizzo, email, telefono, social, logo | hardcoded | **CMS → Impostazioni del sito** |
| News | non esistevano | **CMS → News** (`/news`, `/news/:slug`) |
| Pagine editoriali libere | non esistevano | **CMS → Pagina** (`/pagine/:slug`) |
| Sponsor / Partner | non esistevano | **CMS** (sezione in home solo se presenti) |
| FAQ | non esisteva | **CMS → FAQ** (`/faq`) |
| Numeri community, sezione Community, Instagram, Chi siamo, Contatti, articolo "Quando un'auto diventa d'epoca" | hardcoded | restano hardcoded in questa fase (migrazione successiva, vedi §9) |
| Eventi, countdown, iscrizioni evento | Supabase | **restano Supabase** (dati operativi, nessuna duplicazione) |
| Articoli Rubricar, Gallery | Supabase + dashboard admin | **restano Supabase** (già modificabili senza codice) |
| Fondatori, Consiglio, Statuto | Supabase (ruoli) | **restano Supabase** |
| Soci, domande, quote, Tesoreria | Supabase / privato | **mai nel CMS** |

Se il CMS è vuoto, spento o non configurato, il sito mostra i testi attuali; le nuove pagine mostrano "nessun contenuto" o pagina non trovata.

## 2. Content types (in `deploy/strapi/app/src`)

- **Impostazioni del sito** (single): nome, logo, favicon, email, telefono, indirizzo, testo footer, social (link ripetibili).
- **Homepage** (single): titolo e sottotitolo principale, immagine, etichetta e testo missione, titolo/testo invito, pulsante 1 e 2, interruttori "mostra news/sponsor/partner".
- **Pagina**: titolo, slug, estratto, immagine, blocchi, SEO.
- **News**: titolo, slug, estratto, copertina, galleria, autore, data, "in evidenza", blocchi, SEO.
- **Sponsor**, **Partner**: nome, logo, sito, descrizione, ordine, attivo.
- **Galleria**: titolo, slug, descrizione, immagini, data (predisposta; la Gallery del sito resta Supabase).
- **FAQ**: domanda, risposta, ordine, attivo.
- **Blocchi** (solo questi): Testo, Titolo e testo, Immagine, Galleria, Citazione, Invito all'azione, Due colonne, Video (YouTube/Vimeo), Separatore.
- **SEO** (componente): titolo SEO (≤70), descrizione (≤160), immagine OpenGraph.

Tutti con Bozza e Pubblicazione. Il sito chiede sempre `status=published`: le bozze non compaiono mai.

**Label italiane:** dopo il primo avvio, in *Content Manager → (tipo) → Configura la vista* rinominare i campi (es. `heroSubtitle` → "Sottotitolo principale") e aggiungere descrizioni brevi. Queste impostazioni sono salvate nel database Strapi.

## 3. Variabili su Vercel

| Variabile | Valore |
|---|---|
| `VITE_STRAPI_URL` | `https://cms.tuodominio.it` (senza `/` finale) |

Nessun token: le API sono pubbliche in sola lettura. Dopo averla impostata serve un nuovo deploy Vercel (è letta in build). In Lovable va impostata la stessa variabile per l'anteprima.

## 4. Stack Coolify

- `deploy/strapi/docker-compose.yml`: **Strapi 5.12.6** (Node 20.18, build da `deploy/strapi/app/Dockerfile`) + **PostgreSQL 16.4**.
- Volumi persistenti: `strapi-db-data` (database), `strapi-uploads` (Media Library).
- Postgres senza porte esposte.
- Domini: `cms.tuodominio.it` → servizio `strapi`, porta 1337, HTTPS automatico di Coolify. Il sito resta su Vercel.

Prima del deploy controllare su npm che 5.12.6 sia ancora l'ultima patch della 5.x stabile scelta; in caso aggiornare insieme `@strapi/strapi` e `@strapi/plugin-users-permissions` alla stessa versione.

## 5. Passaggi da eseguire

1. In Coolify: *New Resource → Docker Compose*, repository del sito, base directory `deploy/strapi`, file `docker-compose.yml`.
2. Variabili (vedi `.env.example`); generare ogni segreto con `openssl rand -base64 32`; `APP_KEYS` = quattro valori separati da virgola. `CORS_ORIGINS` = domini del sito pubblico.
3. Dominio `https://cms.tuodominio.it` sul servizio `strapi` porta 1337.
4. Deploy. Al primo avvio (prima build ~5 min) aprire subito `https://cms.tuodominio.it/admin` e **creare il primo amministratore**: chi arriva per primo diventa admin, quindi farlo immediatamente dopo il deploy.
5. *Impostazioni → Utenti amministratori → Invita*: un account personale per ogni fondatore, ruolo **Editor**. Niente account condivisi.
6. Ruolo **Editor** (*Impostazioni → Ruoli*): lasciare Content Manager e Media Library; togliere Content-Type Builder, Impostazioni, Utenti, Webhook, Token API.
7. Verificare *Impostazioni → Users & Permissions → Ruoli → Public*: solo `find`/`findOne` sui tipi editoriali (lo impone `src/index.js` a ogni avvio). Disattivare "Enable sign-ups" in *Advanced settings*.
8. Creare e **pubblicare** "Impostazioni del sito" e "Homepage".
9. Su Vercel impostare `VITE_STRAPI_URL` e ridistribuire.

## 6. Sicurezza

- HTTPS via Coolify; nessuna scrittura pubblica; nessun token nel browser; CORS ristretto ai domini del sito e solo GET.
- Content-Type Builder è attivo solo in sviluppo: in produzione i modelli si cambiano dal repository.
- La 2FA per l'admin Strapi non è inclusa nella Community Edition (SSO è a pagamento): usare password robuste personali e, se possibile, limitare `/admin` con Tailscale o allowlist IP nel proxy di Coolify.
- Il sito sanifica i link (solo http/https/mailto/tel o percorsi interni) e accetta video solo da YouTube/Vimeo; il testo ricco non viene mai iniettato come HTML.

## 7. Backup

Includere: dump PostgreSQL (`pg_dump` del volume `strapi-db-data`, backup programmato Coolify), volume `strapi-uploads`, le variabili d'ambiente (in un gestore password, non nel repo). `APP_KEYS`/`ENCRYPTION_KEY` persi = sessioni e token invalidi. Provare un ripristino almeno una volta.

## 8. Disponibilità

Il sito usa timeout di 6 s, cache locale dell'ultima risposta valida e testi di riserva: se Strapi è giù il sito resta navigabile senza errori tecnici.

## 9. Fasi successive

- Importare i testi attuali nel CMS, verificarli, poi rimuovere i fallback hardcoded.
- Spostare in CMS numeri community, Chi siamo e Contatti.
- Anteprima delle bozze: richiede una funzione server con token read-only (non nel browser); rimandata.
- Contenuti generati lato client: i motori di ricerca che non eseguono JavaScript vedono solo i meta di base (limite già esistente della SPA).

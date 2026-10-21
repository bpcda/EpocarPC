# Treasury ⇄ Sito pubblico — contratto `treasury-sync`

Connessioni sempre **in uscita dalla Tesoreria**: Tesoreria → HTTPS → endpoint qui sotto. Il sito non contatta mai la Tesoreria.

## Endpoint

```
BASE_URL = https://<project-ref>.supabase.co/functions/v1/treasury-sync
```

`<project-ref>` è il riferimento del progetto backend su cui è installato `setup/membership-sync-v6.sql`.

## Autenticazione (server-to-server)

| Header | Obbligatorio | Valore |
|---|---|---|
| `Authorization` | sì | `Bearer <TREASURY_SYNC_SECRET>` |
| `X-Treasury-Timestamp` | sì | ISO 8601 UTC, es. `2026-10-12T19:00:00Z`, entro ±300 s dall'ora del server |
| `X-Request-Id` | no | id di tracciamento (≤100 caratteri); se manca lo genera il server e lo restituisce |
| `Idempotency-Key` | sì per le richieste POST | 8–200 caratteri, unico per ogni operazione logica (consigliato UUID v4) |
| `Content-Type` | sì per le richieste POST | `application/json` |

```
TREASURY_SYNC_SECRET=<configured-secret>   # almeno 32 caratteri casuali, salvato nei secret del backend e nella Tesoreria
```

Non c'è CORS: l'endpoint rifiuta l'uso dal browser. Limite: 120 richieste autorizzate al minuto, oltre il quale risponde `429`.

## Stati della domanda (`status`)

`draft` · `submitted` · `review` (= in valutazione) · `approved` · `rejected` · `cancelled`

Transizioni permesse alla Tesoreria: `submitted → review`, `submitted|review → approved|rejected`, `draft|submitted|review → cancelled`.

## Identificatori

- `application_id`: UUID della domanda (stabile, generato dal sito).
- `user_id`: UUID dell'account sul sito (solo informativo, **non** è una chiave di sincronizzazione).
- `treasury_member_id`: UUID del socio, generato dalla Tesoreria. Uno per domanda; mai riutilizzabile per un'altra domanda.
- L'email **non** è una chiave di sincronizzazione.

Date: `timestamptz` in ISO 8601 UTC; date semplici `YYYY-MM-DD`.

## A) Domande da lavorare

`GET {BASE_URL}?action=pending[&status=submitted,review][&limit=50][&cursor=...]`

- `status`: `submitted` (predefinito), `review`, oppure entrambi separati da virgola.
- `limit`: 1–100 (predefinito 50). Ordine: `submitted_at`, poi `application_id`.
- `cursor`: il `next_cursor` della pagina precedente (`null` = ultima pagina).

```json
{
  "ok": true,
  "request_id": "…",
  "applications": [{
    "application_id": "uuid", "user_id": "uuid", "status": "submitted",
    "full_name": "Mario Rossi", "email": "mario@example.it", "requested_category": "Ordinario" ,
    "submitted_at": "2026-10-12T18:00:00Z", "updated_at": "2026-10-12T18:00:00Z",
    "form": { "filename": "modulo.pdf", "file_url": "https://…", "file_url_expires_in": 600 }
  }],
  "next_cursor": null
}
```

`requested_category` e `form` possono essere `null`. `file_url` è un link firmato valido 600 secondi.

## B–E) Operazioni (POST, idempotenti)

`POST {BASE_URL}?action=<azione>`

| Azione | Corpo JSON | Obbligatori |
|---|---|---|
| `review` | `{ "application_id" }` | application_id |
| `approve` | `{ "application_id", "treasury_member_id", "approved_at"?, "public_status_message"?, "member": { … } }` | application_id, treasury_member_id, member.category |
| `reject` | `{ "application_id", "rejected_at"?, "public_status_message"? }` | application_id |
| `cancel` | `{ "application_id", "public_status_message"? }` | application_id |
| `member_update` | `{ "treasury_member_id", "member": { … } }` | treasury_member_id, member.updated_at |

Oggetto `member` (proiezione mostrata solo al socio stesso):

| Campo | Tipo | Note |
|---|---|---|
| `category` | `Fondatore` \| `Ordinario` \| `Sostenitore` \| `Onorario` | obbligatorio in `approve` |
| `membership_status` | `active` \| `suspended` \| `ceased` | predefinito `active` |
| `card_number` | intero > 0 o `null` | ometterlo o mandare `null` finché la tessera non è assegnata; mai valori temporanei |
| `admission_date` | `YYYY-MM-DD` o `null` | |
| `membership_year` | intero | anno a cui si riferisce `fee_status` |
| `fee_status` | `paid` \| `partial` \| `due` \| `exempt` \| `null` | |
| `updated_at` | ISO 8601 | ora dell'ultima modifica nella Tesoreria; gli aggiornamenti più vecchi di quello salvato vengono ignorati (`"member_projection": "stale"`) |

I campi omessi in `member_update` restano invariati. `public_status_message` (≤500 caratteri) viene mostrato al richiedente: mai motivazioni interne.

Non mandare mai al sito: movimenti, saldi, conti, note interne, delibere riservate, audit, documenti contabili, dati di altri soci.

Risposta `200`:

```json
{ "ok": true, "result": "applied", "application_id": "uuid", "status": "approved",
  "treasury_member_id": "uuid", "updated_at": "…", "replayed": false,
  "member_projection": "applied", "request_id": "…" }
```

`result`: `applied` (stato cambiato) o `noop` (già in quello stato, es. doppia approvazione con lo stesso `treasury_member_id`). `replayed: true` = stessa `Idempotency-Key` già elaborata; viene restituita la risposta originale.

## Idempotenza

- Stessa `Idempotency-Key` + stesso corpo → risposta originale, nessun effetto.
- Stessa `Idempotency-Key` + corpo diverso → `409 idempotency_conflict`.
- Anche con chiavi nuove, ripetere `approve` con lo stesso `treasury_member_id` restituisce `noop`; con un id diverso → `409 conflict`.
- Una domanda non produce mai due soci (indice univoco su `treasury_member_id`; un account è collegato a un solo socio).
- Dopo un timeout ripeti l'operazione con la **stessa** chiave.

## Errori

```json
{ "ok": false, "error": "<codice>", "message": "…", "request_id": "…" }
```

| HTTP | `error` | Quando |
|---|---|---|
| 400 | `unknown_action`, `missing_idempotency_key`, `invalid_json` | richiesta malformata |
| 401 | `unauthorized`, `stale_timestamp` | secret errato/mancante, orario fuori finestra |
| 404 | `not_found` | domanda o socio inesistente |
| 405 | `method_not_allowed` | GET/POST sbagliato |
| 409 | `conflict`, `invalid_state`, `idempotency_conflict` | transizione non permessa o dato incoerente |
| 422 | `invalid_request` | UUID, cursore o campi non validi |
| 429 | `rate_limited` | ritenta dopo 60 s |
| 500 | `internal_error` | ritenta con backoff e la stessa chiave |
| 503 | `not_configured` | secret non configurato sul server |

## Polling consigliato

Ogni 5–15 minuti: `pending` → `review` → decisione del CD → `approve`/`reject`; poi `member_update` quando cambiano tessera, quota o stato. Se la Tesoreria è offline, il sito continua a funzionare e le domande restano `submitted`.

## BOOTSTRAP EXISTING MEMBERS

Candidati alla riconciliazione già configurati sul sito (Dashboard → Utenti, ruolo categoria Fondatore/Ordinario/Sostenitore). **Un ruolo non prova l'ammissione**: la Tesoreria deve verificare una delibera reale prima di creare un socio effettivo o assegnare una tessera. Richiede `setup/treasury-bootstrap-v11.sql`; sulle installazioni precedenti applicare anche `setup/treasury-bootstrap-v13.sql` (correzione ack oltre la prima pagina, nessun cambio di contratto).

**Fonte dei candidati:** `public.user_roles` (una riga per ruolo) + `public.profiles` (nome) + account (email). Categoria = ruolo `founder|ordinary|supporter`; cariche del Consiglio = ruoli `president|vice_president|secretary|treasurer|councillor` (cariche associative, distinte dai ruoli tecnici `admin|staff|user`, che non vengono mai inviati). Si richiedono un account esistente e almeno un ruolo categoria. Profilo assente non esclude. Domanda assente, `draft` o `cancelled`: inclusione; `submitted`, `review`, `approved` o `rejected`: esclusione. Un ruolo `founder` assegnato dopo un rifiuto **non** aggira la decisione e non riapre la domanda. Il ruolo `Onorario` non ha un valore enum corrispondente in questo elenco; è disponibile solo nella proiezione da Tesoreria.

**Identificatore stabile:** `external_member_id` = UUID dell'account sul sito. Mai l'email.

### Elenco — `GET {BASE_URL}?action=bootstrap_members[&limit=50][&cursor=<external_member_id>]`

Stessa autenticazione (Bearer + `X-Treasury-Timestamp`). Sola lettura, ripetibile senza effetti.

Limite intero 1–100, predefinito 50. Ordine UUID ascendente; inviare ogni `next_cursor` fino a `null` (una pagina piena può richiedere un'ultima pagina vuota). Ogni nuovo aggiornamento completo deve partire **senza cursore**: è una scansione, non un flusso incrementale per data; un nuovo UUID può precedere il cursore della scansione precedente. `pending` non è un elenco di soci: restituisce solo domande `submitted` (default) / `review`, ordinate per `(submitted_at, application_id)` con cursore base64 distinto.

```json
{ "ok": true, "request_id": "…", "next_cursor": null, "members": [{
  "external_member_id": "uuid", "user_id": "uuid", "first_name": "Mario", "last_name": "Rossi", "full_name": "Mario Rossi",
  "email": "mario@example.it", "category": "Fondatore", "board_roles": ["vice_president","treasurer"],
  "category_source": "site_role", "admission": { "status": "unknown", "source": null },
  "admission_date": null, "card_number": null, "treasury_member_id": null, "acknowledged_at": null,
  "account_created_at": "2026-03-01T10:00:00Z" }] }
```

`admission_date` e `card_number` sono valorizzati solo se già assegnati dalla Tesoreria; altrimenti `null` (mai inventati). `account_created_at` è la data dell'account, **non** la data di ammissione. Nessuna quota, delibera o stato pagamento: non esistono sul sito.

**Estensione compatibile (2026-10-16):** ogni record aggiunge `category_source: "site_role"` e `admission: { "status": "unknown", "source": null }`. Questi valori sono sempre espliciti, anche per record già collegati o con data/tessera nella proiezione: questo elenco non verifica le decisioni della Tesoreria. Campi assenti da una versione precedente vanno interpretati come ammissione `unknown`, mai `confirmed`. Endpoint, campi precedenti, identificatori, filtri, paginazione e autenticazione restano identici; nessuna nuova domanda o modifica dello storico.

La Tesoreria importa **identità da riconciliare**, mantenendo separati identità, categoria del sito e ammissione. Un nuovo `founder` senza domanda compare qui, non in `pending`. L'importatore deve verificare una decisione reale nella propria anagrafica/storia prima di riconoscere un socio legacy; import/ack non assegnano tessera, quota o stato `active`. Se l'anagrafica locale non supporta identità non ammesse, rinviare l'ack fino alla verifica. Non sovrascrivere decisioni locali confermate con `unknown`: il campo indica l'assenza di attestazione da questo endpoint, non una revoca.

**Distribuzione esterna:** ridistribuire `supabase/functions/treasury-sync/index.ts` sul progetto esterno e il frontend pubblico; aggiornare l'importatore privato per interpretare i due campi. Questa estensione è aggiunta nella risposta HTTPS, quindi **non richiede nuove migrazioni SQL** né modifiche alle firme delle RPC. Restano necessari v11 e, per installazioni precedenti, v13 come sopra. Nessuna distribuzione sull'istanza esterna viene eseguita da questo workspace.

**Area Socio:** il solo ruolo categoria e una proiezione `active` (anche con tessera/data) non attestano l'ammissione. Il frontend riconosce una decisione disponibile quando la propria domanda ha `status = approved` e un `approved_at` valido registrato dal server; in mancanza mostra “Ammissione da verificare”. Le decisioni della domanda e gli stati `suspended`/`ceased` rimangono visibili, come i dati proiettati e le sezioni già accessibili. Per un legacy la cui prova esiste soltanto nella Tesoreria privata, resta “da verificare” finché non sarà disponibile una attestazione verificabile: questo aggiornamento non inventa tale prova né modifica decisioni o permessi.

### Acknowledgement — `POST {BASE_URL}?action=bootstrap_ack`

Header `Idempotency-Key` obbligatorio. Corpo: `{ "external_member_id": "uuid", "treasury_member_id": "uuid" }`.

Registra il collegamento senza cambiare l'id originario e senza toccare ruoli, profili o domande. Risposta: `{ "ok": true, "result": "applied"|"noop", "external_member_id", "treasury_member_id", "replayed" }`. Stessa coppia → `noop`; altro `treasury_member_id` per lo stesso socio, o `treasury_member_id` già usato → `409 conflict`; socio inesistente → `404 not_found`.

Dopo l'ack, `member_update` con quel `treasury_member_id` aggiorna l'Area Socio. Finché la tessera non è assegnata, la categoria già presente sul sito resta.

## MEMBER_UPDATE V2 (eventi revisionati) — richiede `setup/membership-sync-v14.sql`

Versione esplicita del contratto di aggiornamento socio. `POST {BASE_URL}?action=member_update` con header come sopra. Il formato v1 (`member: { … }` senza `event_id`) resta accettato per compatibilità, ma è deprecato: la Tesoreria dovrebbe passare a v2.

### Busta dell'evento (obbligatoria)

| Campo | Tipo | Note |
|---|---|---|
| `event_id` | stringa 8–100 caratteri | univoco, **stabile nei retry**: dopo un timeout si ripete lo stesso `event_id` (e la stessa `Idempotency-Key`) |
| `revision` | intero ≥ 1 | monotono per socio: ogni nuovo evento per lo stesso `treasury_member_id` ha revisione maggiore |
| `updated_at` | ISO 8601 UTC | orario della modifica in Tesoreria |
| `treasury_member_id` | UUID | identificativo stabile del socio |
| `external_member_id` | UUID | account del sito; obbligatorio se manca `application_id` |
| `application_id` | UUID | domanda online, se esiste |

Almeno uno tra `external_member_id` e `application_id`. Se entrambi presenti devono essere coerenti (stessa persona, stesso socio): altrimenti `409 conflict` e nessuna scrittura. L'email non è mai una chiave.

### Dati (aggiornamento parziale)

- Campo **omesso** = nessuna modifica. **`null` esplicito è rifiutato** (`422`): per rimuovere un valore si usa `clear_fields`.
- `category`, `membership_status` (`active|suspended|ceased`), `card_number` (intero > 0), `admission_date` (`YYYY-MM-DD`): come v1, ma al livello superiore del corpo (non dentro `member`).
- `admission`: `{ "status": "confirmed|unverified|not_admitted", "source": "board_resolution|historical_register", "reference": "…", "decision_date": "YYYY-MM-DD" }`. `confirmed` **richiede** `source`; ruolo pubblico, tessera o collegamento bootstrap non costituiscono prova e non vengono mai promossi ad ammissione.
- `annual_fee`: `{ "membership_year": 2026, "fee_status": "paid|partial|due|exempt", "fee_amount": "100.00", "fee_paid_amount": "40.00", "fee_balance": "60.00", "last_payment": { "date": "2026-03-01", "amount": "40.00", "receipt_number": "R-1" } }`. Importi = **stringhe decimali con due cifre, EUR**; mai float. Ogni anno è conservato separatamente: un aggiornamento 2027 non sovrascrive il 2026. `fee_status` non è mai dedotto da `last_payment`.
- `payment_coordinates`: `{ "iban": "IT60X054…", "account_holder": "EPOCAR APS" }` (facoltativo; spazi nell'IBAN ignorati).
- `cessation`: `{ "date": "YYYY-MM-DD", "reason": "resignation|expulsion|death|other" }` (facoltativo).
- `public_message`: testo destinato al socio (≤500 caratteri), mai note interne.

### `clear_fields`

Array di percorsi da azzerare esplicitamente. Percorsi ammessi: `card_number`, `admission_date`, `admission`, `payment_coordinates`, `cessation`, `public_message`, `annual_fee.last_payment` (richiede `annual_fee.membership_year` presente e `last_payment` omesso). Un campo presente **e** elencato in `clear_fields` è ambiguo → `422 invalid_request`. Esempio pagamento annullato: `{ …, "annual_fee": { "membership_year": 2026 }, "clear_fields": ["annual_fee.last_payment"] }`.

### Semantica delle risposte

```json
{ "ok": true, "result": "applied", "member_projection": "applied", "revision": 7, "event_id": "…", "treasury_member_id": "…", "replayed": false, "request_id": "…" }
```

| Situazione | HTTP | `result` / `member_projection` | Effetti |
|---|---|---|---|
| Evento nuovo, revisione maggiore | 200 | `applied` | dati aggiornati atomicamente |
| Stesso `event_id`, stesso contenuto | 200 | `duplicate` | nessun effetto aggiuntivo |
| Revisione inferiore all'ultima applicata | 200 | `stale` | nessuna sovrascrittura |
| Stesso `event_id` o stessa revisione, contenuto diverso | 409 | `conflict` | rifiutato, nessuna scrittura |
| Identificatori incoerenti | 409 | `conflict` | rifiutato |
| Socio non risolvibile | 404 | `not_found` | rifiutato |
| Busta o campi non validi (null esplicito, importo non canonico, clear non ammesso…) | 422 | `invalid_request` | rifiutato |

`replayed: true` resta il replay della stessa `Idempotency-Key` (livello richiesta), distinto da `duplicate` (livello evento). Funziona anche per soci storici senza domanda online: `external_member_id` + collegamento bootstrap.

### Esempio completo

```json
{ "event_id": "7f3c…-2026-10-20", "revision": 7, "updated_at": "2026-10-20T10:00:00Z",
  "treasury_member_id": "uuid", "external_member_id": "uuid",
  "category": "Fondatore", "membership_status": "active", "card_number": 7, "admission_date": "2019-05-12",
  "admission": { "status": "confirmed", "source": "board_resolution", "reference": "CD 2019-04", "decision_date": "2019-04-20" },
  "annual_fee": { "membership_year": 2026, "fee_status": "partial", "fee_amount": "100.00", "fee_paid_amount": "40.00", "fee_balance": "60.00",
    "last_payment": { "date": "2026-03-01", "amount": "40.00", "receipt_number": "R-1" } },
  "payment_coordinates": { "iban": "IT60X0542811101000000123456", "account_holder": "EPOCAR APS" },
  "public_message": "Benvenuto!" }
```

### Visibilità (Area Socio)

Il socio vede solo la propria proiezione e le proprie quote annuali (RLS per `user_id`); il registro eventi è service-only. Payload, messaggi e motivi di cessazione non compaiono in elenchi pubblici. La prova di ammissione (`admission`) resta distinta dallo stato `active|suspended|ceased`. Cariche del Consiglio e privilegi tecnici del sito non cambiano mai per effetto di un `member_update`.

### Ordine di distribuzione

1. Applicare `setup/membership-sync-v14.sql` sul progetto esterno (dopo v6, v11, v13).
2. Ridistribuire `supabase/functions/treasury-sync/index.ts`.
3. Distribuire il frontend pubblico.
4. La Tesoreria passa agli eventi v2 (v1 resta accettato durante la transizione).

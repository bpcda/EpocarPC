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

Soci già configurati sul sito (Dashboard → Utenti, ruolo categoria Fondatore/Ordinario/Sostenitore) **prima** del workflow domande. Non hanno una `membership_applications` e non devono compilarla. Richiede `setup/treasury-bootstrap-v11.sql`.

**Fonte reale:** `public.user_roles` (una riga per ruolo) + `public.profiles` (nome) + account (email). Categoria = ruolo `founder|ordinary|supporter`; cariche del Consiglio = ruoli `president|vice_president|secretary|treasurer|councillor` (cariche associative, distinte dai ruoli tecnici `admin|staff|user`, che non vengono mai inviati). Esclusi gli utenti che hanno già una domanda inviata (passano dal flusso normale).

**Identificatore stabile:** `external_member_id` = UUID dell'account sul sito. Mai l'email.

### Elenco — `GET {BASE_URL}?action=bootstrap_members[&limit=50][&cursor=<external_member_id>]`

Stessa autenticazione (Bearer + `X-Treasury-Timestamp`). Sola lettura, ripetibile senza effetti.

```json
{ "ok": true, "request_id": "…", "next_cursor": null, "members": [{
  "external_member_id": "uuid", "user_id": "uuid", "first_name": "Mario", "last_name": "Rossi", "full_name": "Mario Rossi",
  "email": "mario@example.it", "category": "Fondatore", "board_roles": ["vice_president","treasurer"],
  "admission_date": null, "card_number": null, "treasury_member_id": null, "acknowledged_at": null,
  "account_created_at": "2026-03-01T10:00:00Z" }] }
```

`admission_date` e `card_number` sono valorizzati solo se già assegnati dalla Tesoreria; altrimenti `null` (mai inventati). `account_created_at` è la data dell'account, **non** la data di ammissione. Nessuna quota, delibera o stato pagamento: non esistono sul sito.

### Acknowledgement — `POST {BASE_URL}?action=bootstrap_ack`

Header `Idempotency-Key` obbligatorio. Corpo: `{ "external_member_id": "uuid", "treasury_member_id": "uuid" }`.

Registra il collegamento senza cambiare l'id originario e senza toccare ruoli, profili o domande. Risposta: `{ "ok": true, "result": "applied"|"noop", "external_member_id", "treasury_member_id", "replayed" }`. Stessa coppia → `noop`; altro `treasury_member_id` per lo stesso socio, o `treasury_member_id` già usato → `409 conflict`; socio inesistente → `404 not_found`.

Dopo l'ack, `member_update` con quel `treasury_member_id` aggiorna l'Area Socio. Finché la tessera non è assegnata, la categoria già presente sul sito resta.

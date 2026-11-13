# Stanza Consiglio su Coolify

LiveKit gira sullo stesso server dell'associazione: nessun abbonamento, registrazione server o servizio video esterno. Audio Opus 24 kbit/s, webcam facoltativa (limite pubblicazione 250 kbit/s), massimo 7 connessioni. Il traffico attraversa il server SFU; non è una mesh P2P. Il costo è banda/risorse del server. La trascrizione resta separata, sul provider IA configurato dal Presidente; disattivandola si conserva la redazione manuale.

## Attivazione quando sarà scelto il dominio

1. Creare su Coolify una risorsa Docker Compose da questa directory (repository `EpocarPC`, base directory `/deploy/board-live`, file `compose.yml`). Assegnare al servizio `board-live` un dominio HTTPS con porta di destinazione **7880**. Coolify termina TLS e deve inoltrare WebSocket. Il DNS deve puntare direttamente al server; nessun proxy CDN per i media UDP.
2. Configurare le variabili di `.env.example` nei segreti Coolify. Generare una coppia con `livekit-server generate-keys` oppure usare una chiave alfanumerica e un segreto casuale base64url di almeno 32 caratteri. `LIVEKIT_NODE_IP` è l'IPv4 pubblico del server (lasciarlo vuoto consente la scoperta via STUN). Usare **solo il progetto Supabase esterno `cgbaunizlqqhctiiogok`** e la sua chiave service-role. Mai `VITE_*`, Git o frontend per questi segreti.
3. Aprire sul firewall del server/provider **7881/TCP, 7882/UDP, 3478/UDP**. La porta 7880 resta accessibile al proxy Coolify, non è pubblicata sull'host dal Compose. Applicare prima `setup/board-v26.sql` sul progetto esterno, dopo v23–v25, e pubblicare la funzione `board-room` con verifica JWT.
4. Avviare il servizio; controllare lo stato di salute e i log senza stampare i segreti. Nei segreti delle Edge Function del progetto esterno impostare `LIVEKIT_URL=wss://<dominio-scelto>`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` uguali a Coolify. Nessun endpoint va inventato finché il dominio non è deciso.
5. Collaudare con due dispositivi, almeno uno su rete mobile: ascolto reciproco, accensione/spegnimento microfono, webcam, riconnessione, chiusura e rimozione della carica. La conferma della presenza rimane un'azione esplicita del Presidente/verbalizzante, distinta dall'accesso alla stanza.

Il supervisore consulta Supabase ogni 5 secondi e rimuove gli utenti senza carica/invito e le stanze chiuse. Se non può verificare i permessi, arresta LiveKit; un controllo indipendente impone l'arresto dopo 15 secondi senza verifica riuscita. LiveKit e supervisore condividono lo stesso container: non avviare il solo SFU in produzione. I token durano 30 secondi per l'ingresso; il supervisore controlla anche le connessioni già aperte. La stanza rifiuta nuovi ingressi se manca il battito recente del supervisore.

## Reti che consentono soltanto TLS su 443

La configurazione inclusa offre UDP e fallback WebRTC TCP sulla 7881, con TURN/UDP sulla 3478. Su reti aziendali che bloccano queste porte serve anche TURN/TLS su 443. Non basta inoltrare TURN attraverso il normale proxy HTTP di Coolify.

Il supervisore supporta `LIVEKIT_TURN_DOMAIN`, certificato `/certs/turn.crt` e chiave `/certs/turn.key`: per attivarlo occorre predisporre un secondo IP pubblico con la 443 dedicata, oppure un bilanciatore TCP con instradamento SNI e certificati validi, e adattare rete/mount del Compose. Non occupare la 443 già usata dal sito. Questa scelta dipende dal dominio e dalla rete del server; va collaudata prima di dichiarare copertura delle reti restrittive.

## Verifica locale

```sh
npm ci --prefix deploy/board-live
npm test --prefix deploy/board-live
# Richiede il binario livekit-server 1.13.11 nel PATH e Chromium Playwright:
npx playwright install chromium
npx playwright test --config tests/board-live.config.ts
```

Il test avvia server locale e due browser con dispositivi sintetici. Non usa Supabase reale né costituisce collaudo di microfoni fisici, NAT, DNS o TLS pubblici.

Riferimenti: [deployment LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/), [porte e firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/), [configurazione ufficiale](https://github.com/livekit/livekit/blob/master/config-sample.yaml).

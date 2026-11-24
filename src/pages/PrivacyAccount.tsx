import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";

const sections = [
  ["Registrazione e accesso", "L’Associazione EPOCAR, a Piacenza, è il titolare del trattamento dei dati del portale. Usiamo nome, cognome, indirizzo email e credenziali per creare e gestire il tuo account e consentirti di accedere ai servizi richiesti (art. 6, par. 1, lett. b del GDPR). Se scegli di accedere con Google, riceviamo da Google i dati identificativi del profilo necessari all’accesso. Puoi consultare le pagine pubbliche anche senza registrarti."],
  ["Profilo, garage e prenotazioni", "Puoi aggiungere città, telefono, foto del profilo e dati dei veicoli. Quando prenoti un evento o uno shooting, usiamo i dati della richiesta per organizzare la partecipazione e inviarti conferme e aggiornamenti. Per gli shooting la targa serve alla gestione degli accessi e dei permessi. Nel modulo della serata trovi l’informativa specifica e le scelte sull’uso delle immagini."],
  ["Le mie foto e Gallery", "Gli scatti consegnati nel profilo sono accessibili ai destinatari selezionati per 30 giorni dalla consegna. Alla scadenza termina il download privato. La pubblicazione nella Gallery è facoltativa e si basa sul consenso (art. 6, par. 1, lett. a del GDPR). Una foto pubblicata può restare visibile dopo la scadenza dell’album. Puoi chiedere il ritiro scrivendo all’Associazione. La revoca vale per il futuro e lascia impregiudicata la liceità del trattamento precedente."],
  ["Chi tratta i dati", "Le persone autorizzate da EPOCAR accedono ai dati secondo il loro ruolo. Il portale utilizza Vercel per ospitare il sito e Supabase per autenticazione, database e file. Per gli shooting usiamo Brevo per le email operative e Google Calendar per orario e luogo degli appuntamenti confermati."],
  ["Conservazione e cancellazione", "Conserviamo i dati del profilo per la durata dell’account. Dal profilo puoi aggiornare i tuoi dati o scegliere «Elimina definitivamente il mio account». La cancellazione rimuove il profilo e il garage e rende anonime le iscrizioni agli eventi. I documenti associativi e contabili soggetti a obblighi di conservazione seguono i termini applicabili a ciascun documento."],
];

export default function PrivacyAccount() {
  return <>
    <PageMeta title="Privacy degli account — EPOCAR" description="Informativa sul trattamento dei dati del profilo EPOCAR." path="/privacy-account" />
    <Navbar />
    <main className="mx-auto max-w-3xl space-y-8 px-6 pb-20 pt-32">
      <header><h1 className="font-headline text-5xl">Privacy degli account</h1><p className="mt-2 text-sm">Aggiornata il 24 novembre 2026</p></header>
      {sections.map(([title, body]) => <section key={title}><h2 className="mb-2 font-headline text-2xl">{title}</h2><p className="leading-relaxed">{body}</p></section>)}
      <section><h2 className="mb-2 font-headline text-2xl">Contatti e diritti</h2>
        <p className="leading-relaxed">Per chiedere accesso, rettifica, cancellazione, limitazione o portabilità dei dati, esercitare il diritto di opposizione nei casi previsti o revocare un consenso, scrivi a <a className="underline" href="mailto:epocarpc@gmail.com">epocarpc@gmail.com</a>. Puoi anche presentare reclamo al <a className="underline" href="https://www.garanteprivacy.it/">Garante per la protezione dei dati personali</a>.</p>
      </section>
    </main>
    <Footer />
  </>;
}

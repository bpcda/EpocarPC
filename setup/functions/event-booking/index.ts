// External deployment only. Copy this directory to supabase/functions/event-booking.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import nodemailer from 'npm:nodemailer@6';
import { bookingSchema } from './schema.ts';
const requestSchema = z.discriminatedUnion('action', [
 z.object({ action: z.literal('book'), booking: bookingSchema }),
 z.object({ action: z.literal('claim'), booking_id: z.string().uuid() }),
 z.object({ action: z.literal('resend'), booking_id: z.string().uuid() }),
]);
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type':'application/json' } });
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return reply({ok:false,message:'Metodo non consentito'},405);
 try {
  if(Number(req.headers.get('content-length')||0)>100000) return reply({ok:false,message:'Richiesta troppo grande'},413);
  const raw=await req.text(); if(raw.length>100000) return reply({ok:false,message:'Richiesta troppo grande'},413);
  const parsed=requestSchema.safeParse(JSON.parse(raw));
  if(!parsed.success) return reply({ok:false,message:parsed.error.issues[0]?.message||'Dati non validi'},400);
  const url=Deno.env.get('SUPABASE_URL'); const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key) return reply({ok:false,message:'Servizio non configurato'},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  // Client SDK may send the public project key on guest requests, not a user JWT.
  const anon=Deno.env.get('SUPABASE_ANON_KEY'); let user=null; let otp=false;
  if(token&&token!==anon) {
   const result=await db.auth.getUser(token);
   if(result.error||!result.data.user) return reply({ok:false,message:'Sessione scaduta. Accedi nuovamente.'},401);
   user=result.data.user;
   try { const jwt=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); otp=Array.isArray(jwt.amr)&&jwt.amr.some((a: {method?: string})=>a.method==='otp'); } catch { otp=false; }
  }
  const input=parsed.data; let receipt; let id;
  if(input.action==='claim') {
   if(!user) return reply({ok:false,message:'Accedi dal link di attivazione ricevuto via email'},401);
   const {data,error}=await db.rpc('event_booking_claim',{_booking_id:input.booking_id,_user_id:user.id,_email:user.email||'',_otp_verified:otp});
   if(error) return reply({ok:false,message:'Attivazione non verificata o prenotazione non disponibile'},403);
   return reply({ok:true,saved:data});
  }
  if(input.action==='book') {
   const {data,error}=await db.rpc('event_booking_create',{_booking:input.booking,_user_id:user?.id??null});
   if(error) {
    const msg=error.message;
    const friendly=msg.includes('capacity')?'Posti esauriti per la partecipazione scelta.':msg.includes('Retry conflict')?'I dati sono cambiati dopo il primo invio. Verifica la prenotazione.':msg.includes('Privacy')||msg.includes('terms')?'Informative aggiornate: ricarica la pagina e verifica le accettazioni.':msg.includes('Bookings closed')?'Le prenotazioni non sono aperte.':'Prenotazione non riuscita. Controlla i dati o riprova più tardi.';
    return reply({ok:false,message:friendly},error.code==='PGRST202'?503:400);
   }
   receipt=data; id=data.id;
   if(data.replayed) return reply(data);
  } else {
   if(!user) return reply({ok:false,message:'Accesso richiesto'},401);
   const {data:roles,error}=await db.from('user_roles').select('role').eq('user_id',user.id).in('role',['admin','staff']);
   if(error||!roles?.length) return reply({ok:false,message:'Operazione non consentita'},403);
   id=input.booking_id;
  }
  const {data:b,error:readError}=await db.from('event_bookings').select('*').eq('id',id).single();
  if(readError||!b) return reply(receipt||{ok:false,message:'Prenotazione non disponibile'},receipt?200:404);
  const {data:event}=await db.from('events').select('title,date,location').eq('id',b.event_id).single();
  let email_status=b.email_status; let activation_status=b.activation_status;
  // Summary failure NEVER rolls back a successful reservation. SMTP is configured externally.
  if(input.action==='resend'||email_status!=='sent') {
   const host=Deno.env.get('EVENT_SMTP_HOST'); const from=Deno.env.get('EVENT_EMAIL_FROM');
   try {
    if(!host||!from) throw new Error('mail not configured');
    const transport=nodemailer.createTransport({host,port:Number(Deno.env.get('EVENT_SMTP_PORT')||465),secure:Deno.env.get('EVENT_SMTP_SECURE')!=='false',auth:{user:Deno.env.get('EVENT_SMTP_USER'),pass:Deno.env.get('EVENT_SMTP_PASS')}});
    await transport.sendMail({from,to:b.email,subject:`Prenotazione ${b.reference} — Epocar`,text:[event?.title||'Evento Epocar',`Riferimento: ${b.reference}`,`Partecipanti: ${b.participants}`,`Veicoli: ${b.vehicles.length}`,`Giro: ${b.drive?'Sì':'No'}`,`Esposizione: ${b.exhibition?'Sì':'No'}`,event?.location||'',...b.vehicles.map((v:{brand:string;model:string;plate:string})=>`${v.brand} ${v.model} · ${v.plate}`)].join('\n')});
    email_status='sent';
   } catch { email_status='failed'; }
  }
  if(b.account_requested&&!b.user_id&&(input.action==='resend'||activation_status!=='sent')) {
   try {
    const origin=Deno.env.get('EVENT_SITE_ORIGIN'); if(!origin||new URL(origin).protocol!=='https:') throw new Error('origin missing');
    const {error}=await db.auth.signInWithOtp({email:b.email,options:{shouldCreateUser:true,emailRedirectTo:`${origin}/eventi/${b.event_id}/iscrizione?claim=${b.id}`,data:{first_name:b.first_name,last_name:b.last_name}}});
    if(error) throw error;
    activation_status='sent';
   } catch { activation_status='failed'; }
  }
  await db.from('event_bookings').update({email_status,activation_status}).eq('id',b.id);
  return reply({ok:true,id:b.id,reference:b.reference,email_status,activation_status,account_requested:b.account_requested});
 } catch { return reply({ok:false,message:'Richiesta non valida o servizio temporaneamente non disponibile'},400); }
});

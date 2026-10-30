import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { describe,it,expect,vi } from 'vitest';
import { bookingSchema } from '@/lib/event-booking-schema';
const booking={event_id:'00000000-0000-4000-8000-000000000010',idempotency_key:'00000000-0000-4000-8000-000000000011',mode:'without_vehicle',first_name:'Mario',last_name:'Rossi',email:'test@example.invalid',phone:'3331234567',participants:2,drive:false,exhibition:false,vehicles:[],privacy_accepted:true,privacy_version:'1',account_requested:false,account_terms_accepted:false,account_terms_version:''};
function endpoint({invalidToken=false,admin=false,requested=false,replay=false}={}){
 let handler:((req:Request)=>Promise<Response>)|undefined;
 const otp=vi.fn().mockResolvedValue({error:null});const rpc=vi.fn().mockResolvedValue({data:{ok:true,id:booking.event_id,reference:'EPC-TEST',email_status:'pending',account_requested:requested,replayed:replay},error:null});
 const row={...booking,id:booking.event_id,reference:'EPC-TEST',email_status:'pending',activation_status:'pending',user_id:null,account_requested:requested};
 const update=vi.fn(()=>({eq:vi.fn().mockResolvedValue({error:null})}));
 const db={rpc,auth:{getUser:vi.fn().mockResolvedValue({data:{user:invalidToken?null:{id:'actor',email:booking.email}},error:invalidToken?{}:null}),signInWithOtp:otp},from:(name:string)=>({update,select:()=>({eq:()=>({single:async()=>({data:name==='events'?{title:'Synthetic'}:row,error:null}),in:async()=>({data:admin?[{role:'admin'}]:[],error:null})})})})};
 const Deno={env:{get:(k:string)=>({SUPABASE_URL:'http://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',SUPABASE_ANON_KEY:'public-test',EVENT_SITE_ORIGIN:'https://example.invalid'}[k])},serve:(fn:typeof handler)=>{handler=fn;}};
 const source=readFileSync('setup/functions/event-booking/index.ts','utf8').replace(/^import .*;\s*$/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 new Function('Deno','createClient','corsHeaders','z','nodemailer','bookingSchema',code)(Deno,()=>db,{'Access-Control-Allow-Origin':'*'},z,{createTransport:vi.fn()},bookingSchema);
 return {rpc,otp,update,call:async(body:unknown,token='public-test',method='POST')=>{if(!handler)throw Error('No handler');return handler(new Request('http://localhost/event-booking',{method,headers:{Authorization:`Bearer ${token}`},...(method==='OPTIONS'?{}:{body:JSON.stringify(body)})}));}};
}
describe('guest endpoint synthetic service tests',()=>{
 it('handles CORS preflight before all operations',async()=>{const f=endpoint();expect((await f.call({},'public-test','OPTIONS')).status).toBe(200);expect(f.rpc).not.toHaveBeenCalled();});
 it('rejects malformed inputs before writes',async()=>{const f=endpoint();expect((await f.call({action:'book',booking:{}})).status).toBe(400);expect(f.rpc).not.toHaveBeenCalled();});
 it('validates provided user tokens',async()=>{const f=endpoint({invalidToken:true});expect((await f.call({action:'book',booking},'invalid')).status).toBe(401);expect(f.rpc).not.toHaveBeenCalled();});
 it('keeps the booking confirmed when summary email is unavailable',async()=>{const f=endpoint();const r=await f.call({action:'book',booking});expect(r.status).toBe(200);expect(await r.json()).toMatchObject({ok:true,email_status:'failed'});expect(f.otp).not.toHaveBeenCalled();});
 it('sends explicit activation via the existing auth service only when requested',async()=>{const f=endpoint({requested:true});expect((await f.call({action:'book',booking})).status).toBe(200);expect(f.otp).toHaveBeenCalledWith(expect.objectContaining({email:booking.email,options:expect.objectContaining({shouldCreateUser:true})}));});
 it('does not resend or create accounts on replay',async()=>{const f=endpoint({replay:true,requested:true});expect((await f.call({action:'book',booking})).status).toBe(200);expect(f.otp).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();});
 it('denies unauthenticated garage claim',async()=>{const f=endpoint();expect((await f.call({action:'claim',booking_id:booking.event_id})).status).toBe(401);expect(f.rpc).not.toHaveBeenCalled();});
 it('denies resend for a signed-in nonstaff user',async()=>{const f=endpoint();expect((await f.call({action:'resend',booking_id:booking.event_id},'user-token')).status).toBe(403);expect(f.update).not.toHaveBeenCalled();});
});

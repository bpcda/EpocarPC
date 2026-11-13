// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import JSZip from 'jszip';
import {minutesDocx} from '@/lib/board-docx';
import type {Meeting} from '@/lib/board';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
const meeting:Meeting={id:'meeting',meeting_year:2026,meeting_number:2,scheduled_at:'2026-11-01T17:00:00Z',location:'Piacenza',mode:'presenza',video_link:null,description:null,urgency_reason:null,status:'VERBALE_IN_REVISIONE',status_reason:'Quorum non raggiunto',minute_taker_id:'secretary',started_at:'2026-11-01T17:00:00Z',ended_at:'2026-11-01T18:00:00Z',board_meeting_participants:[],board_agenda_items:[]};
describe('signature documents preserve approval meaning',()=>{
  it('labels an unapproved report without attributing approval to the signature',async()=>{
    const blob=await minutesDocx(meeting,'Resoconto senza quorum',1,false);
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Resoconto non approvato');expect(xml).toContain('la firma non costituisce approvazione');expect(xml).toContain('Resoconto senza quorum');
  });
  it('identifies a subsequent correction and its exact original version',async()=>{
    const blob=await minutesDocx(meeting,'Testo rettificato',3,true,{id:'original-id',version:2});
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Rettifica di un atto precedente');expect(xml).toContain('original-id, versione 2');expect(xml).toContain('RETTIFICA APPROVATA');
  });
});

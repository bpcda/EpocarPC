// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import JSZip from 'jszip';
import {minutesDocx} from '@/lib/board-docx';
import {reviewPackage} from '@/lib/board-workflow';
import type {Meeting, Minutes} from '@/lib/board';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/board', async original => ({...await original<typeof import('@/lib/board')>(),loadDeliberations:async()=>[]}));
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
  it('packages the current review documents and notes without retaining audio or transcripts',async()=>{
    const minutes:Minutes={id:'minutes',meeting_id:meeting.id,number:2,status:'BOZZA',current_version:1,signed_path:null,signed_at:null,board_minute_rectifications:[],board_minute_versions:[{id:'v1',version:1,body:'Testo corrente da revisionare',content_hash:'hash',source:'manuale',created_by:'secretary',created_at:'2026-11-13T18:00:00Z'}]};
    const blob=await reviewPackage(meeting,minutes,['Verificare il punto 2']);
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['Convocazione.docx','Delibere_e_votazioni.json','LEGGIMI.txt','Presenze.txt','Seduta.json','Verbale_da_revisionare.docx']);
    expect(await zip.file('LEGGIMI.txt')!.async('string')).toContain('Verificare il punto 2');
    expect(JSON.parse(await zip.file('Seduta.json')!.async('string'))).toMatchObject({purpose:'revisione',version:1,status:'BOZZA',content_hash:'hash'});
    const word=await JSZip.loadAsync(await zip.file('Verbale_da_revisionare.docx')!.async('uint8array'));
    expect(await word.file('word/document.xml')!.async('string')).toContain('Testo corrente da revisionare');
  });
});

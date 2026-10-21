import test from 'node:test';
import assert from 'node:assert/strict';
import {audiobookDetails,audioFileInfo,inspectAudioFile,formatAudioDuration,MAX_AUDIO_BYTES} from '../../audiobooks/model.js';
import {createAudiobooksApi} from '../../audiobooks/client.js';

function file(){return new File([new Uint8Array([73,68,51,0,0,0,0,0,0,0])],'chapter.mp3',{type:'audio/mpeg'});}
function fixture({failAdd=false,lostResponse=false,failLookup=false}={}){
 const book={id:'audio',owner_id:'owner',title:'Audio',rights_confirmed:true},tracks=[],removed=[],uploaded=[];
 let calls=0;
 const storage={upload:async(path)=>{uploaded.push(path);return {};},remove:async paths=>{removed.push(...paths);return {};},createSignedUrl:async(path,expiry)=>({data:{signedUrl:'https://example.test/private?path='+path+'&expiry='+expiry}})};
 const client={storage:{from:()=>storage},from(table){
  const q={select(){return q;},eq(){return q;},order(){return q;},async maybeSingle(){return {data:book};},then(resolve){if(failLookup)throw Error('Network');return Promise.resolve({data:table==='audiobook_tracks'?tracks:[book]}).then(resolve);}};return q;
 },async rpc(name,args){calls++;
  if(name==='add_audiobook_track'){
   if(failAdd)return {error:{message:'Insert denied'}};
   const track={id:'track',...args.p_details};tracks.push(track);
   if(lostResponse)throw Error('Network');return {data:track};
  }
  if(name==='remove_audiobook_track')return {data:{storage_path:'owner/audio/file.mp3'}};
  return {data:{...book,...args.p_details}};
 }};
 return {api:createAudiobooksApi(client,'owner'),book,tracks,removed,uploaded,get calls(){return calls;}};
}
test('audiobook metadata validates required title and preserves link/credits',()=>{
 const d=audiobookDetails({title:'  Narrated Book ',linked_book_id:'written',narrator:' Narrator ',credits:'Studio',rights_confirmed:true});
 assert.equal(d.title,'Narrated Book');assert.equal(d.linked_book_id,'written');assert.equal(d.narrator,'Narrator');assert.equal(d.rights_confirmed,true);
 assert.throws(()=>audiobookDetails({title:''}),/title/);assert.throws(()=>audiobookDetails({title:'a',credits:'x'.repeat(2001)}),/2000/);
 assert.equal(audiobookDetails({title:'Standalone'}).linked_book_id,null);
});
test('upload validation rejects oversize, empty, wrong type and renamed files',async()=>{
 assert.throws(()=>audioFileInfo({name:'book.mp3',size:MAX_AUDIO_BYTES+1}),/50 MB/);
 assert.throws(()=>audioFileInfo({name:'book.mp3',size:0}),/empty/);
 assert.throws(()=>audioFileInfo({name:'book.exe',size:5}),/MP3/);
 await assert.rejects(inspectAudioFile(new File(['not audio'],'fake.mp3',{type:'audio/mpeg'})),/format/);
 assert.equal((await inspectAudioFile(file())).extension,'mp3');
});
test('local accounts cannot save or upload audio',async()=>{
 const api=createAudiobooksApi(null,'');await assert.rejects(api.save(null,{title:'Book'}),/Sign in/);
 await assert.rejects(api.upload('id',file(),{title:'Chapter',duration:30}),/Sign in/);
});
test('successful upload is private, uses unique owner path and records verified metadata',async()=>{
 const f=fixture(),track=await f.api.upload('audio',file(),{title:'Chapter',duration:30});
 assert.equal(track.id,'track');assert.match(f.uploaded[0],/^owner\/audio\/[a-f0-9-]+\.mp3$/);assert.equal(f.removed.length,0);
 assert.match(await f.api.preview(track),/private\?/);
});
test('recordings require saved rights confirmation',async()=>{
 const f=fixture();f.book.rights_confirmed=false;await assert.rejects(f.api.upload('audio',file(),{title:'Chapter',duration:30}),/permission/);assert.equal(f.uploaded.length,0);
});
test('failed metadata insert removes only an unused upload',async()=>{
 const f=fixture({failAdd:true});await assert.rejects(f.api.upload('audio',file(),{title:'Chapter',duration:30}),/Insert denied/);assert.deepEqual(f.removed,f.uploaded);
});
test('a lost insert response never removes a committed recording',async()=>{
 const f=fixture({lostResponse:true}),track=await f.api.upload('audio',file(),{title:'Chapter',duration:30});assert.equal(track.id,'track');assert.equal(f.removed.length,0);
});
test('uncertain saved state retains the upload and tells the author to reload',async()=>{
 const f=fixture({failAdd:true,failLookup:true});await assert.rejects(f.api.upload('audio',file(),{title:'Chapter',duration:30}),/uncertain/);assert.equal(f.removed.length,0);
});
test('duration labels support complete-book recordings',()=>{
 assert.equal(formatAudioDuration(3661),'1:01:01');assert.equal(formatAudioDuration(95),'1:35');
});

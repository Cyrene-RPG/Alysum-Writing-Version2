// EPUB chapter extraction from an already parsed EPUB spine.
// The importer must parse the ZIP/container server-side and pass ordered XHTML
// spine documents; never trust client-supplied paid chapter contents.
import {passText} from './model.js';
export function epubChapters(spine){
 if(!Array.isArray(spine)||!spine.length||spine.length>500)throw Error('EPUB must contain 1–500 spine entries.');
 const seen=new Set();
 const chapters=spine.map((entry,index)=>{
  const id=String(entry?.id||'').trim();
  const title=String(entry?.title||'Chapter '+(index+1)).trim().slice(0,300);
  const html=String(entry?.html||'');
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id)||seen.has(id))throw Error('Invalid or duplicate EPUB chapter ID.');
  seen.add(id);
  const text=passText(html);
  if(!text)throw Error('EPUB chapter contains no readable text.');
  return {id,title,text};
 });
 if(new TextEncoder().encode(JSON.stringify(chapters)).length>2000000)throw Error('EPUB exceeds Purchase Pass chapter limit.');
 return chapters;
}
export function selectEpubChapters(chapters,mode,chapterIds=[]){
 if(!['book','bundle'].includes(mode))throw Error('Invalid Purchase Pass mode.');
 if(mode==='book')return chapters;
 if(!Array.isArray(chapterIds)||chapterIds.length<1||new Set(chapterIds).size!==chapterIds.length)throw Error('Choose unique chapters.');
 const selected=chapters.filter(ch=>chapterIds.includes(ch.id));
 if(selected.length!==chapterIds.length)throw Error('Unknown EPUB chapter.');
 return selected;
}

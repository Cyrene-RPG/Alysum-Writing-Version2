import { itemKind } from "./outline.js";
import { countWordsInHtml } from "./word-count.js";
/** Restore only manuscript fields. Ownership, publication and source IDs never transfer. */
export function restoreBookBackup(envelope, sanitizeHtml) {
 if(envelope?.format!=='alysum-book-backup'||envelope.version!==1||!envelope.book?.sections)throw Error('Choose an Alysum book backup (version 1).');
 if(typeof sanitizeHtml!=='function')throw Error('A safe HTML reader is required.');
 const source=envelope.book,ids=new Set(),outline=[];let count=0,chapterCount=0,partCount=0,words=0;
 function nodes(items,depth=0,section='body',note=false){
  if(!Array.isArray(items)||depth>40)throw Error('This backup has an invalid chapter structure.');
  return items.map(item=>{
   if(!item||typeof item!=='object'||++count>20000)throw Error('This backup has an invalid chapter structure.');
   const id=typeof item.id==='string'&&item.id?item.id:globalThis.crypto.randomUUID();
   if(ids.has(id))throw Error('This backup contains duplicate chapter IDs.');ids.add(id);
   const folder=itemKind(item)==='folder',isNote=note||itemKind(item)==='note',title=String(item.title||'Untitled'),content=sanitizeHtml(String(item.content||''));
   const row={id,title,...(folder?{kind:'folder'}:isNote?{kind:'note'}:item.kind?{kind:'chapter'}:{}),content};
   const n=countWordsInHtml(content);
   for(const field of ['defaultFont','defaultFontSize'])if(typeof item[field]==='string')row[field]=item[field].slice(0,200);
   const safeImage=url=>typeof url==='string'&&/^(https:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(url);
   if(safeImage(item.imageUrl))row.imageUrl=item.imageUrl;
   if(Array.isArray(item.imageUrls))row.imageUrls=item.imageUrls.filter(safeImage);
   if(!isNote){if(folder)partCount++;else{chapterCount++;words+=n;}outline.push({title,kind:folder?'part':section==='body'?'chapter':section,depth,words:n,chapters:0});}
   if(folder)row.children=nodes(item.children||[],depth+1,section,isNote);
   if(item.notes)row.notes=nodes(item.notes,depth+1,section,true);
   return row;
  });
 }
 const sections={};for(const key of ['front','body','back'])sections[key]=nodes(source.sections[key]||[],0,key);
 if(!chapterCount)throw Error('This backup contains no chapters.');
 return {title:String(source.title||'Recovered book'),media_format:['novel','screenplay','comic','manga','manhwa'].includes(source.media_format)?source.media_format:'novel',sections,outline,words,chapterCount,partCount,method:{kind:'backup'},notes:['Restored as a new private book, including chapter notes. The original book and publication settings are unchanged.']};
}

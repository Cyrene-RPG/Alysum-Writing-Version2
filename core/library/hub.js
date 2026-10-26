import {normalizeGenreList} from '../publishing/genres.js';
export const HUB_PAGE_SIZE=24;
export const HUB_SHELVES={reading:'Currently reading',want:'Want to read',finished:'Finished',subscriptions:'Subscribed books'};
export function normalizeHubBook(row){
 const d=row?.data||row||{},anonymous=Boolean(d.anonymous||d.isAnonymous||d.is_anonymous);
 const released=Array.isArray(d.chapters)?d.chapters.filter(c=>!Array.isArray(d.publishedChapterIds)||d.publishedChapterIds.includes(c.id)):[];
 return {id:String(row?.id||d.id||''),ownerId:anonymous?'':String(d.ownerId||row?.user_id||d.ownerUserId||''),anonymous,
 title:String(d.title||'Untitled'),author:anonymous?'Anonymous':String(d.author||'Unknown author'),summary:String(d.summary||''),coverUrl:String(d.coverUrl||d.cover_url||''),coverCrop:d.coverCrop||d.cover_crop||null,
 genres:normalizeGenreList(d),tags:Array.isArray(d.tags)?d.tags.map(String):[],warnings:Array.isArray(d.warnings)?d.warnings.map(String):[],
 status:['complete','completed'].includes(d.status||d.serializationStatus)?'complete':'in_progress',rating:String(d.rating||''),format:['comic','manga','manhwa','screenplay'].includes(d.format||d.mediaFormat)?(d.format||d.mediaFormat):'novel',
 words:Number(d.words)||released.reduce((n,c)=>n+(Number(c.wordCount)||0),0),chapters:typeof d.chapters==='number'?d.chapters:Number(d.publishedChapterCount)||released.length,
 paid:Boolean(d.paid||released.some(c=>c.locked)),publishedAt:d.publishedAt||d.published_at||row?.created_at||null,lastReleaseAt:d.lastReleaseAt||null,
 readers:Math.max(0,Number(d.readers)||0),weeklyReaders:Math.max(0,Number(d.weeklyReaders)||0)};
}
export function filterHubBooks(books,filters={}){
 const q=String(filters.q||'').toLowerCase().trim(),genres=filters.genres||[],tags=filters.tags||[],exclude=filters.excludeTags||[],warnings=filters.excludeWarnings||[];
 return books.filter(b=>(!q||[b.title,b.author,b.summary,...b.genres,...b.tags].join(' ').toLowerCase().includes(q))
 &&(!genres.length||genres.some(g=>b.genres.includes(g)))&&tags.every(t=>b.tags.map(x=>x.toLowerCase()).includes(t.toLowerCase()))&&!exclude.some(t=>b.tags.map(x=>x.toLowerCase()).includes(t.toLowerCase()))
 &&!warnings.some(t=>b.warnings.map(x=>x.toLowerCase()).includes(t.toLowerCase()))&&(!filters.status||filters.status==='all'||b.status===filters.status)
 &&(!filters.format||filters.format==='all'||b.format===filters.format)&&(!filters.rating||filters.rating==='all'||b.rating===filters.rating)
 &&(!filters.availability||filters.availability==='all'||(filters.availability==='paid'?b.paid:!b.paid))
 &&(!filters.length||filters.length==='all'||(filters.length==='short'?b.words>0&&b.words<10000:filters.length==='medium'?b.words>=10000&&b.words<50000:b.words>=50000))
 &&(!filters.ids?.length||filters.ids.includes(b.id)));
}
export function diverseBooks(books,{exclude=new Set(),limit=6,maxPerAuthor=2}={}){
 const counts=new Map(),result=[];
 for(const b of books){const author=b.ownerId||b.id;if(exclude.has(b.id)||(counts.get(author)||0)>=maxPerAuthor)continue;result.push(b);exclude.add(b.id);counts.set(author,(counts.get(author)||0)+1);if(result.length>=limit)break;}
 return result;
}
export const hubMissing=error=>['PGRST202','42883','42P01','PGRST205'].includes(error?.code);
export function createLibraryHub(client,{readingState=null,subscriptions=[],viewerId=null}={}){
 let available=true,fallbackPromise=null;
 async function call(name,args){const {data,error}=await client.rpc(name,args);if(error){const failure=Error(hubMissing(error)?'This Library feature is temporarily unavailable.':error.message||'Could not load your Library.');failure.code=error.code;throw failure;}return data;}
 async function fallback(){if(!fallbackPromise)fallbackPromise=(async()=>{const {data,error}=await client.rpc('library_catalog_rows');if(error)throw Error('Could not load books. Please try again.');return(data||[]).map(normalizeHubBook);})();return fallbackPromise;}
 return {get available(){return available;},
 async query(filters={},offset=0,limit=HUB_PAGE_SIZE){try{const data=await call('library_hub_query',{p_filters:filters.shelf&&viewerId?{...filters,expectedUser:viewerId}:filters,p_offset:offset,p_limit:limit});available=true;return{...data,items:(data?.items||[]).map(normalizeHubBook)};}catch(error){if(!hubMissing(error))throw error;available=false;let books=filterHubBooks(await fallback(),filters);if(filters.shelf){const shelves=readingState?.read('shelves')||{},positions=readingState?.read('read-position')||{};books=books.filter(b=>filters.shelf==='subscriptions'?subscriptions.includes(b.id):filters.shelf==='reading'?shelves[b.id]==='reading'||positions[b.id]&&!['want','finished'].includes(shelves[b.id]):shelves[b.id]===filters.shelf);}books.sort((a,b)=>filters.sort==='az'?a.title.localeCompare(b.title):filters.sort==='popular'?b.readers-a.readers:Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0));return{items:books.slice(offset,offset+limit),total:books.length,hasMore:books.length>offset+limit};}},
 async facets(){try{return await call('library_hub_facets',{});}catch(error){if(!hubMissing(error))throw error;const counts=new Map();for(const b of await fallback())for(const g of b.genres)counts.set(g,(counts.get(g)||0)+1);return{genres:[...counts].map(([id,count])=>({id,count}))};}},
 state(user,kind=null,book=null,value=null,write=false){return call('library_hub_state',{p_user:user,p_kind:kind,p_book:book,p_value:value,p_write:write});},
 collection(action,id=null,payload={}){return call('library_hub_collection',{p_action:action,p_id:id,p_payload:viewerId?{...payload,expectedUser:viewerId}:payload});}
 };
}

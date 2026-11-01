import {passSnapshot,passId,passPrice,makePassCode,passCodeHash,publicPass,samePass,checkoutUrl} from '../../purchase-access/model.js';
import {readWorkTags} from '../../publishing/work-tags.js';
const PUBLIC_URL='https://jrfxgpkpbacajhcwimgz.supabase.co',PUBLIC_KEY='sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
class PassError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new PassError(status,message);};
export function createPurchasePassServices(env,fetcher=fetch){
 const base=env.SUPABASE_URL||PUBLIC_URL;if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base))throw Error('Invalid database host.');
 const anon=env.SUPABASE_ANON_KEY||PUBLIC_KEY;
 return {
  async user(request){const token=request.headers.get('Authorization');if(!token?.startsWith('Bearer '))fail(401,'Sign in to use Purchase Passes.');const response=await fetcher(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:token},signal:AbortSignal.timeout(12000)});if(!response.ok)fail(401,'Sign in again to continue.');const user=await response.json();if(!/^[a-f0-9-]{36}$/i.test(user.id||'')||!user.email_confirmed_at)fail(401,'Use a verified Alysum account for Purchase Passes.');return user;},
  async db(table,{method='GET',query={},body,preference='return=representation'}={}){const url=new URL(base+'/rest/v1/'+table);for(const [key,value]of Object.entries(query))url.searchParams.set(key,String(value));const response=await fetcher(url,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:preference},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});if(!response.ok){if(table==='rpc/redeem_purchase_pass')fail(409,'This code is unavailable, already used by another account, or its access was revoked.');if(table==='rpc/create_purchase_pass_batch')fail(409,'This batch could not be confirmed. Reload the batch list before generating another.');fail(503,'Purchase Pass needs its SQL setup or the database is unavailable.');}return response.status===204?null:response.json();}
 };
}
async function input(request){const reader=request.body?.getReader();if(!reader)fail(400,'Send a request body.');let size=0;const chunks=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();fail(413,'Request too large.');}chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}try{const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{fail(400,'Send a valid JSON object.');}}
export async function handlePurchasePasses(request,env,injected={}){
 try{
  const url=new URL(request.url),action=url.searchParams.get('action')||'status';
  if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)fail(403,'This request came from another site.');
  const host=url.protocol==='https:'&&(['alysumwriting.com','www.alysumwriting.com'].includes(url.hostname)||/^[a-z0-9-]+\.alysum-writing-version2\.pages\.dev$/.test(url.hostname));
  if(!host&&!injected.services)fail(503,'Purchase Pass service is unavailable on this host.');
  if(!env.SUPABASE_SERVICE_ROLE_KEY&&!injected.services){if(action==='status')return reply({ready:false,testOnly:false});fail(503,'Purchase Pass service needs server setup.');}
  const {db,user}=injected.services||createPurchasePassServices(env,injected.fetcher);
  if(action==='status'&&request.method==='GET'){try{await db('purchase_passes',{query:{select:'id,checkout_url,sale_enabled',limit:0}});await db('rpc/purchase_pass_version',{method:'POST',body:{}});return reply({ready:true,testOnly:false});}catch{return reply({ready:false,testOnly:false});}}
  const member=await user(request),body=request.method==='POST'?await input(request):{};
  const ownerPass=async id=>{let value;try{value=passId(id);}catch(error){fail(400,error.message);}const [pass]=await db('purchase_passes',{query:{id:`eq.${value}`,owner_id:`eq.${member.id}`,limit:1}});if(!pass)fail(404,'Pass not found in your account.');return pass;};
  const source=async(id,ownerId=member.id)=>{if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id||''))fail(400,'Choose a saved book.');const [book]=await db('books',{query:{id:`eq.${id}`,user_id:`eq.${ownerId}`,limit:1}});if(!book)fail(404,'Book not found.');if(book.media_format&&book.media_format!=='novel'||book.publish_meta?.epubEdition)fail(400,'Purchase Passes currently support written original stories.');if(readWorkTags(book.publish_meta).workType==='fanfiction')fail(400,'Fan fiction cannot have purchase passes.');const hidden=await db('library_book_moderation',{query:{book_id:`eq.${id}`,visibility:'in.(hidden,removed)',limit:1}});if(hidden.length)fail(404,'This book is unavailable.');return book;};
  if(action==='offers'&&request.method==='GET'){
   const bookId=url.searchParams.get('book');if(!/^[a-zA-Z0-9_-]{1,160}$/.test(bookId||''))fail(400,'Choose a book.');
   const rows=await db('purchase_passes',{query:{source_book_id:`eq.${bookId}`,sale_enabled:'eq.true',limit:200}}),passes=[];
   for(const pass of rows){try{await source(pass.source_book_id,pass.owner_id);if(checkoutUrl(pass.checkout_url))passes.push(publicPass(pass));}catch(error){if(error.status!==400&&error.status!==404)throw error;}}
   return reply({passes});
  }
  if(action==='offer'&&request.method==='POST'){
   const pass=await ownerPass(body.passId);if(typeof body.enabled!=='boolean')fail(400,'Choose whether the offer is visible.');
   let link;try{link=checkoutUrl(body.checkoutUrl);}catch(error){fail(400,error.message);}if(body.enabled&&!link)fail(400,'Add your product checkout link first.');
   if(body.enabled)await source(pass.source_book_id);
   await db('purchase_passes',{method:'PATCH',query:{id:`eq.${pass.id}`,owner_id:`eq.${member.id}`},body:{checkout_url:link,sale_enabled:body.enabled}});return reply({saved:true});
  }
  if(action==='books' &&request.method==='GET'){const rows=await db('books',{query:{user_id:`eq.${member.id}`,select:'id,title,media_format,publish_meta',limit:200,order:'updated.desc'}});return reply({books:rows.filter(book=>(!book.media_format||book.media_format==='novel')&&!book.publish_meta?.epubEdition&&readWorkTags(book.publish_meta).workType==='original').map(book=>({id:book.id,title:book.title}))});}
  if(action==='chapters'&&request.method==='GET'){const book=await source(url.searchParams.get('book'));return reply({chapters:passSnapshot(book,'book').map(ch=>({id:ch.id,title:ch.title}))});}
  if(action==='create'&&request.method==='POST'){
   const book=await source(body.bookId);let chapters,amount,id;try{chapters=passSnapshot(book,body.mode,body.chapterIds);amount=passPrice(body.price);id=passId(body.requestId);}catch(error){fail(400,error.message);}
   const title=String(body.title||'').trim().slice(0,200),currency=String(body.currency||'').toUpperCase();if(!title||!['USD','GBP','EUR','CAD','AUD'].includes(currency))fail(400,'Name the pass and choose a supported currency.');
   const pass={id,owner_id:member.id,source_book_id:book.id,book_title:String(book.title||'Untitled').slice(0,200),title,mode:body.mode,amount,currency,chapters};
   const [old]=await db('purchase_passes',{query:{id:`eq.${id}`,limit:1}});if(old){if(!samePass(old,pass))fail(409,'This request already saved different details. Start a new pass.');return reply({pass:publicPass(old)});}
   await db('purchase_passes',{method:'POST',body:pass,preference:'resolution=ignore-duplicates,return=representation'});const saved=await ownerPass(id);if(!samePass(saved,pass))fail(409,'The saved pass could not be confirmed.');return reply({pass:publicPass(saved)},201);
  }
  if(action==='author-passes'&&request.method==='GET'){const rows=await db('purchase_passes',{query:{owner_id:`eq.${member.id}`,order:'created_at.desc',limit:200}});return reply({passes:rows.map(publicPass)});}
  if(action==='refresh'&&request.method==='POST'){const pass=await ownerPass(body.passId);if(pass.mode!=='book')fail(400,'Bundles keep their original chapter set. Create a new bundle for additional chapters.');const chapters=passSnapshot(await source(pass.source_book_id),'book');await db('purchase_passes',{method:'PATCH',query:{id:`eq.${pass.id}`,owner_id:`eq.${member.id}`},body:{chapters}});return reply({saved:true});}
  if(action==='generate'&&request.method==='POST'){
   const pass=await ownerPass(body.passId);await source(pass.source_book_id);let batch;try{batch=passId(body.requestId);}catch(error){fail(400,error.message);}const count=Number(body.count);if(!Number.isSafeInteger(count)||count<1||count>100)fail(400,'Generate 1–100 purchase codes at a time.');
   const codes=Array.from({length:count},()=>makePassCode());const records=await Promise.all(codes.map(async code=>({id:crypto.randomUUID(),code_hash:await passCodeHash(code)})));
   await db('rpc/create_purchase_pass_batch',{method:'POST',body:{p_batch:batch,p_pass:pass.id,p_owner:member.id,p_codes:records}});
   return reply({batchId:batch,codes,pass:publicPass(pass),testOnly:false},201);
  }
  if(action==='batches'&&request.method==='GET'){const pass=await ownerPass(url.searchParams.get('pass'));const batches=await db('purchase_pass_batches',{query:{pass_id:`eq.${pass.id}`,owner_id:`eq.${member.id}`,select:'id,created_at',order:'created_at.desc',limit:100}});const codes=await db('purchase_pass_codes',{query:{pass_id:`eq.${pass.id}`,select:'batch_id,buyer_id,canceled',limit:10000}});return reply({batches:batches.map(batch=>({...batch,total:codes.filter(c=>c.batch_id===batch.id).length,used:codes.filter(c=>c.batch_id===batch.id&&c.buyer_id).length,canceled:codes.filter(c=>c.batch_id===batch.id&&c.canceled).length}))});}
  if(action==='cancel-batch'&&request.method==='POST'){const pass=await ownerPass(body.passId);let batch;try{batch=passId(body.batchId);}catch(error){fail(400,error.message);}await db('rpc/cancel_purchase_pass_batch',{method:'POST',body:{p_batch:batch,p_pass:pass.id,p_owner:member.id}});return reply({canceled:true});}
  if(action==='redeem'&&request.method==='POST'){if(!await db('rpc/allow_purchase_pass_attempt',{method:'POST',body:{p_buyer:member.id}}))fail(429,'Too many attempts. Try again in ten minutes.');let hash;try{hash=await passCodeHash(body.code);}catch(error){fail(400,error.message);}const [record]=await db('purchase_pass_codes',{query:{code_hash:`eq.${hash}`,select:'pass_id',limit:1}});if(!record)fail(409,'This purchase code is unavailable.');const [offer]=await db('purchase_passes',{query:{id:`eq.${record.pass_id}`,limit:1}});if(!offer)fail(409,'This pass is unavailable.');await source(offer.source_book_id,offer.owner_id);const result=await db('rpc/redeem_purchase_pass',{method:'POST',body:{p_hash:hash,p_buyer:member.id}});return reply({passId:result.pass_id,alreadyRedeemed:result.already_redeemed===true,testOnly:false});}
  if(action==='my-passes'&&request.method==='GET'){const grants=await db('purchase_pass_grants',{query:{buyer_id:`eq.${member.id}`,state:'eq.active',select:'pass_id',limit:500}});const ids=grants.map(g=>g.pass_id);if(!ids.length)return reply({passes:[]});const passes=await db('purchase_passes',{query:{id:`in.(${ids.join(',')})`,limit:500}});return reply({passes:passes.map(publicPass)});}
  if(action==='grants'&&request.method==='GET'){const pass=await ownerPass(url.searchParams.get('pass'));const grants=await db('purchase_pass_grants',{query:{pass_id:`eq.${pass.id}`,select:'id,buyer_id,state,created_at',order:'created_at.desc',limit:500}});return reply({grants:grants.map(g=>({id:g.id,reader:g.buyer_id.slice(0,8),state:g.state,createdAt:g.created_at}))});}
  if(action==='revoke'&&request.method==='POST'){const pass=await ownerPass(body.passId);let grant;try{grant=passId(body.grantId);}catch(error){fail(400,error.message);}await db('purchase_pass_grants',{method:'PATCH',query:{id:`eq.${grant}`,pass_id:`eq.${pass.id}`},body:{state:'revoked'}});return reply({revoked:true});}
  if(action==='read'&&request.method==='GET'){
   let id;try{id=passId(url.searchParams.get('pass'));}catch(error){fail(400,error.message);}const [pass]=await db('purchase_passes',{query:{id:`eq.${id}`,limit:1}});if(!pass)fail(404,'Pass not found.');
   if(pass.owner_id!==member.id){const grants=await db('purchase_pass_grants',{query:{pass_id:`eq.${pass.id}`,buyer_id:`eq.${member.id}`,state:'eq.active',limit:1}});if(!grants.length)fail(403,'Redeem an unused purchase code to read this pass.');}
   await source(pass.source_book_id,pass.owner_id);return reply({pass:publicPass(pass),chapters:pass.chapters,testOnly:false});
  }
  fail(404,'Unknown Purchase Pass action.');
 }catch(error){return reply({error:error.status?error.message:'Purchase Pass service is unavailable. No access was granted.'},error.status||503);}
}

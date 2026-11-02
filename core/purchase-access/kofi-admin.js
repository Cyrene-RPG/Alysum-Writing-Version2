const productCode=value=>{
 const input=String(value||'').trim();
 const match=input.match(/^https:\/\/(?:www\.)?ko-fi\.com\/s\/([a-z0-9]{6,32})\/?(?:[?#].*)?$/i);
 if(match)return match[1].toLowerCase();
 return /^[a-z0-9]{6,32}$/i.test(input)?input.toLowerCase():null;
};
const response=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function handleKofiAdmin(request,env,{fetcher=fetch}={}){
 if(!['GET','POST'].includes(request.method))return response({error:'Method not allowed'},405);
 const origin=new URL(request.url).origin;
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return response({error:'Forbidden'},403);
 const token=(request.headers.get('Authorization')||'').match(/^Bearer (.+)$/)?.[1];
 if(!token||!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)return response({error:'Unauthorized'},401);
 const user=await fetcher(env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token}});
 if(!user.ok)return response({error:'Unauthorized'},401);
 const member=await user.json();if(!member.id||!member.email_confirmed_at)return response({error:'Confirm your email'},403);
 const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 const db=async(path,options={})=>{
  const res=await fetcher(env.SUPABASE_URL+'/rest/v1/'+path,{headers,...options});
  if(!res.ok)throw Error('Database unavailable');
  return res.json();
 };
 try{
  if(request.method==='GET'){
   const rows=await db('purchase_passes?owner_id=eq.'+encodeURIComponent(member.id)+'&select=id,title,mode,amount,currency&limit=100');
   const mappings=await db('kofi_pass_products?select=product_id,pass_id,enabled&limit=100');
   const accounts=await db('kofi_author_accounts?owner_id=eq.'+encodeURIComponent(member.id)+'&select=owner_id&limit=1');
   return response({passes:rows,mappings:mappings.filter(m=>rows.some(p=>p.id===m.pass_id)),accountConnected:accounts.length===1});
  }
  const body=await request.json();
  if(body.action==='connectAccount'){
   const secret=String(body.verificationToken||'').trim();
   if(!/^[\x21-\x7e]{16,256}$/.test(secret))return response({error:'Invalid Ko-fi verification token'},400);
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))),b=>b.toString(16).padStart(2,'0')).join('');
   const other=await db('kofi_author_accounts?token_sha256=eq.'+digest+'&select=owner_id&limit=1');
   if(other.length&&other[0].owner_id!==member.id)return response({error:'This Ko-fi account is connected to another author'},409);
   await db('kofi_author_accounts?on_conflict=owner_id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({owner_id:member.id,token_sha256:digest})});
   return response({saved:true,accountConnected:true});
  }
  const productId=productCode(body.productUrl||body.productId);
  if(!productId||! /^[0-9a-f-]{36}$/i.test(body.passId||'')||typeof body.enabled!=='boolean')return response({error:'Invalid mapping'},400);
  const account=await db('kofi_author_accounts?owner_id=eq.'+encodeURIComponent(member.id)+'&select=owner_id&limit=1');
  if(account.length!==1)return response({error:'Connect your Ko-fi account first'},409);
  const rows=await db('purchase_passes?id=eq.'+encodeURIComponent(body.passId)+'&owner_id=eq.'+encodeURIComponent(member.id)+'&select=id&limit=1');
  if(rows.length!==1)return response({error:'Pass not found'},404);
  const existing=await db('kofi_pass_products?product_id=eq.'+encodeURIComponent(productId)+'&select=pass_id&limit=1');
  if(existing.length){
   const owned=await db('purchase_passes?id=eq.'+encodeURIComponent(existing[0].pass_id)+'&owner_id=eq.'+encodeURIComponent(member.id)+'&select=id&limit=1');
   if(owned.length!==1)return response({error:'This Ko-fi product is already connected to another author'},409);
  }
  await db('kofi_pass_products?on_conflict=product_id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({product_id:productId,pass_id:body.passId,enabled:body.enabled})});
  return response({saved:true});
 }catch{return response({error:'Could not save Ko-fi mapping'},503);}
}

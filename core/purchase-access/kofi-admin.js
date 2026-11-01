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
   return response({passes:rows});
  }
  const body=await request.json();
  if(!/^[a-zA-Z0-9_-]{3,120}$/.test(body.productId||'')||! /^[0-9a-f-]{36}$/i.test(body.passId||'')||typeof body.enabled!=='boolean')return response({error:'Invalid mapping'},400);
  const rows=await db('purchase_passes?id=eq.'+encodeURIComponent(body.passId)+'&owner_id=eq.'+encodeURIComponent(member.id)+'&select=id&limit=1');
  if(rows.length!==1)return response({error:'Pass not found'},404);
  await db('kofi_pass_products?on_conflict=product_id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({product_id:body.productId,pass_id:body.passId,enabled:body.enabled})});
  return response({saved:true});
 }catch{return response({error:'Could not save Ko-fi mapping'},503);}
}

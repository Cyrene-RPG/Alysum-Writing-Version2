export async function handleKofiRefund(request,env,{fetcher=fetch}={}){
 if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 if(!env.KOFI_REFUND_SECRET||request.headers.get('Authorization')!=='Bearer '+env.KOFI_REFUND_SECRET)return Response.json({error:'Unauthorized'},{status:401});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 if(!/^[a-zA-Z0-9_-]{1,200}$/.test(body.transactionId||''))return Response.json({error:'Invalid transaction'},{status:400});
 const result=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/refund_kofi_order',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_transaction:body.transactionId})});
 return result.ok?Response.json({revoked:true}):Response.json({error:'Refund revocation failed'},{status:503});
}

const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
// Diagnostic events deliberately omit tokens, payment IDs, email addresses, and request bodies.
const diagnostic=(stage,details={})=>console.info('kofi_webhook',JSON.stringify({stage,...details}));
export async function handleKofiPayment(request,env,{fetcher=fetch}={}){
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 diagnostic('received');
 if(!env.SUPABASE_SERVICE_ROLE_KEY||!env.SUPABASE_URL){diagnostic('configuration_missing');return reply({error:'Not configured'},503);}
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL)){diagnostic('invalid_database_host');return reply({error:'Invalid database host'},503);}
 // Best-effort diagnostics; never include private payment data.
 const record=async(stage,reason=null,http_status=null)=>{
  try{
   const response=await fetcher(env.SUPABASE_URL+'/rest/v1/kofi_webhook_events',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({stage,reason,http_status})});
   if(!response.ok)diagnostic('diagnostic_write_failed',{http_status:response.status});
  }catch{diagnostic('diagnostic_write_failed');}
 };

 let raw;try{raw=await request.text();}catch{diagnostic('body_read_failed');await record('invalid_order','body_read_failed',400);return reply({error:'Invalid request'},400);}
 if(raw.length>65536){diagnostic('payload_too_large');await record('invalid_order','payload_too_large',413);return reply({error:'Too large'},413);}
 let payment;try{payment=JSON.parse(new URLSearchParams(raw).get('data')||'');}catch{diagnostic('invalid_payload');await record('invalid_order','invalid_payload',400);return reply({error:'Invalid payload'},400);}
 const token=String(payment.verification_token||'');
 if(!/^[\x21-\x7e]{16,256}$/.test(token)){diagnostic('invalid_token_format');await record('invalid_order','invalid_token_format',401);return reply({error:'Unauthorized'},401);}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 const auth=await fetcher(env.SUPABASE_URL+'/rest/v1/kofi_author_accounts?token_sha256=eq.'+digest+'&select=owner_id&limit=1',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}});
 if(!auth.ok){diagnostic('account_lookup_failed',{http_status:auth.status});await record('invalid_order','account_lookup_failed',auth.status);return reply({error:'Account verification unavailable'},503);}
 const accounts=await auth.json();
 if(accounts.length!==1){diagnostic('account_not_connected');await record('invalid_order','account_not_connected',401);return reply({error:'Unauthorized'},401);}
 const ownerId=accounts[0].owner_id;
 if(payment.type!=='Shop Order'){diagnostic('non_shop_order');await record('invalid_order','non_shop_order',200);return reply({ignored:true});}
 if(!payment.kofi_transaction_id||!payment.email||!Array.isArray(payment.shop_items)){diagnostic('incomplete_order');await record('invalid_order','incomplete_order',400);return reply({error:'Incomplete order'},400);}
 const items=payment.shop_items.map(item=>({product_id:String(item.direct_link_code||''),quantity:Number(item.quantity||1)}));
 if(items.length<1||items.length>20||items.some(item=>!item.product_id||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>20)){diagnostic('invalid_items');await record('invalid_order','invalid_items',422);return reply({error:'Invalid items'},422);}
 const amount=String(payment.amount||'');
 const currency=String(payment.currency||'').toUpperCase();
 if(!/^\d{1,7}(\.\d{1,2})?$/.test(amount)||!['USD','GBP','EUR','CAD','AUD'].includes(currency)){diagnostic('invalid_payment');await record('invalid_order','invalid_payment',422);return reply({error:'Invalid payment'},422);}
 await record('verified_shop_order');
 const res=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/register_kofi_order',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_transaction:String(payment.kofi_transaction_id),p_email:String(payment.email).toLowerCase(),p_items:items,p_currency:currency,p_total:amount,p_owner:ownerId})});
 diagnostic(res.ok?'order_registered':'registration_failed',res.ok?{}:{http_status:res.status});
 await record(res.ok?'order_registered':'registration_failed',res.ok?null:'database_rejected_order',res.status);
 return res.ok?reply({accepted:true}):reply({error:'Could not register verified order'},503);
}

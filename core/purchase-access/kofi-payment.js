import {makePassCode,passCodeHash} from './model.js';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function handleKofiPayment(request,env,{fetcher=fetch}={}){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!env.KOFI_VERIFICATION_TOKEN||!env.SUPABASE_SERVICE_ROLE_KEY||!env.SUPABASE_URL)return json({error:'Not configured'},503);
 const raw=await request.text();
 if(raw.length>65536)return json({error:'Too large'},413);
 let payment;try{const form=new URLSearchParams(raw);payment=JSON.parse(form.get('data')||'');}catch{return json({error:'Invalid payload'},400);}
 if(payment.verification_token!==env.KOFI_VERIFICATION_TOKEN)return json({error:'Unauthorized'},401);
 if(payment.type!=='Shop Order'||payment.is_public===false&&payment.is_subscription_payment)return json({ignored:true});
 if(!payment.kofi_transaction_id||!payment.email||!Array.isArray(payment.shop_items))return json({error:'Incomplete order'},400);
 // Ko-fi product IDs must be explicitly mapped to Alysum pass IDs in the database.
 const endpoint=env.SUPABASE_URL+'/rest/v1/rpc/register_kofi_order';
 const items=payment.shop_items.map(item=>({product_id:String(item.direct_link_code||''),quantity:Number(item.quantity||1)}));
 if(items.some(item=>!item.product_id||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>20))return json({error:'Unmapped product'},422);
 const response=await fetcher(endpoint,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_transaction:String(payment.kofi_transaction_id),p_email:String(payment.email).toLowerCase(),p_items:items})});
 if(!response.ok)return json({error:'Order registration failed'},503);
 // This endpoint records orders only; no access is issued until the outbox is delivered.
 return json({accepted:true});
}

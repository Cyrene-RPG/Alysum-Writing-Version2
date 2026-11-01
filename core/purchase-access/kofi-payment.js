const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function handleKofiPayment(request,env,{fetcher=fetch}={}){
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(!env.KOFI_VERIFICATION_TOKEN||!env.SUPABASE_SERVICE_ROLE_KEY||!env.SUPABASE_URL)return reply({error:'Not configured'},503);
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL))return reply({error:'Invalid database host'},503);
 let raw;try{raw=await request.text();}catch{return reply({error:'Invalid request'},400);}
 if(raw.length>65536)return reply({error:'Too large'},413);
 let payment;try{payment=JSON.parse(new URLSearchParams(raw).get('data')||'');}catch{return reply({error:'Invalid payload'},400);}
 if(payment.verification_token!==env.KOFI_VERIFICATION_TOKEN)return reply({error:'Unauthorized'},401);
 if(payment.type!=='Shop Order')return reply({ignored:true});
 if(!payment.kofi_transaction_id||!payment.email||!Array.isArray(payment.shop_items))return reply({error:'Incomplete order'},400);
 const items=payment.shop_items.map(item=>({product_id:String(item.direct_link_code||''),quantity:Number(item.quantity||1)}));
 if(items.length<1||items.length>20||items.some(item=>!item.product_id||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>20))return reply({error:'Invalid items'},422);
 const amount=String(payment.amount||'');
 const currency=String(payment.currency||'').toUpperCase();
 if(!/^\d{1,7}(\.\d{1,2})?$/.test(amount)||!['USD','GBP','EUR','CAD','AUD'].includes(currency))return reply({error:'Invalid payment'},422);
 const res=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/register_kofi_order',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_transaction:String(payment.kofi_transaction_id),p_email:String(payment.email).toLowerCase(),p_items:items,p_currency:currency,p_total:amount})});
 return res.ok?reply({accepted:true}):reply({error:'Could not register verified order'},503);
}

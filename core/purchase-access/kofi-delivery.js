import {makePassCode,passCodeHash} from './model.js';
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function key(env){
 if(!/^[0-9a-f]{64}$/i.test(env.KOFI_CODE_ENCRYPTION_KEY||''))throw Error('Set a 32-byte hex KOFI_CODE_ENCRYPTION_KEY');
 const bytes=Uint8Array.from(env.KOFI_CODE_ENCRYPTION_KEY.match(/../g),h=>parseInt(h,16));
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
async function encrypt(value,k){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(value)));
 return encode(iv)+'.'+encode(ciphertext);
}
async function decrypt(value,k){
 const [iv,data]=value.split('.');
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},k,decode(data)));
}
export async function deliverKofi(env,{fetcher=fetch}={}){
 if(!env.RESEND_API_KEY||!env.KOFI_FROM_EMAIL||!env.SITE_URL||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Delivery configuration missing');
 const k=await key(env),base=env.SUPABASE_URL+'/rest/v1/rpc/';
 const db=async(name,body)=>{
  const res=await fetcher(base+name,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)throw Error('Database delivery operation failed: '+name);
  return res.json();
 };
 let sent=0;
 for(let i=0;i<20;i++){
  const code=makePassCode();
  const job=await db('claim_kofi_delivery',{p_code_id:crypto.randomUUID(),p_code_hash:await passCodeHash(code),p_ciphertext:await encrypt(code,k)});
  if(!job)break;
  let success=false;
  try{
   const recovered=await decrypt(job.ciphertext,k);
   const email=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':job.id},body:JSON.stringify({from:env.KOFI_FROM_EMAIL,to:[job.email],subject:'Your Alysum Writing purchase code',text:'Your purchase code: '+recovered+'\nSign in to Alysum Writing and redeem it in Purchase Passes: '+new URL('/purchase-passes',env.SITE_URL).href})});
   success=email.ok;
  }finally{
   await db('finish_kofi_delivery',{p_id:job.id,p_success:success});
  }
  if(success)sent++;
 }
 return {sent};
}

import {MOD_SUPABASE_URL,MOD_PUBLISHABLE_KEY} from '../../moderation/config.js';
const cache=new Map();
export async function enforceModerationNetwork(context,{fetchImpl=fetch,now=Date.now}={}){
 const request=context.request,ip=request.headers.get('cf-connecting-ip');
 if(!request.cf||!ip)return context.next();
 // No client-supplied address is accepted; only Cloudflare's trusted request metadata.
 const key=ip,previous=cache.get(key);let blocked=previous&&previous.until>now()?previous.blocked:null;
 if(blocked===null){
 try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1500);
 const result=await fetchImpl(MOD_SUPABASE_URL+'/rest/v1/rpc/mc_network_blocked',{method:'POST',headers:{apikey:MOD_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_address:ip}),signal:controller.signal});clearTimeout(timer);
 if(result.ok){const value=await result.json();if(typeof value==='boolean'){blocked=value;cache.set(key,{blocked,until:now()+5000});if(cache.size>5000)cache.delete(cache.keys().next().value);}}
 }catch{/* A database outage must not take the public site offline. Account sanctions are enforced separately in PostgreSQL. */}
 }
 if(blocked)return new Response('This connection is temporarily restricted. Please try again later.',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
 return context.next();
}

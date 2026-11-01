import {supabase} from '@alysum/authentication/client.js';
/** Account-bound purchase access; checkout and code delivery remain author-managed. */
export async function purchasePassRequest(action,{method='GET',body,query={}}={}){
 const url=new URL('/api/purchase-passes',window.location.origin);url.searchParams.set('action',action);for(const[key,value]of Object.entries(query))url.searchParams.set(key,value);
 const {data}=await supabase.auth.getSession(),token=data.session?.access_token;
 const response=await fetch(url,{method,cache:'no-store',credentials:'same-origin',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 let value;try{value=await response.json();}catch{throw Error('Purchase Pass service could not be reached. Try again.');}
 if(!response.ok){const error=Error(value.error||'Purchase Pass request failed.');error.status=response.status;throw error;}return value;
}

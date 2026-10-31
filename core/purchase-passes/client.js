import {supabase} from '@alysum/authentication/client.js';
/** Only test-pass endpoints; no checkout provider or payment/email calls. */
export async function passTestRequest(action,{method='GET',body,query={}}={}){
 const url=new URL('/api/pass-test',window.location.origin);url.searchParams.set('action',action);for(const[key,value]of Object.entries(query))url.searchParams.set(key,value);
 const {data}=await supabase.auth.getSession(),token=data.session?.access_token;
 const response=await fetch(url,{method,cache:'no-store',credentials:'same-origin',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 let value;try{value=await response.json();}catch{throw Error('Purchase Pass tests could not be reached. Try again.');}
 if(!response.ok){const error=Error(value.error||'Purchase Pass test request failed.');error.status=response.status;throw error;}return value;
}

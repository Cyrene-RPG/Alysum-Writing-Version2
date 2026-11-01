import {supabase} from '../authentication/client.js';
import {authorAccessRequest} from '../publishing/author-access-client.js';
import {paymentRequest} from '../publishing/payments-client.js';
/** Compatibility reads only. Existing sales/grants remain in their original storage. */
export async function loadEarlierPurchases(){
 const results=await Promise.allSettled([authorAccessRequest(supabase,'purchases'),paymentRequest('account-editions',{requireAuth:true})]);
 const books=results[0].status==='fulfilled'?results[0].value.purchases||[]:[];
 const editions=results[1].status==='fulfilled'?(results[1].value.purchased||[]).map(p=>({id:p.id,title:p.title,url:'/applications/library/pages/paid-read?edition='+encodeURIComponent(p.id)})):[];
 // A deployment which never enabled Stripe has no Stripe purchases to load.
 const unavailable=results.some(r=>r.status==='rejected');
 return{purchases:[...books,...editions],unavailable};
}

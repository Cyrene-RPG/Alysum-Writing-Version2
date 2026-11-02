import {deliverKofi} from '../../core/purchase-access/kofi-delivery.js';
export async function onRequestPost({request,env}){
 if(!env.KOFI_DELIVERY_SECRET||request.headers.get('Authorization')!=='Bearer '+env.KOFI_DELIVERY_SECRET)return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json(await deliverKofi(env));}catch{return Response.json({error:'Delivery temporarily unavailable'},{status:503});}
}

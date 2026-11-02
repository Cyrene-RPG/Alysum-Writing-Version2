import {handleKofiPayment} from '../../core/purchase-access/kofi-payment.js';
export const onRequest=({request,env})=>handleKofiPayment(request,env);

import {handleKofiRefund} from '../../core/purchase-access/kofi-refund.js';
export const onRequest=({request,env})=>handleKofiRefund(request,env);

import {handlePurchasePasses} from '../../core/server/http-handlers/purchase-passes.mjs';
export const onRequest=({request,env})=>handlePurchasePasses(request,env);

import {handleKofiAdmin} from '../../core/purchase-access/kofi-admin.js';
export const onRequest=({request,env})=>handleKofiAdmin(request,env);

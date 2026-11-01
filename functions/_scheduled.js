import {deliverKofi} from '../core/purchase-access/kofi-delivery.js';
export async function scheduled(_event,env){await deliverKofi(env);}

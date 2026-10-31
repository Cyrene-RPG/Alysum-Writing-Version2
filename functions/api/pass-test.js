import {handlePassTest} from '../../core/server/http-handlers/pass-test.mjs';
export const onRequest=({request,env})=>handlePassTest(request,env);

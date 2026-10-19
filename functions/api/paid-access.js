import { handlePaidAccess } from '../../core/server/http-handlers/paid-access.mjs';
export const onRequest = ({ request, env }) => handlePaidAccess(request, env);

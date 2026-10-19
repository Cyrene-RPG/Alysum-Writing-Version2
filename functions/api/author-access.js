import { handleAuthorAccess } from '../../core/server/http-handlers/author-access.mjs';
export const onRequest = ({ request, env }) => handleAuthorAccess(request, env);

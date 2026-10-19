import { handleSharedSection } from '../../core/server/http-handlers/shared-section.mjs';
export function onRequest({ request, params }) {
    return handleSharedSection(request, { token: params.token });
}

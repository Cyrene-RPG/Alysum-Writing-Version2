import {enforceModerationNetwork} from '../core/server/http-handlers/moderation-network.mjs';
export const onRequest=context=>enforceModerationNetwork(context);

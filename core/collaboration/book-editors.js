import {supabase} from "@alysum/authentication/client.js";
import {createBookEditorsApi} from "./book-editors-client.js";
export {isBookEditorsSchemaMissing,bookEditorsError,createBookEditorsApi} from "./book-editors-client.js";
import {bookInviteUrl as inviteUrl} from "./book-editors-client.js";
const origin=typeof window!=="undefined"?window.location.origin:"";
export const bookInviteUrl=token=>inviteUrl(token,origin);
const api=createBookEditorsApi(supabase,{origin});
export const listBookCollaborators=api.listBookCollaborators;
export const createBookEditorInvite=api.createBookEditorInvite;
export const acceptBookEditorInvite=api.acceptBookEditorInvite;
export const revokeBookEditor=api.revokeBookEditor;


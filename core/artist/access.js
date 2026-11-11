import { accountHasArtist, normalizeAccountType } from "../account/mode.js";

export function userHasArtistAccess(accountType) {
    return accountHasArtist(normalizeAccountType(accountType));
}

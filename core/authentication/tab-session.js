/** Optional account sessions that belong to one browser tab. */
export const TAB_SESSION_ID_KEY = 'alysum:authentication:tab-session';
export const SEPARATE_ACCOUNT_URL = '/login?separateAccount=1';

export function createTabSessionContext(browser) {
    if (!browser) return { isSeparateTab: false, storage: undefined, id: '' };
    const requested = new URL(browser.location.href).searchParams.get('separateAccount') === '1';
    let id = '';
    let storage;
    try {
        storage = browser.sessionStorage;
        id = storage.getItem(TAB_SESSION_ID_KEY) || '';
        if (requested && !id) {
            id = browser.crypto.randomUUID();
            storage.setItem(TAB_SESSION_ID_KEY, id);
        }
        if (id) {
            // Verify persistence before allowing sign-in. Never fall back to the
            // shared account when tab storage is blocked.
            storage.setItem(TAB_SESSION_ID_KEY, id);
            return { isSeparateTab: true, storage, id };
        }
    } catch (error) {
        throw new Error('Browser session storage is unavailable. Allow site storage and try again.', { cause: error });
    }
    return { isSeparateTab: false, storage: browser.localStorage, id: '' };
}

let currentContext;
export function getTabSessionContext() {
    if (!currentContext) currentContext = createTabSessionContext(typeof window === 'undefined' ? undefined : window);
    return currentContext;
}

export function authStorageOptions(projectRef, context = getTabSessionContext()) {
    const baseKey = `sb-${projectRef}-auth-token`;
    return {
        storage: context.storage,
        // Supabase also uses this key for its auth BroadcastChannel and locks.
        // sessionStorage alone would still let other tabs broadcast their account.
        storageKey: context.isSeparateTab ? `${baseKey}:tab:${context.id}` : baseKey,
    };
}

export function tabSignOutOptions(context = getTabSessionContext()) {
    return context.isSeparateTab ? { scope: 'local' } : undefined;
}

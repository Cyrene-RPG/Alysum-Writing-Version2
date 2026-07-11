/**
 * Boot vault/scratch pages for local or cloud Studio sessions.
 */
import { bindVaultUI, DEFAULT_VAULT_KEY } from "./alysum-vault-ui.js?v=17";
import { requireStudioSession } from "./studio-session.js?v=1";
import { LOCAL_VAULT_STORAGE_KEY } from "./local-studio-store.js?v=1";

export { LOCAL_VAULT_STORAGE_KEY };

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} elements — bindVaultUI tree/find/title/body/newNote/newFolder/deleteItem
 * @param {{ compact?: boolean, nextPath: string, setStatus: (msg: string) => void, onStateChange?: () => void }} opts
 */
export async function bootVaultScratchPage(supabase, elements, opts) {
  const session = await requireStudioSession(supabase, opts.nextPath);
  if (!session) return null;

  if (session.mode === "local") {
    return bindVaultUI(elements, {
      storageKey: LOCAL_VAULT_STORAGE_KEY,
      compact: !!opts.compact,
      setStatus: opts.setStatus,
      onStateChange: opts.onStateChange,
    });
  }

  return bindVaultUI(elements, {
    storageKey: DEFAULT_VAULT_KEY,
    compact: !!opts.compact,
    supabase,
    supabaseUserId: session.user.id,
    setStatus: opts.setStatus,
    onStateChange: opts.onStateChange,
  });
}

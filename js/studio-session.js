/**
 * Shared Studio access: cloud Supabase user or desktop local guest.
 */
import { isDesktopLocalHost, goToLogin } from "./desktop-auth.js?v=1";
import { LOCAL_GUEST_USER, LOCAL_GUEST_USER_ID } from "./local-studio-store.js?v=1";

export { LOCAL_GUEST_USER, LOCAL_GUEST_USER_ID };

export function isLocalStudioUid(uid) {
  return uid === LOCAL_GUEST_USER_ID;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<{ mode: "cloud" | "local" | "none", user: { id: string, email?: string | null } | null }>}
 */
export async function resolveStudioSession(supabase) {
  // Explicit "Host Local" choice wins over a stale persisted Supabase session.
  if (isDesktopLocalHost()) {
    return { mode: "local", user: LOCAL_GUEST_USER };
  }
  const { data } = await supabase.auth.getUser();
  const cloudUser = data?.user;
  if (cloudUser) {
    return { mode: "cloud", user: cloudUser };
  }
  return { mode: "none", user: null };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} [nextPath]
 */
export async function requireStudioSession(supabase, nextPath) {
  const session = await resolveStudioSession(supabase);
  if (session.mode === "none") {
    goToLogin(nextPath);
    return null;
  }
  return session;
}

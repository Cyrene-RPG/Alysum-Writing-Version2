/**
 * Shared Studio access: cloud Supabase user or desktop local guest.
 */
import { isDesktopLocalHost, goToLogin } from "./desktop.js";
import { LOCAL_GUEST_USER, LOCAL_GUEST_USER_ID } from "../sync-engine/local-adapter.js";

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

  // Prefer cached session — getUser() validates with the server and can hang offline.
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData.session?.user;
    if (sessionUser) {
      return { mode: "cloud", user: sessionUser };
    }
  } catch (_) {}

  try {
    const { data } = await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Auth check timed out")), 12_000)
      )
    ]);
    const cloudUser = data?.user;
    if (cloudUser) {
      return { mode: "cloud", user: cloudUser };
    }
  } catch (_) {}

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

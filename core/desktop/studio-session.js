/**
 * Shared Studio access: cloud Supabase user or desktop local guest.
 */
import { isDesktopLocalHost, goToLogin } from "./app.js";
import { LOCAL_GUEST_USER, LOCAL_GUEST_USER_ID } from "../synchronization-engine/local-adapter.js";
import { isProbablyOnline } from "../synchronization-engine/network.js";
import { rememberSessionHint, readSessionHint } from "../authentication/session-hint.js";

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
  // First read after a same-tab navigation can be empty while storage hydrates.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;
      if (sessionUser) {
        rememberSessionHint(sessionUser);
        return { mode: "cloud", user: sessionUser };
      }
    } catch (_) {}
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }

  // Offline: keep working as the last signed-in user (books come from the local
  // draft cache; writes queue and flush on reconnect). Only a user who has never
  // signed in on this device — no hint — gets sent to the login page.
  if (!isProbablyOnline()) {
    const hint = readSessionHint();
    if (hint) {
      return { mode: "cloud", user: { id: hint.id, email: hint.email } };
    }
    return { mode: "none", user: null };
  }

  try {
    const { data } = await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Auth check timed out")), 12_000)
      )
    ]);
    const cloudUser = data?.user;
    if (cloudUser) {
      rememberSessionHint(cloudUser);
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

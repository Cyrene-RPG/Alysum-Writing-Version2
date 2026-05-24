/**
 * Desktop app auth routing — use the in-app sign-in gate, not the website login page.
 */
export const DESKTOP_LOGIN_PATH = "/desktop/home.html";
export const DESKTOP_LOCAL_PATH = "/desktop/local.html";
export const DESKTOP_LOCAL_HOST_KEY = "alysum-desktop-local-host";

export function isAlysumDesktop() {
  return typeof window !== "undefined" && window.AlysumDesktop?.isDesktop === true;
}

export function isDesktopLocalHost() {
  try {
    return localStorage.getItem(DESKTOP_LOCAL_HOST_KEY) === "1";
  } catch {
    return false;
  }
}

export function enableDesktopLocalHost() {
  try {
    localStorage.setItem(DESKTOP_LOCAL_HOST_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearDesktopLocalHost() {
  try {
    localStorage.removeItem(DESKTOP_LOCAL_HOST_KEY);
  } catch {
    /* ignore */
  }
}

/** Login / sign-up gate URL (desktop app vs website). */
export function loginPageUrl(next) {
  if (!isAlysumDesktop()) {
    if (next) return `login.html?next=${encodeURIComponent(next)}`;
    return "login.html";
  }
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  const q = params.toString();
  return q ? `${DESKTOP_LOGIN_PATH}?${q}` : DESKTOP_LOGIN_PATH;
}

export function signupPageUrl() {
  if (!isAlysumDesktop()) return "signup.html";
  return `${DESKTOP_LOGIN_PATH}?tab=signup`;
}

export function goToLogin(next) {
  window.location.href = loginPageUrl(next);
}

export function goToSignup() {
  window.location.href = signupPageUrl();
}

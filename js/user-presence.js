/**
 * Heartbeat to update users.last_seen_at for staff "who's online" views.
 * Throttled client-side; server also rate-limits in touch_user_presence().
 */

import { supabase } from "../firebase.js";

const HEARTBEAT_MS = 2 * 60 * 1000;
let wired = false;
let timer = null;
let lastTouch = 0;

async function touchPresence() {
    const now = Date.now();
    if (now - lastTouch < 60_000) return;
    lastTouch = now;
    try {
        await supabase.rpc("touch_user_presence");
    } catch {
        /* column/RPC may not be migrated yet */
    }
}

function startHeartbeat() {
    if (timer) return;
    void touchPresence();
    timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void touchPresence();
    }, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
}

function stopHeartbeat() {
    if (timer) {
        window.clearInterval(timer);
        timer = null;
    }
    document.removeEventListener("visibilitychange", onVisibility);
    lastTouch = 0;
}

function onVisibility() {
    if (document.visibilityState === "visible") void touchPresence();
}

/** Call once per page after auth is known. */
export function wireUserPresence(session) {
    if (session?.user) {
        startHeartbeat();
    } else {
        stopHeartbeat();
    }
}

/** Subscribe to auth changes and keep presence updated site-wide. */
export function bootUserPresence() {
    if (wired || typeof window === "undefined") return;
    wired = true;
    void supabase.auth.getSession().then(({ data }) => {
        wireUserPresence(data.session ?? null);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
        wireUserPresence(session ?? null);
    });
}

import { getBookSubscription, setBookSubscription } from "../../../core/library/subscriptions.js";

export async function mountBookSubscription({client, work, session, isActive = () => true}) {
    const block = document.getElementById("book-subscription");
    const button = document.getElementById("subscribe-book");
    const status = document.getElementById("subscription-status");
    if (!block || (work.ownerUserId && work.ownerUserId === session?.user?.id) || session?.mode === "local") return;
    block.hidden = false;
    const viewerId = session?.user?.id || "";
    let subscribed = false, busy = true, loaded = false;
    function draw() {
        button.disabled = busy;
        button.textContent = !busy && !loaded ? "Retry subscription" : subscribed ? "Unsubscribe" : "Subscribe";
        button.setAttribute("aria-pressed",String(subscribed));
    }
    button.addEventListener("click",async () => {
        if (busy || !isActive()) return;
        if (!viewerId) {
            window.location.assign("/login?next=" + encodeURIComponent(window.location.pathname + window.location.search));
            return;
        }
        busy = true; draw(); status.textContent = "";
        try {
            // A failed initial read is retried, never treated as an unsubscribed state.
            if (!loaded) {
                subscribed = await getBookSubscription(client,{bookId:work.id,viewerId});
                loaded = true;
            } else {
                subscribed = await setBookSubscription(client,{bookId:work.id,viewerId,subscribed:!subscribed});
            }
            if (!isActive()) return;
            status.textContent = subscribed ? "Subscribed. New chapter alerts appear in your inbox." : "Not subscribed.";
        } catch(error) {
            if (isActive()) status.textContent = error.message || "Could not update your subscription.";
        } finally { busy=false; if(isActive()) draw(); }
    });
    try {
        if (viewerId) subscribed = await getBookSubscription(client,{bookId:work.id,viewerId});
        loaded = true;
        if(isActive()) status.textContent = viewerId ? "" : "Sign in to get new chapter notifications.";
    } catch(error) {
        if(isActive()) status.textContent = error.message;
    } finally { busy=false; if(isActive()) draw(); }
}

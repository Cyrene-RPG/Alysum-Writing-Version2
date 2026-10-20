/** Free, account-backed subscriptions. These grant notifications, never chapter access. */
export async function getBookSubscription(client, { bookId, viewerId }) {
    if (!viewerId) return false;
    const {data,error} = await client.from("book_subscriptions").select("book_id")
        .eq("subscriber_id",viewerId).eq("book_id",String(bookId)).maybeSingle();
    checkSubscriptionError(error);
    return Boolean(data);
}
function checkSubscriptionError(error) {
    if (!error) return;
    if (["42P01","PGRST205","PGRST202"].includes(error.code)) {
        throw new Error("Book subscriptions are not available yet. Please try again later.");
    }
    throw new Error(error.message || "Could not save your subscription. Please try again.");
}
export async function setBookSubscription(client, { bookId, viewerId, subscribed }) {
    if (!viewerId) throw new Error("Sign in to subscribe to a book.");
    if (!bookId || typeof subscribed !== "boolean") throw new Error("Choose a book and subscription state.");
    const {data,error} = await client.rpc("set_book_subscription", {
        p_book_id:String(bookId), p_subscribed:subscribed,
    });
    checkSubscriptionError(error);
    if (data !== subscribed) throw new Error("Could not confirm your subscription. Please try again.");
    return data;
}

/** Optional, server-backed reminders for the author of a manuscript. */
function check(error) {
    if (!error) return;
    if (['PGRST202','42883','42P01'].includes(error.code)) throw Error('Book reminders are not available yet. Please try again later.');
    throw Error(error.message || 'Could not save this book’s reminder. Please try again.');
}
export async function getBookReminder(client, bookId) {
    const {data,error} = await client.rpc('get_book_reminder', {p_book_id:bookId});
    check(error); return data;
}
export async function saveBookReminder(client, bookId, settings) {
    const {data,error} = await client.rpc('save_book_reminder', {
        p_book_id:bookId,p_enabled:settings.enabled,p_goal:settings.goal,p_cadence:settings.cadence,
        p_every_days:Number(settings.everyDays),p_timezone:settings.timezone,
        p_first_due_local:settings.firstDueLocal,p_popup_enabled:settings.popupEnabled,
    });
    check(error);
    if (!data) throw Error('Could not confirm this reminder was saved. Please try again.');
    return data;
}
export function defaultBookReminder(now = new Date()) {
    const first = new Date(now); first.setDate(first.getDate()+7); first.setHours(18,0,0,0);
    const pad = n => String(n).padStart(2,'0');
    return {enabled:false,goal:'update',cadence:'weekly',everyDays:7,
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',popupEnabled:true,
        firstDueLocal:`${first.getFullYear()}-${pad(first.getMonth()+1)}-${pad(first.getDate())}T18:00`};
}

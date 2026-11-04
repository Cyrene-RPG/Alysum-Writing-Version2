/** Writing-session break reminder copy and interval choices. */
export const BREAK_REMINDER_HOURS = Object.freeze([1, 2, 3]);
export const BREAK_REMINDER_STORAGE_KEY = 'alysum:editor:break-reminder';

export function hoursLabel(hours) {
    const count = Number(hours);
    return count === 1 ? '1 hour' : `${count} hours`;
}

export function writerGreetingName(raw) {
    const name = String(raw || '').trim();
    if (!name || name.includes('@') || name.length < 2) return 'writer';
    const lowered = name.toLowerCase();
    if (lowered === 'guest' || lowered === 'reader') return 'writer';
    return name.split(/\s+/)[0];
}

export function breakReminderMessage(name, hours) {
    return `Hey ${writerGreetingName(name)}, it's been ${hoursLabel(hours)}. Don't forget to get up, stretch, take a break, eat something and rehydrate.`;
}

export function storageKeyForBook(bookId) {
    const id = String(bookId || '').trim();
    return id ? `${BREAK_REMINDER_STORAGE_KEY}:${id}` : BREAK_REMINDER_STORAGE_KEY;
}

export function readBreakReminder(raw) {
    const value = raw && typeof raw === 'object' ? raw : null;
    const hours = Number(value?.hours);
    if (!BREAK_REMINDER_HOURS.includes(hours)) {
        return value?.enabled === false ? { enabled: false } : null;
    }
    const startedAt = Number(value?.startedAt);
    return {
        enabled: value?.enabled !== false,
        hours,
        startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0,
    };
}

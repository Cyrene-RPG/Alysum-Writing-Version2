import {
    BREAK_REMINDER_HOURS,
    breakReminderMessage,
    hoursLabel,
    readBreakReminder,
    storageKeyForBook,
} from '/core/account/break-reminders.js';

export function mountBreakReminders({
    bookId,
    getWriterName = () => '',
    storage,
    now = () => Date.now(),
    hourMs = 60 * 60 * 1000,
    promptDelayMs = 400,
    root = document,
} = {}) {
    const store = storage || root.defaultView?.sessionStorage;
    const key = storageKeyForBook(bookId);
    if (!store || !key || root.getElementById('breakReminderOverlay')) return { destroy() {} };

    const overlay = root.createElement('div');
    overlay.className = 'confirm-overlay break-reminder-overlay';
    overlay.id = 'breakReminderOverlay';
    overlay.hidden = true;
    const card = root.createElement('div');
    card.className = 'confirm-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'breakReminderTitle');
    card.setAttribute('aria-describedby', 'breakReminderText');
    const title = root.createElement('h2');
    title.className = 'confirm-title';
    title.id = 'breakReminderTitle';
    const text = root.createElement('p');
    text.className = 'confirm-text';
    text.id = 'breakReminderText';
    const actions = root.createElement('div');
    actions.className = 'confirm-actions';
    card.append(title, text, actions);
    overlay.append(card);
    root.body.append(overlay);

    let timer = 0;
    let promptTimer = 0;
    let view = '';

    function write(value) {
        try { store.setItem(key, JSON.stringify(value)); } catch { /* ignore quota */ }
    }
    function read() {
        try { return readBreakReminder(JSON.parse(store.getItem(key) || 'null')); } catch { return null; }
    }
    function close() {
        overlay.hidden = true;
        view = '';
        actions.replaceChildren();
    }
    function open(nextView, heading, body, buttons) {
        view = nextView;
        title.textContent = heading;
        text.textContent = body;
        actions.classList.toggle('break-reminder-intervals', nextView === 'interval');
        actions.replaceChildren(...buttons);
        overlay.hidden = false;
        buttons[0]?.focus();
    }
    function button(label, className, onClick) {
        const node = root.createElement('button');
        node.type = 'button';
        node.className = className;
        node.textContent = label;
        node.addEventListener('click', onClick);
        return node;
    }
    function otherDialogOpen() {
        const confirm = root.getElementById('confirmOverlay');
        return Boolean(confirm && !confirm.hidden);
    }
    function clearTimer() {
        root.defaultView?.clearTimeout(timer);
        timer = 0;
    }
    function schedule(choice) {
        clearTimer();
        if (!choice?.enabled || !choice.startedAt) return;
        const wait = Math.max(0, choice.startedAt + choice.hours * hourMs - now());
        timer = root.defaultView?.setTimeout(showDue, wait) || 0;
    }
    function enable(hours) {
        const choice = { enabled: true, hours, startedAt: now() };
        write(choice);
        close();
        schedule(choice);
    }
    function decline() {
        write({ enabled: false });
        close();
    }
    function showPrompt() {
        if (read() || !overlay.hidden || otherDialogOpen()) return;
        open('prompt', 'Would you like to set break reminders?', 'Yes sets a gentle check-in while you write. No leaves this session quiet.', [
            button('Yes', 'confirm-yes', showIntervals),
            button('No', 'confirm-no', decline),
        ]);
    }
    function showIntervals() {
        open('interval', 'How often should we check in?', 'We’ll remind you to stand up after this much writing time.', BREAK_REMINDER_HOURS.map((hours) => (
            button(hoursLabel(hours), 'confirm-yes break-reminder-interval', () => enable(hours))
        )));
    }
    function resumeAfterBreak() {
        const choice = read();
        if (!choice?.enabled) { close(); return; }
        const next = { ...choice, startedAt: now() };
        write(next);
        close();
        schedule(next);
    }
    function showDue() {
        const choice = read();
        if (!choice?.enabled || (!overlay.hidden && view === 'due')) return;
        if (otherDialogOpen()) {
            timer = root.defaultView?.setTimeout(showDue, 1000) || 0;
            return;
        }
        open('due', 'Time for a break', breakReminderMessage(getWriterName(), choice.hours), [
            button('Got it', 'confirm-yes', resumeAfterBreak),
        ]);
    }

    overlay.addEventListener('click', (event) => {
        if (event.target !== overlay) return;
        if (view === 'due') resumeAfterBreak();
        else decline();
    });
    function onKey(event) {
        if (overlay.hidden || event.key !== 'Escape') return;
        event.preventDefault();
        if (view === 'due') resumeAfterBreak();
        else decline();
    }
    function onVisibility() {
        if (root.hidden) return;
        const choice = read();
        if (choice?.enabled && choice.startedAt && now() >= choice.startedAt + choice.hours * hourMs) showDue();
    }
    root.addEventListener('keydown', onKey);
    root.addEventListener('visibilitychange', onVisibility);

    const existing = read();
    if (existing?.enabled) schedule(existing);
    else if (!existing) {
        promptTimer = root.defaultView?.setTimeout(showPrompt, promptDelayMs) || 0;
    }

    return {
        destroy() {
            clearTimer();
            root.defaultView?.clearTimeout(promptTimer);
            root.removeEventListener('keydown', onKey);
            root.removeEventListener('visibilitychange', onVisibility);
            overlay.remove();
        },
    };
}

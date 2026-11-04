import { mountBreakReminders } from '../page-ui/break-reminders.js';

const storage = window.sessionStorage;
storage.removeItem('alysum:editor:break-reminder:preview-book');
mountBreakReminders({
    bookId: 'preview-book',
    getWriterName: () => 'Lewstar',
    storage,
    hourMs: 4000,
    promptDelayMs: 200,
});

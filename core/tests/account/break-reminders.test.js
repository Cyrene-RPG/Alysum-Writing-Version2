import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BREAK_REMINDER_HOURS,
    breakReminderMessage,
    breakReminderRemainingMs,
    breakReminderStatusLabel,
    hoursLabel,
    readBreakReminder,
    remainingLabel,
    storageKeyForBook,
    writerGreetingName,
} from '../../account/break-reminders.js';

test('interval labels and greeting names stay human', () => {
    assert.deepEqual([...BREAK_REMINDER_HOURS], [1, 2, 3]);
    assert.equal(hoursLabel(1), '1 hour');
    assert.equal(hoursLabel(2), '2 hours');
    assert.equal(writerGreetingName('Jane Doe'), 'Jane');
    assert.equal(writerGreetingName('writer@example.com'), 'writer');
    assert.equal(writerGreetingName('A'), 'writer');
    assert.equal(writerGreetingName(''), 'writer');
});

test('the stretch copy names the writer and the chosen wait', () => {
    assert.equal(
        breakReminderMessage('Lewstar', 1),
        "Hey Lewstar, it's been 1 hour. Don't forget to get up, stretch, take a break, eat something and rehydrate.",
    );
    assert.match(breakReminderMessage('Cyrene RPG', 3), /^Hey Cyrene, it's been 3 hours\./);
});

test('stored choices are account-book scoped and reject unknown hours', () => {
    assert.equal(storageKeyForBook('book-1'), 'alysum:editor:break-reminder:book-1');
    assert.deepEqual(readBreakReminder({ enabled: true, hours: 2, startedAt: 50 }), { enabled: true, hours: 2, startedAt: 50 });
    assert.deepEqual(readBreakReminder({ enabled: false }), { enabled: false });
    assert.equal(readBreakReminder({ enabled: true, hours: 9, startedAt: 1 }), null);
});

test('remaining time labels count down without exposing storage', () => {
    const hour = 60 * 60 * 1000;
    const choice = { enabled: true, hours: 2, startedAt: 1_000 };
    assert.equal(breakReminderRemainingMs(choice, 1_000, hour), 2 * hour);
    assert.equal(remainingLabel(0), 'Break now');
    assert.equal(remainingLabel(hour), 'Break in 1h');
    assert.equal(remainingLabel(hour + 60 * 1000), 'Break in 1h 1m');
    assert.equal(remainingLabel(2 * hour), 'Break in 2h');
    assert.equal(remainingLabel(45 * 1000), 'Break in 1m');
    assert.equal(breakReminderStatusLabel({ enabled: false }, 1_000), 'Break reminders');
    assert.equal(breakReminderStatusLabel(choice, 1_000, hour), 'Break in 2h');
    assert.equal(breakReminderStatusLabel(choice, 1_000 + hour + 18 * 60 * 1000, hour), 'Break in 42m');
});

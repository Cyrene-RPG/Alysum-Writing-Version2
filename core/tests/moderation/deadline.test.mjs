import test from 'node:test';
import assert from 'node:assert/strict';
import {officialBookDeadlineCallout,bookDeadlineStaffNote,bookDeadlineRecipientNote} from '../../../applications/moderation/page-ui/deadline.js';
import {officialTemplates,leftoverFillIns} from '../../../applications/moderation/page-ui/templates.js';

test('staff official-message copy says a missed book deadline leaves Studio in place',()=>{
 assert.match(officialBookDeadlineCallout(),/unpublished from the Library/);
 assert.match(officialBookDeadlineCallout(),/remains in Studio/);
});

test('staff see the library unpublish warning on open book threads with a date',()=>{
 assert.equal(bookDeadlineStaffNote({id:'t1'}), '');
 assert.match(bookDeadlineStaffNote({book_id:'book-1',deadline:'2026-11-10'}),/unpublished from the Library/);
 assert.equal(bookDeadlineStaffNote({book_id:'book-1',deadline:'2026-11-10',resolved_at:'2026-11-03T22:50:00.000Z'}), '');
});

test('recipients are warned only on open book conversations with a response date',()=>{
 assert.equal(bookDeadlineRecipientNote({}), '');
 assert.equal(bookDeadlineRecipientNote({bookId:'book-1'}), '');
 assert.equal(bookDeadlineRecipientNote({deadline:'2026-11-10'}), '');
 assert.match(bookDeadlineRecipientNote({bookId:'book-1',deadline:'2026-11-10'}),/unpublished from the Library/);
 assert.match(bookDeadlineRecipientNote({book_id:'book-1',deadline:'2026-11-10'}),/Studio copy stays/);
 assert.equal(bookDeadlineRecipientNote({bookId:'book-1',deadline:'2026-11-10',resolvedAt:'2026-11-03T22:50:00.000Z'}), '');
});

test('cover template asks for a specific fill-in before send',()=>{
 assert.deepEqual(leftoverFillIns(officialTemplates.cover[1]),['[Explain the specific concern.]']);
 assert.equal(officialTemplates.cover[0],'Please update your book cover');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {officialTemplates,leftoverFillIns,leftoverFillInMessage,officialTemplateHint} from '../../../applications/moderation/page-ui/templates.js';

test('Book under review has no fill-in notes and is ready to send',()=>{
 assert.deepEqual(leftoverFillIns(officialTemplates.review[1]),[]);
 assert.equal(leftoverFillInMessage(officialTemplates.review[1]),'');
 assert.equal(officialTemplateHint(officialTemplates.review[1]),'This template is ready to send.');
});

test('other official templates name leftover [bracketed] fill-in notes',()=>{
 assert.deepEqual(leftoverFillIns(officialTemplates.tags[1]),['[chapter / content]']);
 assert.match(leftoverFillInMessage(officialTemplates.rating[1]),/\[Explain the specific concern\.\]/);
 assert.match(leftoverFillInMessage(officialTemplates.warning[1]),/\[specific behavior\].*\[site rule\].*\[requested action\]/);
 assert.match(leftoverFillInMessage(officialTemplates.outcome[1]),/\[Explain the finding/);
 assert.equal(leftoverFillInMessage('We’re reviewing your book following a reader concern.'), '');
 assert.equal(officialTemplateHint(''), 'Write the message the user should receive.');
});

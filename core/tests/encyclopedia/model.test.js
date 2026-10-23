import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultEntryTypes, validateTemplate, validateEntry, extractWikiLinks, searchEntries, canEdit, stripStoryBibleMetadata } from '../../encyclopedia/model.js';
import { createStoryBibleApi } from '../../synchronization-engine/story-bible.js';
test('template label changes preserve IDs; duplicates are rejected', () => {
    const template = defaultEntryTypes()[0], original = template.fields[0].id;
    template.fields[0].label = 'Preferred pronouns'; assert.equal(validateTemplate(template).fields[0].id, original);
    template.fields.push({ ...template.fields[0] }); assert.throws(() => validateTemplate(template), /unique permanent ID/);
});
test('permanent wiki links and entry references are extracted once, regardless of display name', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    assert.deepEqual(extractWikiLinks({ overview: `[[${id}|Old Name]] and [[${id}|New Name]]` }, { home: id }, [{ id: 'home', type: 'reference' }]), [id]);
});
test('search includes aliases, tags, facts and biographies without losing archived entries', () => {
    const entries = [{ title: 'Mara', aliases: ['Tidekeeper'], tags: ['North'], fields: { job: 'Cartographer' }, sections: { history: 'Winter voyage' }, typeId: 'character', archivedAt: null }, { title: 'Elian', archivedAt: '2026-01-01', fields: {}, sections: {} }];
    assert.equal(searchEntries(entries, 'tidekeeper cartographer winter').length, 1);
    assert.equal(searchEntries(entries, '', '', false).length, 1); assert.equal(searchEntries(entries, '', '', true).length, 2);
});
test('entry validation preserves unknown custom fields while trimming names', () => {
    const original = { title: ' Mara ', aliases: ['M', 'M'], tags: [], fields: { removedField: 'Keep me' }, sections: {} };
    const clean = validateEntry(original); assert.equal(clean.title, 'Mara'); assert.deepEqual(clean.aliases, ['M']); assert.equal(clean.fields.removedField, 'Keep me'); assert.equal(original.title, ' Mara ');
    assert.throws(() => validateEntry({ title: '' }), /Name the entry/); assert.equal(canEdit('viewer'), false);
});
test('adapter maps SQL rows and snapshots, preserving user JSON keys', async () => {
    let sent;
    const row = { id: 'entry', bible_id: 'bible', type_id: 'type', revision: 3, fields: { birth_place: 'Do not rename' }, sections: {} };
    const client = { rpc: async (name, args) => { sent = { name, args }; return { data: row }; }, from: () => ({ select: () => ({ eq() { return this; }, then(resolve) { return Promise.resolve({ data: [{ entry_id: 'entry', snapshot: row }] }).then(resolve); } }) }) };
    const api = createStoryBibleApi(client);
    const saved = await api.saveEntry({ bibleId: 'bible', typeId: 'type', title: 'Mara', fields: row.fields, sections: {} }, { fields: [] });
    assert.equal(saved.bibleId, 'bible'); assert.equal(saved.fields.birth_place, 'Do not rename'); assert.equal(sent.args.p_data.type_id, 'type');
    const versions = await api.listVersions('bible', 'entry'); assert.equal(versions[0].snapshot.typeId, 'type'); assert.equal(versions[0].snapshot.fields.birth_place, 'Do not rename');
});

test('public/export copies remove reference IDs and preserve prose, italics and spacing', () => {
    const html = '<p><em>Hello <span data-story-bible-entry="private-id">Mara</span></em>!</p>';
    assert.equal(stripStoryBibleMetadata('The attribute data-story-bible-entry="example" is a detail.'), 'The attribute data-story-bible-entry="example" is a detail.');
    assert.equal(stripStoryBibleMetadata(html), '<p><em>Hello <span>Mara</span></em>!</p>');
});

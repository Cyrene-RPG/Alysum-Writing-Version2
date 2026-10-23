import { defaultEntryTypes, extractWikiLinks, validateEntry, validateTemplate } from './model.js';
/** Explicit preview only: isolated memory, no auth, cloud calls, or persistent writes. */
export function createPreviewApi() {
    const bible = { id: '00000000-0000-4000-8000-000000000001', title: 'The Saltwater Crown — Story Bible', role: 'owner' };
    const types = defaultEntryTypes().map((type, index) => ({ ...type, id: `00000000-0000-4000-8000-00000000001${index}`, bibleId: bible.id, revision: 1 }));
    const mara = '00000000-0000-4000-8000-000000000101', elian = '00000000-0000-4000-8000-000000000102', harbor = '00000000-0000-4000-8000-000000000103', guild = '00000000-0000-4000-8000-000000000104';
    const state = { types, entries: [
        { id: mara, bibleId: bible.id, typeId: types[0].id, title: 'Mara Vey', aliases: ['The Tidekeeper'], tags: ['Protagonist', 'Northhaven'], fields: { pronouns: 'she / her', age: 'Twenty-seven', occupation: 'Cartographer', affiliation: guild, home: harbor, role: 'Protagonist', status: 'Missing, presumed at sea' }, sections: { 'character-0': `A mapmaker who can remember coastlines that no longer exist. Mara returns to [[${harbor}|Northhaven]] carrying a chart that should have burned thirty years ago.`, 'character-2': 'Observant, stubborn, and quietly funny. She notices what people leave out of their stories.', 'character-3': 'Raised in the lighthouse above the old harbor. Her mother disappeared during the last winter tide.', 'character-4': 'Find the island erased from every official map. Keep her younger brother out of the Guild’s reach.', 'character-6': 'From collecting other people’s truths to trusting her own.' }, revision: 1, archivedAt: null },
        { id: elian, bibleId: bible.id, typeId: types[0].id, title: 'Elian Vey', aliases: [], tags: ['Supporting cast'], fields: { pronouns: 'he / him', age: 'Nineteen', occupation: 'Apprentice shipwright' }, sections: { 'character-0': 'Mara’s younger brother. Better at building boats than staying out of trouble.' }, revision: 1, archivedAt: null },
        { id: harbor, bibleId: bible.id, typeId: types[1].id, title: 'Northhaven', aliases: ['The Old Harbor'], tags: ['Coastal city'], fields: { region: 'The Shattered Coast', population: 'About twelve thousand' }, sections: { 'location-0': 'A city built around a lighthouse older than its oldest stories.', 'location-1': 'Black cliffs, narrow streets, and a harbor that empties completely at the winter tide.' }, revision: 1, archivedAt: null },
        { id: guild, bibleId: bible.id, typeId: types[2].id, title: 'Harbor Guild', aliases: [], tags: ['Political power'], fields: { headquarters: harbor }, sections: { 'faction-0': 'Controls the charts, the shipping lanes, and most of the city’s secrets.' }, revision: 1, archivedAt: null },
    ], connections: [ { id: crypto.randomUUID(), sourceId: mara, targetId: elian, kind: 'relationship', label: 'older sister of', reverseLabel: 'younger brother of' }, { id: crypto.randomUUID(), sourceId: mara, targetId: harbor, kind: 'reference' } ], facts: [{ id: crypto.randomUUID(), entryId: mara, category: 'History', value: 'Her mother disappeared during the last winter tide.' }], mentions: [], members: [] };
    const versions = [], portraits = new Map(); const copy = value => structuredClone(value);
    return {
        async openBook() { return copy(bible); }, async load() { return copy(state); },
        async saveEntry(entry, template) {
            validateEntry(entry); const index = state.entries.findIndex(item => item.id === entry.id);
            if (index >= 0 && state.entries[index].revision !== entry.revision) throw new Error('BIBLE_CONFLICT');
            if (index >= 0) versions.push({ id: crypto.randomUUID(), entryId: entry.id, revision: entry.revision, snapshot: copy(state.entries[index]), createdAt: new Date().toISOString() });
            const saved = { ...copy(entry), id: entry.id || crypto.randomUUID(), revision: (entry.revision || 0) + 1, updatedAt: new Date().toISOString() };
            if (index < 0) state.entries.push(saved); else state.entries[index] = saved;
            state.connections = state.connections.filter(item => item.sourceId !== saved.id || item.kind !== 'reference');
            state.connections.push(...extractWikiLinks(saved.sections, saved.fields, [...(template?.fields || []), ...(saved.customFields || [])]).map(targetId => ({ id: crypto.randomUUID(), sourceId: saved.id, targetId, kind: 'reference' })));
            return copy(saved);
        },
        async saveType(_bibleId, template) { validateTemplate(template); const saved = { ...copy(template), id: template.id || crypto.randomUUID(), revision: (template.revision || 0) + 1 }; const index = state.types.findIndex(type => type.id === saved.id); if (index < 0) state.types.push(saved); else state.types[index] = saved; return copy(saved); },
        async connect(_bibleId, sourceId, targetId, label, reverseLabel) { state.connections.push({ id: crypto.randomUUID(), sourceId, targetId, kind: 'relationship', label, reverseLabel }); },
        async removeConnection(_bibleId, id) { state.connections = state.connections.filter(item => item.id !== id); },
        async addFact(_bibleId, entryId, fact) { state.facts.push({ ...fact, id: crypto.randomUUID(), entryId }); },
        async listVersions(_bibleId, entryId) { return copy(versions.filter(version => version.entryId === entryId)); },
        async setMember() { throw new Error('Access changes are unavailable in this temporary preview.'); },
        async uploadPortrait(_bibleId, file) { const path = crypto.randomUUID(); portraits.set(path, URL.createObjectURL(file)); return path; }, async portraitUrl(path) { return portraits.get(path) || ''; },
    };
}

/** New Story Bible domain. Independent of the legacy Encyclopedia blob store. */
export const FIELD_TYPES = Object.freeze(['text', 'long-text', 'number', 'checkbox', 'choice', 'multiple-choice', 'date', 'reference']);
const field = (id, label, type = 'text') => ({ id, label, type });
export function defaultEntryTypes() {
    return [
        { name: 'Character', fields: [field('pronouns', 'Pronouns'), field('age', 'Age'), field('occupation', 'Occupation'), field('affiliation', 'Affiliation', 'reference'), field('home', 'Home', 'reference'), field('role', 'Story role'), field('status', 'Status')], sections: ['Overview', 'Appearance', 'Personality', 'Backstory', 'Goals and motivations', 'Conflicts and fears', 'Character arc', 'Notes'].map((label, i) => ({ id: `character-${i}`, label })) },
        { name: 'Location', fields: [field('region', 'Region'), field('ruler', 'Ruler', 'reference'), field('population', 'Population')], sections: ['Overview', 'Geography', 'History', 'Culture'].map((label, i) => ({ id: `location-${i}`, label })) },
        { name: 'Faction', fields: [field('leader', 'Leader', 'reference'), field('headquarters', 'Headquarters', 'reference')], sections: ['Overview', 'Goals', 'History', 'Membership'].map((label, i) => ({ id: `faction-${i}`, label })) },
        { name: 'Item', fields: [field('owner', 'Owner', 'reference')], sections: [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'History' }] },
    ];
}
export function validateTemplate(template) {
    if (!String(template.name || '').trim() || template.name.length > 80) throw new Error('Name the category using 1–80 characters.');
    for (const [key, maximum] of [['fields', 60], ['sections', 30]]) {
        if (!Array.isArray(template[key]) || template[key].length > maximum) throw new Error(`Too many ${key}.`);
        const ids = new Set();
        for (const item of template[key]) {
            if (!/^[\w-]{1,80}$/.test(item.id || '') || ids.has(item.id)) throw new Error(`Each ${key} item needs a unique permanent ID.`);
            ids.add(item.id);
            if (!String(item.label || '').trim() || item.label.length > 100) throw new Error('Each field and section needs a short label.');
            if (key === 'fields' && !FIELD_TYPES.includes(item.type)) throw new Error('Choose a supported field type.');
            if (['choice', 'multiple-choice'].includes(item.type) && (!Array.isArray(item.options) || item.options.length > 100)) throw new Error('Choices need an options list.');
        }
    }
    return structuredClone(template);
}
export function validateEntry(entry) {
    const result = structuredClone(entry);
    if (result.customFields) validateTemplate({ name: 'Custom fields', fields: result.customFields, sections: [] });
    result.title = String(result.title || '').trim();
    if (!result.title || result.title.length > 200) throw new Error('Name the entry using 1–200 characters.');
    result.aliases = [...new Set((result.aliases || []).map(String).map(s => s.trim()).filter(Boolean))];
    result.tags = [...new Set((result.tags || []).map(String).map(s => s.trim()).filter(Boolean))];
    if (result.aliases.length > 30 || result.tags.length > 30) throw new Error('Use at most 30 aliases and tags.');
    if (JSON.stringify(result).length > 400000) throw new Error('This profile is too large. Split some material into another entry.');
    return result;
}
export function extractWikiLinks(sections = {}, fields = {}, definitions = []) {
    const links = new Set();
    for (const text of Object.values(sections)) {
        for (const match of String(text).matchAll(/\[\[([a-f\d-]{36})(?:\|[^\]\n]*)?\]\]/gi)) links.add(match[1].toLowerCase());
    }
    for (const definition of definitions) if (definition.type === 'reference' && fields[definition.id]) links.add(String(fields[definition.id]));
    return [...links];
}
export function searchEntries(entries, query = '', typeId = '', includeArchived = false) {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return entries.filter(entry => (includeArchived || !entry.archivedAt) && (!typeId || entry.typeId === typeId) && words.every(word => [entry.title, ...(entry.aliases || []), ...(entry.tags || []), ...Object.values(entry.fields || {}), ...Object.values(entry.sections || {})].join(' ').toLocaleLowerCase().includes(word)))
        .sort((a, b) => a.title.localeCompare(b.title));
}
export function canEdit(role) { return role === 'owner' || role === 'editor'; }
export function describeError(error) {
    const message = String(error?.message || error || 'Could not complete this action.');
    if (/BIBLE_CONFLICT/.test(message)) return 'This profile changed on another device. Your text is preserved. Reload the saved version or copy your changes before retrying.';
    if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) return 'Story Bible setup is not deployed yet. The new database migration must be installed.';
    return message;
}
/** Remove private reference metadata at publication/export boundaries, preserving prose/formatting. */
export function stripStoryBibleMetadata(html) {
    return String(html || '').replace(/<a\b(?=[^>]*\bhref\s*=\s*["']#story-bible-entry-[a-f\d-]{36}["'])[^>]*>([\s\S]*?)<\/a>/gi, '$1').replace(/<[^>]+>/g, tag => tag.replace(/\sdata-story-bible-entry\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''));
}

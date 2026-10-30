import { bindTagPicker } from './tag-picker.js';
import { genreLabel, matchingGenreKeys } from '/core/publishing/genres.js';
import { FANDOM_NAMES } from '/core/publishing/fandoms.js';
import { FICTION_SUGGESTIONS } from '/core/publishing/fiction-suggestions.js';
import { readWorkTags, THEME_TAGS } from '/core/publishing/work-tags.js';

export function bindPublishingFields(doc, draft, onChange = () => {}) {
    let workType = readWorkTags(draft).workType;
    const pickers = {};
    function fictionSuggestions(key) {
        const fandoms = pickers.fandoms?.read() || [];
        return [...(draft[key] || []), ...fandoms.flatMap(fandom => {
            const match = Object.keys(FICTION_SUGGESTIONS).find(name => name.toLocaleLowerCase() === fandom.toLocaleLowerCase());
            return FICTION_SUGGESTIONS[match]?.[key] || [];
        })];
    }
    for (const [key, id, label, suggestions] of [
        ['fandoms', 'fandom', 'Fandoms', FANDOM_NAMES],
        ['characters', 'character', 'Characters', () => fictionSuggestions('characters')],
        ['relationships', 'relationship', 'Relationships', () => fictionSuggestions('relationships')],
        ['tags', 'theme', 'Tags', THEME_TAGS],
    ]) {
        pickers[key] = bindTagPicker(doc.getElementById(`${id}Picker`), { id: `${id}Search`, label,
            initial: draft[key] || [], suggestions, onChange });
    }
    const genreKeys = new Map(matchingGenreKeys('').map(key => [genreLabel(key), key]));
    const genres = bindTagPicker(doc.getElementById('genrePicker'), { id: 'genreSearch', label: 'Genres',
        initial: draft.genres.map(genreLabel), allowCustom: false, limit: 3,
        suggestions: query => matchingGenreKeys(query).map(genreLabel), onChange });
    function updateType() {
        doc.querySelectorAll('[data-fanfiction]').forEach(node => { node.hidden = workType !== 'fanfiction'; });
        doc.querySelectorAll('[name=workType]').forEach(input => { input.checked = input.value === workType; });
    }
    doc.querySelectorAll('[name=workType]').forEach(input => input.addEventListener('change', () => {
        workType = input.value; Object.values(pickers).forEach(picker => picker.close()); updateType(); onChange();
    }));
    updateType();
    // Suggestions follow selected fandoms; authors can always supply their own.
    for (const key of ['characters', 'relationships']) pickers[key].input.placeholder += ' or type your own';
    return { read(commitPending = false) {
        const selectedGenres = genres.read().map(label => genreKeys.get(label)).filter(Boolean);
        return { workType, fandoms: pickers.fandoms.read(commitPending), characters: pickers.characters.read(commitPending),
            relationships: pickers.relationships.read(commitPending), tags: pickers.tags.read(commitPending),
            genres: selectedGenres, genre: selectedGenres[0] || '' };
    } };
}

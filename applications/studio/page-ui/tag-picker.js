/** Small multi-select combobox. Values are rendered only as text, never HTML. */
export function bindTagPicker(root, { id, label, initial = [], suggestions = [], allowCustom = true,
    limit = 100, onChange = () => {} }) {
    const doc = root.ownerDocument;
    let selected = [...new Map(initial.map(item => [String(item).toLocaleLowerCase(), String(item)])).values()];
    let matches = [], active = -1, opened = false;
    root.classList.add('pub-tag-picker');
    const chips = doc.createElement('div'); chips.className = 'pub-tag-chips';
    const input = doc.createElement('input'); input.type = 'search'; input.id = id;
    input.placeholder = `Search ${label.toLowerCase()}…`; input.autocomplete = 'off'; input.maxLength = 250;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', `${id}Results`);
    const menu = doc.createElement('div'); menu.id = `${id}Results`; menu.className = 'pub-tag-results';
    menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', `${label} suggestions`); menu.hidden = true;
    const status = doc.createElement('span'); status.className = 'pub-tag-status'; status.setAttribute('role', 'status');
    root.replaceChildren(chips, input, menu, status);
    function close() { opened = false; menu.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    function paintChips() {
        chips.replaceChildren();
        for (const value of selected) {
            const button = doc.createElement('button'); button.type = 'button'; button.textContent = `${value} ×`;
            button.setAttribute('aria-label', `Remove ${value}`);
            button.addEventListener('click', () => { selected = selected.filter(item => item !== value); paintChips(); onChange([...selected]); input.focus(); paintResults(); });
            chips.append(button);
        }
    }
    function values() { return typeof suggestions === 'function' ? suggestions(input.value) : suggestions; }
    function paintResults() {
        const query = input.value.trim().toLocaleLowerCase();
        const choices = [...new Set(values())].filter(value => !selected.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase()));
        choices.sort((a, b) => Number(!a.toLocaleLowerCase().startsWith(query)) - Number(!b.toLocaleLowerCase().startsWith(query)) || a.localeCompare(b));
        matches = choices.filter(value => !query || value.toLocaleLowerCase().includes(query)).slice(0, 8).map(value => ({ value }));
        if (allowCustom && query && !selected.some(value => value.toLocaleLowerCase() === query) && !choices.some(value => value.toLocaleLowerCase() === query)) matches.push({ value: input.value.trim(), custom: true });
        active = -1; input.removeAttribute('aria-activedescendant'); menu.replaceChildren();
        for (const [index, item] of matches.entries()) {
            const option = doc.createElement('div'); option.id = `${id}Option${index}`; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
            option.textContent = item.custom ? `Add “${item.value}”` : item.value;
            option.addEventListener('mousedown', event => event.preventDefault());
            option.addEventListener('click', () => add(item.value)); menu.append(option);
        }
        if (!matches.length) { const empty = doc.createElement('p'); empty.textContent = selected.length >= limit ? `Choose up to ${limit}.` : 'No matching tags.'; menu.append(empty); }
        opened = true; menu.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    function add(value, focus = true) {
        const clean = String(value).trim().slice(0, 250);
        if (!clean) return;
        if (selected.length >= limit) { status.textContent = `Choose up to ${limit} ${label.toLowerCase()}.`; return; }
        if (!selected.some(item => item.toLocaleLowerCase() === clean.toLocaleLowerCase())) { selected.push(clean); paintChips(); onChange([...selected]); }
        input.value = ''; status.textContent = ''; close(); if (focus) input.focus();
    }
    function commit() { if (allowCustom && input.value.trim()) add(input.value, false); }
    input.addEventListener('input', paintResults); input.addEventListener('focus', paintResults);
    // Do not insert chips during pointer-down blur: moving the Save button
    // before pointer-up can cancel the click in Safari. Save commits pending text.
    input.addEventListener('blur', close);
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); if (!opened) paintResults(); if (!matches.length) return;
            active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
            [...menu.children].forEach((node, index) => node.setAttribute('aria-selected', String(index === active)));
            input.setAttribute('aria-activedescendant', `${id}Option${active}`); menu.children[active]?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter' || (allowCustom && event.key === ',')) {
            event.preventDefault(); if (opened && active >= 0) add(matches[active].value); else if (allowCustom) commit(); else if (opened && matches.length) add(matches[0].value);
        }
    });
    root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) close(); });
    paintChips();
    return { read(commitPending = false) { if (commitPending) commit(); return [...selected]; }, input, close };
}

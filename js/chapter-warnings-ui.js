/**
 * DOM helpers for content warning pickers (publish page, editor modal).
 */

import {
    CONTENT_WARNING_GROUPS,
    cloneWarningData,
    everyWarningCategoryHasAChoice,
    countNonNoneWarnings,
    toggleWarningChoice,
} from "./content-warnings.js";

/**
 * @param {HTMLElement} host
 * @param {{
 *   selections: Record<string, string[]>,
 *   onChange?: (selections: Record<string, string[]>) => void,
 *   openState?: Record<string, boolean>,
 *   compact?: boolean,
 * }} options
 * @returns {{ getSelections: () => Record<string, string[]>, setSelections: (next: Record<string, string[]>) => void, refresh: () => void }}
 */
export function mountWarningPicker(host, options) {
    let selections = cloneWarningData(options.selections);
    const openState = options.openState || {};
    const onChange = typeof options.onChange === "function" ? options.onChange : () => {};

    function render() {
        host.innerHTML = "";
        host.className = "warning-section" + (options.compact ? " warning-section-compact" : "");
        CONTENT_WARNING_GROUPS.forEach((group) => {
            if (!(group.key in openState)) openState[group.key] = false;
            const selected = selections[group.key] || [];
            const card = document.createElement("div");
            card.className = "warning-card";
            const header = document.createElement("button");
            header.type = "button";
            header.className = "warning-header";
            header.innerHTML = `<div class="warning-header-left"><div class="warning-title">${group.title}</div><div class="warning-subtitle">${group.subtitle}</div></div><div class="warning-header-state">${selected.length ? `${selected.length} selected` : "Choose at least one"} ${openState[group.key] ? "▲" : "▼"}</div>`;
            header.addEventListener("click", () => {
                openState[group.key] = !openState[group.key];
                render();
            });
            const body = document.createElement("div");
            body.className = "warning-body" + (openState[group.key] ? " open" : "");
            const note = document.createElement("div");
            note.className = "warning-note";
            note.textContent = "Pick “None” if nothing in this category applies. Otherwise choose one or more warning tags.";
            body.appendChild(note);
            const grid = document.createElement("div");
            grid.className = "check-grid";
            group.options.forEach((option) => {
                const item = document.createElement("label");
                item.className = "check-item";
                const input = document.createElement("input");
                input.type = "checkbox";
                input.checked = selected.includes(option);
                input.addEventListener("change", () => {
                    selections = toggleWarningChoice(selections, group.key, option);
                    onChange(cloneWarningData(selections));
                    render();
                });
                const span = document.createElement("span");
                span.textContent = option;
                item.append(input, span);
                grid.appendChild(item);
            });
            body.appendChild(grid);
            if (selected.length) {
                const preview = document.createElement("div");
                preview.className = "warning-selected-preview";
                selected.forEach((value) => {
                    const chip = document.createElement("div");
                    chip.className = "warning-preview-chip";
                    chip.textContent = value;
                    preview.appendChild(chip);
                });
                body.appendChild(preview);
            }
            card.append(header, body);
            host.appendChild(card);
        });
    }

    render();

    return {
        getSelections: () => cloneWarningData(selections),
        setSelections(next) {
            selections = cloneWarningData(next);
            render();
        },
        refresh: render,
    };
}

export { everyWarningCategoryHasAChoice, countNonNoneWarnings, cloneWarningData };
